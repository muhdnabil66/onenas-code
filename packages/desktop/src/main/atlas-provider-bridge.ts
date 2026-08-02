import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"
import type { AtlasAuthController, AtlasBootstrap } from "./atlas-auth"

type ApprovedRun = {
  runId: string
  relay: { url: string; token: string }
}

type ProviderPayload = {
  model?: string
  stream?: boolean
  user?: string
  messages?: Array<{ role?: string; content?: unknown }>
}

function messageText(content: unknown) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const value = part as { type?: string; text?: string }
      return value.type === "text" && typeof value.text === "string" ? value.text : ""
    })
    .filter(Boolean)
    .join("\n")
}

function promptText(payload: ProviderPayload) {
  const user = [...(payload.messages ?? [])].reverse().find((message) => message.role === "user")
  return messageText(user?.content).slice(0, 32_000)
}

function sessionId(payload: ProviderPayload, runId: string) {
  if (/^[A-Za-z0-9_-]{8,128}$/.test(payload.user ?? "")) return payload.user!
  return `session_${runId.replace(/-/g, "")}`
}

function assistantDelta(chunk: string) {
  let output = ""
  const candidates = chunk.includes("\ndata:") || chunk.startsWith("data:")
    ? chunk.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())
    : [chunk]
  for (const candidate of candidates) {
    if (!candidate || candidate === "[DONE]") continue
    try {
      const parsed = JSON.parse(candidate) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
      }
      output += parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? ""
    } catch {}
  }
  return output
}

async function syncHistory(
  auth: AtlasAuthController,
  approval: ApprovedRun,
  payload: ProviderPayload,
  phase: "prompt" | "assistant",
  assistant = "",
) {
  const id = sessionId(payload, approval.runId)
  const runKey = approval.runId.replace(/-/g, "")
  const prompt = promptText(payload)
  if (phase === "prompt") {
    await auth.authorizedFetch("/api/desktop/onenas-code/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        title: prompt.slice(0, 120) || "ONeNas Code session",
        workspaceLabel: "Local workspace",
      }),
    })
  }
  const events =
    phase === "prompt"
      ? [{ id: `event_user_${runKey}`, sessionId: id, type: "user_text", data: { text: prompt } }]
      : [
          {
            id: `event_assistant_${runKey}`,
            sessionId: id,
            type: "assistant_text",
            data: { text: assistant.slice(0, 32_000) },
          },
          { id: `event_done_${runKey}`, sessionId: id, type: "done", data: {} },
        ]
  await auth.authorizedFetch("/api/desktop/onenas-code/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: approval.runId, events }),
  })
}

function body(request: IncomingMessage, limit = 4_000_000) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error("Request too large"))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(value))
}

export function managedProviderConfig(bridgeUrl: string, bootstrap?: AtlasBootstrap) {
  const models = Object.fromEntries(
    (bootstrap?.models ?? []).map((model) => [
      model.id,
      {
        name: model.name,
        tool_call: model.supportsTools ?? true,
        reasoning: model.supportsReasoning ?? false,
        limit:
          model.contextWindow || model.maxOutputTokens
            ? {
                context: model.contextWindow,
                output: model.maxOutputTokens,
              }
            : undefined,
      },
    ]),
  )
  return {
    enabled_providers: ["atlasflux"],
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

export async function startAtlasProviderBridge(auth: AtlasAuthController) {
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true })
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      return json(response, 404, { error: { message: "Not found" } })
    }

    try {
      const payload = JSON.parse(await body(request)) as ProviderPayload
      if (!payload.model) return json(response, 400, { error: { message: "A model is required" } })
      const idempotencyKey = randomUUID()
      const approvalResponse = await auth.authorizedFetch("/api/desktop/onenas-code/run", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ model: payload.model, idempotencyKey }),
      })
      if (!approvalResponse.ok) {
        const message = (await approvalResponse.text()) || "AtlasFlux AI is unavailable"
        return json(response, approvalResponse.status, { error: { message } })
      }
      const approval = (await approvalResponse.json()) as ApprovedRun
      void syncHistory(auth, approval, payload, "prompt").catch(() => undefined)

      response.writeHead(200, {
        "content-type": payload.stream ? "text/event-stream" : "application/json",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })

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
        if (message.type === "run.done") {
          void syncHistory(auth, approval, payload, "assistant", assistant).catch(() => undefined)
          close()
        }
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
      const message =
        error instanceof Error ? error.message : "AtlasFlux AI is unavailable. New AI runs are disabled."
      if (!response.headersSent) return json(response, 503, { error: { message } })
      response.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
