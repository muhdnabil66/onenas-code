import { createHash, randomBytes } from "node:crypto"
import { app, safeStorage, shell } from "electron"
import { getStore } from "./store"

const AUTH_STORE = "onenas-auth"
const TOKEN_KEY = "tokens"
const PENDING_KEY = "pending"
const BOOTSTRAP_KEY = "bootstrap"
const CALLBACK_URI = "onenas-code://auth/callback"

export type AtlasProfile = {
  id: string
  name?: string
  email?: string
}

export type AtlasModel = {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsReasoning?: boolean
  supportsTools?: boolean
}

export type AtlasBootstrap = {
  user: AtlasProfile
  plan: { id: string; name: string }
  credits: { balance: number; currency: "credits" }
  models: AtlasModel[]
  features: Record<string, boolean>
  relay: { url: string; token?: string; expiresAt?: string }
  minimumVersion: string
}

type Tokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

type Pending = {
  state: string
  verifier: string
  createdAt: number
}

export type AtlasAuthStatus = {
  authenticated: boolean
  online: boolean
  profile?: AtlasProfile
  parentOrigin: string
  error?: string
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

function base64url(value: Buffer) {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function parseJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => {
    throw new Error(`AtlasFlux AI returned an invalid response (${response.status})`)
  })
}

export class AtlasAuthController {
  private listeners = new Set<(status: AtlasAuthStatus) => void>()

  constructor(readonly parentOrigin = process.env.ONENAS_PARENT_ORIGIN ?? "https://ai.atlasflux.my") {}

  private store() {
    return getStore(AUTH_STORE)
  }

  private encrypt(value: unknown) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure token storage is unavailable on this device")
    }
    return safeStorage.encryptString(JSON.stringify(value)).toString("base64")
  }

  private decrypt<T>(key: string): T | undefined {
    const raw = this.store().get(key)
    if (typeof raw !== "string" || !raw) return
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw, "base64"))) as T
    } catch {
      this.store().delete(key)
      return
    }
  }

  private save(key: string, value: unknown) {
    this.store().set(key, this.encrypt(value))
  }

  private emit(status: AtlasAuthStatus) {
    for (const listener of this.listeners) listener(status)
  }

  subscribe(listener: (status: AtlasAuthStatus) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  reportError(error: unknown) {
    const status: AtlasAuthStatus = {
      authenticated: false,
      online: false,
      parentOrigin: this.parentOrigin,
      error: error instanceof Error ? error.message : "AtlasFlux authentication failed",
    }
    this.emit(status)
    return status
  }

  isCallback(value: string) {
    try {
      const url = new URL(value)
      return url.protocol === "onenas-code:" && url.hostname === "auth" && url.pathname === "/callback"
    } catch {
      return false
    }
  }

  async startLogin() {
    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash("sha256").update(verifier).digest())
    const pending: Pending = { state: base64url(randomBytes(24)), verifier, createdAt: Date.now() }
    this.save(PENDING_KEY, pending)
    const authorize = new URL("/desktop/authorize", this.parentOrigin)
    authorize.searchParams.set("client_id", "onenas-code")
    authorize.searchParams.set("redirect_uri", CALLBACK_URI)
    authorize.searchParams.set("response_type", "code")
    authorize.searchParams.set("code_challenge", challenge)
    authorize.searchParams.set("code_challenge_method", "S256")
    authorize.searchParams.set("state", pending.state)
    authorize.searchParams.set("app_version", app.getVersion())
    await shell.openExternal(authorize.toString())
    this.emit({
      authenticated: false,
      online: true,
      parentOrigin: this.parentOrigin,
    })
  }

  async handleCallback(value: string) {
    if (!this.isCallback(value)) return false
    const url = new URL(value)
    const pending = this.decrypt<Pending>(PENDING_KEY)
    this.store().delete(PENDING_KEY)
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") ?? "Sign in denied")
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) throw new Error("Sign-in request expired")
    if (url.searchParams.get("state") !== pending.state) throw new Error("Invalid sign-in state")
    const code = url.searchParams.get("code")
    if (!code) throw new Error("AtlasFlux AI did not return an authorization code")

    const response = await fetch(new URL("/api/desktop/onenas-code/token", this.parentOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: "onenas-code",
        code,
        code_verifier: pending.verifier,
        redirect_uri: CALLBACK_URI,
      }),
    })
    if (!response.ok) throw new Error((await response.text()) || `Sign in failed (${response.status})`)
    const token = await parseJson<TokenResponse>(response)
    this.save(TOKEN_KEY, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    } satisfies Tokens)
    await this.bootstrap(true)
    const status = await this.status()
    this.emit(status)
    return true
  }

  private async tokens() {
    const tokens = this.decrypt<Tokens>(TOKEN_KEY)
    if (!tokens) throw new Error("Sign in with AtlasFlux AI is required")
    if (tokens.expiresAt > Date.now() + 60_000) return tokens

    const response = await fetch(new URL("/api/desktop/onenas-code/token", this.parentOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: "onenas-code",
        refresh_token: tokens.refreshToken,
      }),
    })
    if (!response.ok) {
      this.store().delete(TOKEN_KEY)
      throw new Error("AtlasFlux AI session expired. Please sign in again.")
    }
    const token = await parseJson<TokenResponse>(response)
    const next: Tokens = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    }
    this.save(TOKEN_KEY, next)
    return next
  }

  async authorizedFetch(path: string, init: RequestInit = {}) {
    const tokens = await this.tokens()
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${tokens.accessToken}`)
    headers.set("x-onenas-desktop-version", app.getVersion())
    return fetch(new URL(path, this.parentOrigin), { ...init, headers })
  }

  async bootstrap(force = false): Promise<AtlasBootstrap> {
    if (!force) {
      const cached = this.decrypt<AtlasBootstrap>(BOOTSTRAP_KEY)
      if (cached) return cached
    }
    const response = await this.authorizedFetch("/api/desktop/onenas-code/bootstrap")
    if (!response.ok) throw new Error((await response.text()) || `Bootstrap failed (${response.status})`)
    const bootstrap = await parseJson<AtlasBootstrap>(response)
    this.save(BOOTSTRAP_KEY, bootstrap)
    return bootstrap
  }

  cachedBootstrap() {
    return this.decrypt<AtlasBootstrap>(BOOTSTRAP_KEY)
  }

  async status(): Promise<AtlasAuthStatus> {
    try {
      await this.tokens()
      const bootstrap = await this.bootstrap().catch(() => this.cachedBootstrap())
      return {
        authenticated: true,
        online: true,
        profile: bootstrap?.user,
        parentOrigin: this.parentOrigin,
      }
    } catch (error) {
      const cachedTokens = this.decrypt<Tokens>(TOKEN_KEY)
      const cachedBootstrap = this.cachedBootstrap()
      if (cachedTokens && cachedBootstrap) {
        return {
          authenticated: true,
          online: false,
          profile: cachedBootstrap.user,
          parentOrigin: this.parentOrigin,
          error: "AtlasFlux AI is unavailable. Local files and sessions remain available; new AI runs are disabled.",
        }
      }
      return {
        authenticated: false,
        online: false,
        parentOrigin: this.parentOrigin,
        error:
          error instanceof Error && error.message !== "Sign in with AtlasFlux AI is required"
            ? error.message
            : undefined,
      }
    }
  }

  async signOut() {
    try {
      await this.authorizedFetch("/api/desktop/onenas-code/revoke", { method: "POST" })
    } catch {}
    this.store().clear()
    const status = await this.status()
    this.emit(status)
    return status
  }
}
