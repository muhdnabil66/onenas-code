import crypto from "node:crypto"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const PARENT_ORIGIN = process.env.ONENAS_PARENT_ORIGIN || "https://ai.atlasflux.my"
const CLIENT_ID = "onenas-code"
const REDIRECT_PORT = 43210
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
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

export function saveTokens(tokens: AuthTokens) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
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

export async function exchangeCode(code: string, codeVerifier: string): Promise<AuthTokens> {
  const res = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  const tokens: AuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 900) * 1000,
  }
  saveTokens(tokens)
  return tokens
}

export async function login(): Promise<AuthTokens> {
  const { verifier, challenge } = generatePKCE()
  const state = generateState()

  const authUrl = new URL(`${PARENT_ORIGIN}/desktop/authorize`)
  authUrl.searchParams.set("client_id", CLIENT_ID)
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI)
  authUrl.searchParams.set("code_challenge", challenge)
  authUrl.searchParams.set("code_challenge_method", "S256")
  authUrl.searchParams.set("state", state)

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${REDIRECT_PORT}`)

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code")
        const returnedState = url.searchParams.get("state")

        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" })
          res.end("<h1>Authentication failed</h1><p>Invalid or expired request.</p>")
          server.close()
          reject(new Error("Invalid auth callback"))
          return
        }

        try {
          const tokens = await exchangeCode(code, verifier)
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          res.end("<h1>ONeNas Code</h1><p>Login successful! You can close this window and return to the terminal.</p>")
          server.close()
          resolve(tokens)
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
          res.end(`<h1>Login failed</h1><p>${err?.message ?? String(err)}</p>`)
          server.close()
          reject(err)
        }
        return
      }

      res.writeHead(404)
      res.end("Not found")
    })

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      console.log(`\n  Opening browser for AtlasFlux login...\n`)
      console.log(`  If browser doesn't open, visit:\n`)
      console.log(`  ${authUrl.toString()}\n`)

      import("open").then((open) => {
        open.default(authUrl.toString()).catch(() => {})
      }).catch(() => {
        console.log(`  (Install 'open' package to auto-open browser: npm i -g open)`)
      })
    })

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.error(`\n  Port ${REDIRECT_PORT} is in use. Close other apps using it and try again.\n`)
      }
      reject(err)
    })
  })
}
