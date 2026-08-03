import crypto from "node:crypto"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import open from "open"

const PARENT_ORIGIN = process.env.ONENAS_PARENT_ORIGIN || "https://ai.atlasflux.my"
const CLIENT_ID = "onenas-code"
const REDIRECT_PORT = 43210
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const TOKEN_FILE = path.join(os.homedir(), ".onenas-code", "auth.json")

type AuthTokens = {
  access_token: string
  refresh_token?: string
  expires_at: number
}

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function authUrl() {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))
  const url = new URL(`${PARENT_ORIGIN}/desktop/authorize`)
  url.searchParams.set("client_id", CLIENT_ID)
  url.searchParams.set("redirect_uri", REDIRECT_URI)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", state)
  return { verifier, state, url }
}

function saveTokens(tokens: AuthTokens) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
}

export function logout() {
  try {
    fs.unlinkSync(TOKEN_FILE)
  } catch {
    // The user is already logged out when the token file is absent.
  }
}

export async function login() {
  const { verifier, state, url } = authUrl()

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const callback = new URL(request.url || "/", `http://127.0.0.1:${REDIRECT_PORT}`)
      if (callback.pathname !== "/callback") {
        response.writeHead(404)
        response.end("Not found")
        return
      }

      const code = callback.searchParams.get("code")
      if (!code || callback.searchParams.get("state") !== state) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" })
        response.end("<h1>Authorization failed</h1><p>Invalid or expired request.</p>")
        server.close()
        reject(new Error("Invalid authorization callback"))
        return
      }

      try {
        const result = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code,
            code_verifier: verifier,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
          }),
        })
        if (!result.ok) throw new Error(`Token exchange failed: ${result.status} ${await result.text()}`)
        const data = (await result.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
        saveTokens({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in || 900) * 1000,
        })
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        response.end("<h1>ONeNas Code</h1><p>Authorization successful. You can return to the terminal.</p>")
        server.close()
        resolve()
      } catch (error) {
        response.writeHead(500, { "content-type": "text/html; charset=utf-8" })
        response.end(`<h1>Authorization failed</h1><p>${error instanceof Error ? error.message : String(error)}</p>`)
        server.close()
        reject(error)
      }
    })

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      void open(url.toString()).catch(() => undefined)
    })
    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") reject(new Error(`Authorization port ${REDIRECT_PORT} is already in use`))
      else reject(error)
    })
  })
}
