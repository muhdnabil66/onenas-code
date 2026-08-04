import crypto from "node:crypto"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const PARENT_ORIGIN = process.env.ONENAS_PARENT_ORIGIN || "https://ai.atlasflux.my"
const CLIENT_ID = "onenas-code"
const BASE_REDIRECT_PORT = 43210
const MAX_PORT_RETRIES = 10
const REDIRECT_URI = (port: number) => `http://127.0.0.1:${port}/callback`
const TOKEN_DIR = path.join(os.homedir(), ".onenas-code")
const TOKEN_FILE = path.join(TOKEN_DIR, "auth.json")

export interface AuthTokens {
  access_token: string
  refresh_token?: string
  expires_at: number
}

export interface BootstrapData {
  user: { id: string; name?: string; email?: string }
  plan: { id: string; name: string }
  credits: { balance: number; currency: string }
  models: Array<{
    id: string
    name: string
    contextWindow?: number
    maxOutputTokens?: number
    supportsTools?: boolean
    supportsReasoning?: boolean
  }>
  relay?: { url: string }
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

function generateState() {
  return base64url(crypto.randomBytes(16))
}

export function loadTokens(): AuthTokens | null {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"))
    if (data.access_token && data.expires_at > Date.now()) return data
    return null
  } catch {
    return null
  }
}

function loadTokensRaw(): AuthTokens | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as AuthTokens
  } catch {
    return null
  }
}

export function saveTokens(tokens: AuthTokens) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
}

export async function refreshTokens(saved: AuthTokens): Promise<AuthTokens | null> {
  if (!saved?.refresh_token) return null
  const res = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: saved.refresh_token,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  if (!data.access_token) return null
  const next: AuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || saved.refresh_token,
    expires_at: Date.now() + (data.expires_in || 900) * 1000,
  }
  saveTokens(next)
  return next
}

export async function getValidTokens(): Promise<AuthTokens | null> {
  const current = loadTokens()
  if (current) return current
  const saved = loadTokensRaw()
  if (!saved?.access_token) return null
  try {
    return await refreshTokens(saved)
  } catch {
    return null
  }
}

export function clearTokens() {
  try {
    fs.unlinkSync(TOKEN_FILE)
  } catch {}
}

export async function fetchBootstrap(token: string): Promise<BootstrapData> {
  const res = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Bootstrap failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<BootstrapData>
}

export async function exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<AuthTokens> {
  const res = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error("Unable to complete login")
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  const tokens: AuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 900) * 1000,
  }
  saveTokens(tokens)
  return tokens
}

export function login(): Promise<AuthTokens> {
  return new Promise((resolve, reject) => {
    const attemptPort = (attempt: number) => {
      const port = BASE_REDIRECT_PORT + attempt
      const redirectUri = REDIRECT_URI(port)
      const { verifier, challenge } = generatePKCE()
      const state = generateState()

      const authUrl = new URL(`${PARENT_ORIGIN}/desktop/authorize`)
      authUrl.searchParams.set("client_id", CLIENT_ID)
      authUrl.searchParams.set("redirect_uri", redirectUri)
      authUrl.searchParams.set("code_challenge", challenge)
      authUrl.searchParams.set("code_challenge_method", "S256")
      authUrl.searchParams.set("state", state)

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || "/", redirectUri)

        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code")
          const returnedState = url.searchParams.get("state")

          if (!code || returnedState !== state) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
            res.end("<h1>Login failed</h1><p>Invalid or expired request.</p>")
            server.close()
            reject(new Error("Invalid auth callback"))
            return
          }

          try {
            const tokens = await exchangeCode(code, verifier, redirectUri)
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
            res.end("<h1>ONeNas Code</h1><p>Login successful! Close this window and return to the terminal.</p>")
            server.close()
            resolve(tokens)
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
            res.end("<h1>Login failed</h1><p>Something went wrong. Please try again.</p>")
            server.close()
            reject(err)
          }
          return
        }

        res.writeHead(404)
        res.end("Not found")
      })

      server.listen(port, "127.0.0.1", () => {
        console.log("")
        console.log("  Opening browser for AtlasFlux login...")
        console.log("")
        console.log("  If browser doesn't open, visit:")
        console.log(`  ${authUrl.toString()}`)
        console.log("")
        void import("open").then((mod) => {
          mod.default(authUrl.toString()).catch(() => {})
        }).catch(() => {
          console.log("  (Install 'open' package to auto-open browser: npm i -g open)")
        })
      })

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          if (attempt + 1 < MAX_PORT_RETRIES) {
            server.close()
            attemptPort(attempt + 1)
            return
          }
          reject(new Error("Unable to find an available port for login. Please free up port 43210 and try again."))
          return
        }
        reject(new Error("Unable to start login. Please try again."))
      })
    }
    attemptPort(0)
  })
}
