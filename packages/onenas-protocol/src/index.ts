export const PRODUCT_ID = "onenas-code" as const
export const PRODUCT_NAME = "ONeNas Code by AtlasFlux" as const
export const PARENT_ORIGIN = "https://ai.atlasflux.my" as const
export const CALLBACK_URI = "onenas-code://auth/callback" as const

export type BootstrapModel = {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsReasoning?: boolean
  supportsTools?: boolean
}

export type DesktopBootstrap = {
  user: { id: string; name?: string; email?: string }
  plan: { id: string; name: string }
  credits: { balance: number; currency: "credits" }
  models: BootstrapModel[]
  features: Record<string, boolean>
  relay: { url: string; token: string; expiresAt: string }
  minimumVersion: string
}

export type LocalTimelineEvent = {
  id: string
  runId: string
  sessionId: string
  type:
    | "reasoning"
    | "tool_call"
    | "file_change"
    | "approval"
    | "user_text"
    | "assistant_text"
    | "done"
    | "error"
  createdAt: string
  data: Record<string, unknown>
}

const windowsAbsolutePath = /\b[A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]*/g
const unixAbsolutePath = /(^|[\s("'\[])(\/(?:[^\s)"'\]]+\/?)+)/g
const secret = /\b(?:sk|pk|api|token|key)[_-][A-Za-z0-9_-]{12,}\b/gi

function cleanString(value: string) {
  return value
    .replace(windowsAbsolutePath, "[local-path]")
    .replace(unixAbsolutePath, (_match, prefix: string) => `${prefix}[local-path]`)
    .replace(secret, "[secret]")
}

export function sanitizeForSync(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]"
  if (typeof value === "string") return cleanString(value).slice(0, 32_000)
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeForSync(item, depth + 1))
  if (!value || typeof value !== "object") return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:content|fileContents?|raw|stdout|stderr|terminalOutput|absolutePath)$/i.test(key)) continue
    output[key] = sanitizeForSync(item, depth + 1)
  }
  return output
}

export function sanitizeTimelineEvent(event: LocalTimelineEvent): LocalTimelineEvent | null {
  if (!event.id || !event.runId || !event.sessionId) return null
  if ((event.type as string) === "terminal_output") return null
  return { ...event, data: sanitizeForSync(event.data) as Record<string, unknown> }
}

export function isSafeIdentifier(value: string) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value)
}

export type RelayClientMessage =
  | { type: "authenticate"; token: string }
  | { type: "run.execute"; runId: string; model: string; payload: unknown }
  | { type: "run.cancel"; runId: string }

export type RelayServerMessage =
  | { type: "authenticated"; deviceId: string }
  | { type: "run.chunk"; runId: string; chunk: string }
  | { type: "run.done"; runId: string }
  | { type: "run.error"; runId: string; error: string }
