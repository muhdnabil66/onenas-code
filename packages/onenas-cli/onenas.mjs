#!/usr/bin/env node
import crypto from "node:crypto"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync, spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VERSION = "0.3.1"
const PARENT_ORIGIN = process.env.ONENAS_PARENT_ORIGIN || "https://ai.atlasflux.my"
const CLIENT_ID = "onenas-code"
const REDIRECT_PORT = 43210
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const TOKEN_DIR = path.join(os.homedir(), ".onenas-code")
const TOKEN_FILE = path.join(TOKEN_DIR, "auth.json")
const LOG_FILE = path.join(TOKEN_DIR, "bridge.log")

function log(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`)
  } catch {}
}

function base64url(buf) {
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

function loadTokens() {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"))
    if (data.access_token && data.expires_at > Date.now()) return data
    return null
  } catch { return null }
}

function saveTokens(tokens) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
}

function clearTokens() {
  try { fs.unlinkSync(TOKEN_FILE) } catch {}
}

async function fetchBootstrap(token) {
  const res = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Bootstrap failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function exchangeCode(code, codeVerifier) {
  const res = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 900) * 1000 }
  saveTokens(tokens)
  return tokens
}

function openBrowser(url) {
  const platform = process.platform
  try {
    if (platform === "win32") execFileSync("explorer.exe", [url], { stdio: "ignore" })
    else if (platform === "darwin") execFileSync("open", [url], { stdio: "ignore" })
    else execFileSync("xdg-open", [url], { stdio: "ignore" })
  } catch {}
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function authPage({ success, title, message, detail = "" }) {
  const color = success ? "#FF1493" : "#FF3333"
  const closeScript = success ? "window.setTimeout(() => window.close(), 1200);" : ""
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - ONeNas Code</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh; margin: 0; display: grid; place-items: center;
        padding: 24px; color: #f7f7fb; background: #09090d;
        font: 15px/1.6 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
      }
      main {
        width: min(100%, 440px); padding: 38px 34px 32px; text-align: center;
        border: 1px solid #292933; border-radius: 24px; background: #111117;
        box-shadow: 0 24px 80px rgba(0,0,0,.45);
      }
      .mark {
        width: 56px; height: 56px; margin: 0 auto 22px; display: grid; place-items: center;
        border-radius: 16px; color: white; font-size: 21px; font-weight: 800;
        letter-spacing: -1px; background: linear-gradient(135deg, #FF3333, #FF1493);
      }
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
      <h1>${escapeHtml(title)}</h1>
      <p class="message">${escapeHtml(message)}</p>
      ${detail ? `<p class="detail">${escapeHtml(detail)}</p>` : ""}
      <button type="button" onclick="window.close()">Close window</button>
    </main>
    <script>${closeScript}</script>
  </body>
</html>`
}

function login() {
  const { verifier, challenge } = generatePKCE()
  const state = generateState()
  const authUrl = `${PARENT_ORIGIN}/desktop/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${REDIRECT_PORT}`)
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code")
        const returnedState = url.searchParams.get("state")
        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" })
          res.end("<h1>Login failed - invalid request</h1>")
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
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
          res.end(authPage({
            success: false,
            title: "Login failed",
            message: "ONeNas Code could not complete the login.",
            detail: err instanceof Error ? err.message : String(err),
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
      console.log("")
      console.log("  Opening browser for AtlasFlux login...")
      console.log("")
      console.log("  If browser doesn't open, visit:")
      console.log(`  ${authUrl}`)
      console.log("")
      openBrowser(authUrl)
    })

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") console.error(`\n  Port ${REDIRECT_PORT} is busy. Close other apps and try again.\n`)
      reject(err)
    })
  })
}

function managedProviderConfig(bridgeUrl, bootstrap) {
  const models = Object.fromEntries(
    (bootstrap?.models || []).map((model) => [
      model.id,
      {
        name: model.name,
        tool_call: model.supportsTools !== false,
        reasoning: model.supportsReasoning === true,
        limit: model.contextWindow || model.maxOutputTokens
          ? { context: model.contextWindow, output: model.maxOutputTokens }
          : undefined,
      },
    ]),
  )
  const defaultModel = Object.keys(models)[0]
  return {
    ...(defaultModel ? { model: `atlasflux/${defaultModel}` } : {}),
    provider: {
      atlasflux: {
        npm: "@ai-sdk/openai-compatible",
        name: "AtlasFlux AI",
        options: { baseURL: `${bridgeUrl}/v1`, apiKey: "managed-by-atlasflux" },
        models,
      },
    },
  }
}

async function startBridge(getToken) {
  const { WebSocket } = await import("ws")

  const server = http.createServer(async (request, response) => {
    log(`REQUEST ${request.method} ${request.url}`)
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ ok: true }))
      return
    }
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: { message: "Not found" } }))
      return
    }

    const token = getToken()
    if (!token) {
      response.writeHead(401, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: { message: "Not authenticated" } }))
      return
    }

    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"))
      log(`CHAT model=${payload.model} stream=${payload.stream} messages=${payload.messages?.length}`)
      if (!payload.model) {
        response.writeHead(400, { "content-type": "application/json" })
        response.end(JSON.stringify({ error: { message: "A model is required" } }))
        return
      }

      const idempotencyKey = crypto.randomUUID()
      const approvalRes = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "idempotency-key": idempotencyKey },
        body: JSON.stringify({ model: payload.model, idempotencyKey }),
      })
      if (!approvalRes.ok) {
        const msg = (await approvalRes.text()) || "AtlasFlux AI is unavailable"
        response.writeHead(approvalRes.status, { "content-type": "application/json" })
        response.end(JSON.stringify({ error: { message: msg } }))
        return
      }
      const approval = await approvalRes.json()

      response.writeHead(200, {
        "content-type": payload.stream ? "text/event-stream" : "application/json",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })

      const relay = new WebSocket(approval.relay.url)
      let authenticated = false
      let finished = false

      const close = () => { if (finished) return; finished = true; relay.close(); response.end() }

      response.once("close", () => {
        if (finished) return
        if (relay.readyState === WebSocket.OPEN) relay.send(JSON.stringify({ type: "run.cancel", runId: approval.runId }))
        close()
      })

      relay.addEventListener("open", () => {
        log("RELAY open, authenticating...")
        relay.send(JSON.stringify({ type: "authenticate", token: approval.relay.token }))
      })

      relay.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data))
        log(`RELAY msg: ${message.type}`)
        if (message.type === "authenticated") {
          authenticated = true
          relay.send(JSON.stringify({ type: "run.execute", runId: approval.runId, model: payload.model, payload }))
          return
        }
        if (!authenticated || message.runId !== approval.runId) return
        if (message.type === "run.chunk" && message.chunk) response.write(message.chunk)
        if (message.type === "run.done") close()
        if (message.type === "run.error") {
          if (!response.headersSent) {
            response.writeHead(502, { "content-type": "application/json" })
            response.end(JSON.stringify({ error: { message: message.error || "Relay error" } }))
          }
          close()
        }
      })

      relay.addEventListener("error", (err) => {
        log(`RELAY error: ${err.message || err}`)
        if (!response.headersSent) {
          response.writeHead(503, { "content-type": "application/json" })
          response.end(JSON.stringify({ error: { message: "AtlasFlux relay is unavailable" } }))
        }
        close()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "AtlasFlux AI is unavailable."
      if (!response.headersSent) {
        response.writeHead(503, { "content-type": "application/json" })
        response.end(JSON.stringify({ error: { message } }))
      } else {
        response.end()
      }
    }
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  log(`BRIDGE LISTENING http://127.0.0.1:${port}`)
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  }
}

function findOpencodeBinary() {
  const exe = process.platform === "win32" ? ".exe" : ""
  const candidates = [
    path.join(__dirname, "resources", `opencode${exe}`),
    path.join(__dirname, "../opencode/dist/opencode-windows-x64/bin/opencode.exe"),
    path.join(__dirname, "../opencode/dist/opencode-windows-x64/bin/opencode"),
    path.join(__dirname, "../desktop/resources/opencode-cli.exe"),
    path.join(__dirname, "../opencode/bin/opencode"),
  ]
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch {}
  }
  try {
    const cmd = process.platform === "win32" ? "where" : "which"
    return execFileSync(cmd, ["opencode"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n")[0]
  } catch { return null }
}

function showHelp() {
  console.log(`
  ONeNas Code by AtlasFlux v${VERSION}

  Usage:
    onenas                  Start the TUI agent
    onenas login            Sign in to AtlasFlux AI
    onenas logout           Sign out
    onenas account          Show account details and balance
    onenas balance          Show remaining credits
    onenas models           List available models
    onenas sync             Refresh account and model data
    onenas help             Show this help

  Environment:
    ONENAS_PARENT_ORIGIN    AtlasFlux parent URL (default: https://ai.atlasflux.my)
  `)
}

function formatBalance(balance) {
  if (!balance) return "0"
  if (typeof balance === "object") return `${balance.balance ?? 0} ${balance.currency ?? ""}`.trim()
  return String(balance)
}

async function printAccount(tokens, { detail = true } = {}) {
  const bootstrap = await fetchBootstrap(tokens.access_token)
  const user = bootstrap.user || {}
  const plan = bootstrap.plan || {}
  const credits = bootstrap.credits || {}
  console.log(`\n  Signed in as: ${user.name || user.id || "unknown"}`)
  console.log(`  Email: ${user.email || "-"}`)
  console.log(`  Plan: ${plan.name || "-"}`)
  if (detail) {
    console.log(`  Credits: ${credits.balance ?? 0} ${credits.currency || ""}`)
    console.log(`  Models: ${(bootstrap.models || []).length} available`)
    console.log(`  Workspace: ${bootstrap.workspace?.id || "-"}`)
    console.log(`  Account ID: ${user.id || "-"}`)
  }
  console.log()
  return bootstrap
}

async function main() {
  const command = process.argv[2]

  if (command === "help" || command === "--help" || command === "-h") { showHelp(); return }

  if (command === "--version" || command === "-v") { console.log(VERSION); return }

  if (command === "logout") { clearTokens(); console.log("\n  Signed out.\n"); return }

  if (command === "login") {
    const tokens = await login()
    const bootstrap = await fetchBootstrap(tokens.access_token)
    console.log(`\n  Signed in as: ${bootstrap.user.name || bootstrap.user.id}`)
    console.log(`  Plan: ${bootstrap.plan.name}`)
    console.log(`  Credits: ${bootstrap.credits.balance} ${bootstrap.credits.currency}\n`)
    return
  }

  let tokens = loadTokens()
  if (!tokens) {
    console.log("\n  Not signed in. Opening AtlasFlux login...\n")
    tokens = await login()
  }

  if (command === "status" || command === "account") {
    await printAccount(tokens)
    return
  }

  if (command === "balance") {
    const bootstrap = await fetchBootstrap(tokens.access_token)
    const credits = bootstrap.credits || {}
    console.log(`\n  Credits: ${credits.balance ?? 0} ${credits.currency || ""}`)
    console.log(`  Plan: ${(bootstrap.plan || {}).name || "-"}\n`)
    return
  }

  if (command === "sync") {
    const bootstrap = await fetchBootstrap(tokens.access_token)
    console.log(`\n  Synced with AtlasFlux AI: ${(bootstrap.models || []).length} models, ${formatBalance(bootstrap.credits)} credits\n`)
    return
  }

  if (command === "models") {
    const bootstrap = await fetchBootstrap(tokens.access_token)
    console.log("\n  Available models:\n")
    for (const m of bootstrap.models) {
      const ctx = m.contextWindow ? ` (${Math.round(m.contextWindow / 1000)}k ctx)` : ""
      console.log(`    ${m.id} - ${m.name}${ctx}`)
    }
    console.log()
    return
  }

  // Default: start TUI
  const bridge = await startBridge(() => loadTokens()?.access_token ?? null)
  const bootstrap = await fetchBootstrap(tokens.access_token)
  const config = managedProviderConfig(bridge.url, bootstrap)
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
  log(`CONFIG baseURL=${config.provider.atlasflux.options.baseURL} models=${Object.keys(config.provider.atlasflux.models).join(",")}`)

  const binary = findOpencodeBinary()
  if (!binary) {
    console.error("\n  OpenCode binary not found. Run from onenas-code repo root.\n")
    await bridge.stop()
    process.exit(1)
  }

  console.log(`\n  ONeNas Code by AtlasFlux`)
  console.log(`  Signed in: ${bootstrap.user.name || bootstrap.user.id}`)
  console.log(`  Credits: ${bootstrap.credits.balance}`)
  console.log(`  Starting agent...\n`)

  const args = process.argv.slice(2).filter(
    (a) => !["login", "logout", "status", "account", "balance", "sync", "models", "help"].includes(a),
  )
  await new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: "inherit", env: { ...process.env } })
    child.on("exit", (code) => resolve(code ?? 1))
  })
  await bridge.stop()
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`)
  process.exit(1)
})
