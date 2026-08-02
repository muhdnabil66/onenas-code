import type { RelayClientMessage, RelayServerMessage } from "@onenas-code/protocol"
import { createHmac, timingSafeEqual } from "node:crypto"

type Claims = {
  sub: string
  device_id: string
  run_id?: string
  model?: string
  aud: string
  exp: number
}

type SocketData = {
  claims?: Claims
  abort?: AbortController
}

const port = Number(process.env.PORT ?? 8080)
const jwtSecret = process.env.ONENAS_RELAY_JWT_SECRET ?? ""
const parentOrigin = process.env.ATLASFLUX_PARENT_ORIGIN ?? "https://ai.atlasflux.my"
const serviceToken = process.env.ATLASFLUX_RELAY_SERVICE_TOKEN ?? ""

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

export function verifyRelayToken(token: string, now = Date.now()): Claims {
  if (!jwtSecret) throw new Error("Relay signing secret is not configured")
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("Invalid relay token")
  const header = parts[0]!
  const payload = parts[1]!
  const signature = parts[2]!
  const expected = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest()
  const actual = decodeBase64Url(signature)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid relay token")
  const metadata = JSON.parse(decodeBase64Url(header).toString("utf8")) as { alg?: string; typ?: string }
  if (metadata.alg !== "HS256" || metadata.typ !== "JWT") throw new Error("Invalid relay token")
  const claims = JSON.parse(decodeBase64Url(payload).toString("utf8")) as Claims
  if (claims.aud !== "onenas-code-relay") throw new Error("Invalid relay audience")
  if (!claims.sub || !claims.device_id || claims.exp * 1000 <= now) throw new Error("Expired relay token")
  return claims
}

function send(ws: Bun.ServerWebSocket<SocketData>, message: RelayServerMessage) {
  ws.send(JSON.stringify(message))
}

async function execute(ws: Bun.ServerWebSocket<SocketData>, message: Extract<RelayClientMessage, { type: "run.execute" }>) {
  const claims = ws.data.claims
  if (!claims) throw new Error("Authenticate first")
  if (claims.run_id && claims.run_id !== message.runId) throw new Error("Unauthorized run")
  if (claims.model && claims.model !== message.model) throw new Error("Unauthorized model")
  if (!serviceToken) throw new Error("Relay service token is not configured")

  ws.data.abort?.abort()
  const abort = new AbortController()
  ws.data.abort = abort
  const response = await fetch(`${parentOrigin}/api/desktop/onenas-code/run/execute`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceToken}`,
      "content-type": "application/json",
      "x-onenas-user": claims.sub,
      "x-onenas-device": claims.device_id,
    },
    body: JSON.stringify(message),
    signal: abort.signal,
  })
  if (!response.ok || !response.body) throw new Error(`AtlasFlux provider route returned ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const next = await reader.read()
    if (next.done) break
    send(ws, { type: "run.chunk", runId: message.runId, chunk: decoder.decode(next.value, { stream: true }) })
  }
  send(ws, { type: "run.done", runId: message.runId })
}

const server = Bun.serve<SocketData>({
  port,
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch(request, server) {
    const url = new URL(request.url)
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "onenas-code-relay" })
    }
    if (url.pathname !== "/connect") return new Response("Not found", { status: 404 })
    if (!server.upgrade(request, { data: {} })) return new Response("Upgrade required", { status: 426 })
  },
  websocket: {
    message(ws, raw) {
      if (typeof raw !== "string" || raw.length > 1_000_000) return ws.close(1009, "Message too large")
      let message: RelayClientMessage
      try {
        message = JSON.parse(raw) as RelayClientMessage
      } catch {
        return ws.close(1003, "Invalid JSON")
      }
      if (message.type === "authenticate") {
        try {
          ws.data.claims = verifyRelayToken(message.token)
          return send(ws, { type: "authenticated", deviceId: ws.data.claims.device_id })
        } catch (error) {
          return ws.close(1008, error instanceof Error ? error.message : "Unauthorized")
        }
      }
      if (message.type === "run.cancel") {
        if (!ws.data.claims || (ws.data.claims.run_id && ws.data.claims.run_id !== message.runId)) {
          return ws.close(1008, "Unauthorized run")
        }
        ws.data.abort?.abort()
        return
      }
      void execute(ws, message).catch((error) =>
        send(ws, {
          type: "run.error",
          runId: message.runId,
          error: error instanceof Error ? error.message : "Relay error",
        }),
      )
    },
    close(ws) {
      ws.data.abort?.abort()
    },
  },
})

console.log(`ONeNas Code relay listening on ${server.hostname}:${server.port}`)
