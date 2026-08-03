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

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function authPage(input: { success: boolean; title: string; message: string; detail?: string }): string {
  const color = input.success ? "#FF1493" : "#FF3333"
  const closeScript = input.success ? "window.setTimeout(() => window.close(), 1200);" : ""
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)} - ONeNas Code</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; color: #f7f7fb; background: #09090d; font: 15px/1.6 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
      main { width: min(100%, 440px); padding: 38px 34px 32px; text-align: center; border: 1px solid #292933; border-radius: 24px; background: #111117; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
      .mark { width: 56px; height: 56px; margin: 0 auto 22px; display: grid; place-items: center; border-radius: 16px; color: white; font-size: 21px; font-weight: 800; letter-spacing: -1px; background: linear-gradient(135deg, #FF3333, #FF1493); }
      .eyebrow { margin: 0 0 7px; color: #9696a5; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 0; font-size: 25px; letter-spacing: -.03em; }
      .message { margin: 12px 0 0; color: #c8c8d2; }
      .detail { margin: 20px 0 0; color: #777786; font-size: 13px; }
      button { margin-top: 25px; padding: 10px 18px; border: 0; border-radius: 10px; color: white; background: ${color}; font: inherit; font-weight: 700; cursor: pointer; }
      button:hover { filter: brightness(1.1); }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">ON</div>
      <p class="eyebrow">ONeNas Code</p>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="message">${escapeHtml(input.message)}</p>
      ${input.detail ? `<p class="detail">${escapeHtml(input.detail)}</p>` : ""}
      <button type="button" onclick="window.close()">Close window</button>
    </main>
    <script>${closeScript}</script>
  </body>
</html>`
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
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
          res.end(authPage({
            success: true,
            title: "Login successful",
            message: "Your AtlasFlux account is connected.",
            detail: "Return to the terminal to start using ONeNas Code.",
          }))
          server.close()
          resolve(tokens)
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
          res.end(authPage({
            success: false,
            title: "Login failed",
            message: "ONeNas Code could not complete the login.",
            detail: err?.message ?? String(err),
          }))
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
