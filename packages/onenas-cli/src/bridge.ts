import http from "node:http"
import crypto from "node:crypto"

const PARENT_ORIGIN = process.env.ONENAS_PARENT_ORIGIN || "https://ai.atlasflux.my"

type ApprovedRun = {
  runId: string
  relay: { url: string; token: string }
}

type ProviderPayload = {
  model?: string
  stream?: boolean
  messages?: Array<{ role?: string; content?: unknown }>
}

function promptText(payload: ProviderPayload): string {
  const user = [...(payload.messages ?? [])].reverse().find((m) => m.role === "user")
  if (!user) return ""
  const content = user.content
  if (typeof content === "string") return content.slice(0, 32000)
  if (!Array.isArray(content)) return ""
  return content
    .map((part: any) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 32000)
}

function assistantDelta(chunk: string): string {
  let output = ""
  const candidates = chunk.includes("\ndata:") || chunk.startsWith("data:")
    ? chunk.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())
    : [chunk]
  for (const candidate of candidates) {
    if (!candidate || candidate === "[DONE]") continue
    try {
      const parsed = JSON.parse(candidate)
      output += parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? ""
    } catch {}
  }
  return output
}

function json(response: http.ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(value))
}

async function body(request: http.IncomingMessage, limit = 4_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) { reject(new Error("Request too large")); request.destroy(); return }
      chunks.push(chunk)
    })
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

export async function startProviderBridge(getToken: () => string | null): Promise<{ url: string; stop: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true })
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      return json(response, 404, { error: { message: "Not found" } })
    }

    const token = getToken()
    if (!token) return json(response, 401, { error: { message: "Not authenticated. Run 'onenas login' first." } })

    try {
      const payload = JSON.parse(await body(request)) as ProviderPayload
      if (!payload.model) return json(response, 400, { error: { message: "A model is required" } })

      const idempotencyKey = crypto.randomUUID()
      const approvalRes = await fetch(`${PARENT_ORIGIN}/api/desktop/onenas-code/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ model: payload.model, idempotencyKey }),
      })
      if (!approvalRes.ok) {
        const msg = (await approvalRes.text()) || "AtlasFlux AI is unavailable"
        return json(response, approvalRes.status, { error: { message: msg } })
      }
      const approval = (await approvalRes.json()) as ApprovedRun

      response.writeHead(200, {
        "content-type": payload.stream ? "text/event-stream" : "application/json",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })

      const WebSocket = (await import("ws")).default
      const relay = new WebSocket(approval.relay.url)
      let authenticated = false
      let finished = false
      let assistant = ""

      const close = () => {
        if (finished) return
        finished = true
        relay.close()
        response.end()
      }

      response.once("close", () => {
        if (finished) return
        if (relay.readyState === WebSocket.OPEN) {
          relay.send(JSON.stringify({ type: "run.cancel", runId: approval.runId }))
        }
        close()
      })

      relay.addEventListener("open", () => {
        relay.send(JSON.stringify({ type: "authenticate", token: approval.relay.token }))
      })

      relay.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: string
          runId?: string
          chunk?: string
          error?: string
        }
        if (message.type === "authenticated") {
          authenticated = true
          relay.send(JSON.stringify({ type: "run.execute", runId: approval.runId, model: payload.model, payload }))
          return
        }
        if (!authenticated || message.runId !== approval.runId) return
        if (message.type === "run.chunk" && message.chunk) {
          assistant += assistantDelta(message.chunk)
          response.write(message.chunk)
        }
        if (message.type === "run.done") close()
        if (message.type === "run.error") {
          if (!response.headersSent) return json(response, 502, { error: { message: message.error ?? "Relay error" } })
          response.write(`data: ${JSON.stringify({ error: { message: message.error ?? "Relay error" } })}\n\n`)
          close()
        }
      })

      relay.addEventListener("error", () => {
        if (!response.headersSent) json(response, 503, { error: { message: "AtlasFlux relay is unavailable" } })
        close()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "AtlasFlux AI is unavailable."
      if (!response.headersSent) json(response, 503, { error: { message } })
      response.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })

  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}`

  return {
    url,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export function managedProviderConfig(bridgeUrl: string, bootstrap?: { models?: Array<{
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsReasoning?: boolean
  pricing?: { inputPerMillionUsd?: number; outputPerMillionUsd?: number }
}> }) {
  const models = Object.fromEntries(
    (bootstrap?.models ?? []).map((model) => [
      model.id,
      {
        name: model.name,
        tool_call: model.supportsTools ?? true,
        reasoning: model.supportsReasoning ?? false,
        limit: model.contextWindow || model.maxOutputTokens
          ? { context: model.contextWindow, output: model.maxOutputTokens }
          : undefined,
        cost: model.pricing
          ? {
              input: model.pricing.inputPerMillionUsd ?? 0,
              output: model.pricing.outputPerMillionUsd ?? 0,
              cache: {
                read: model.pricing.inputPerMillionUsd ?? 0,
                write: model.pricing.inputPerMillionUsd ?? 0,
              },
            }
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
