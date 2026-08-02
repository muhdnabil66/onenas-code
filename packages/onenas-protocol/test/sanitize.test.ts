import { describe, expect, test } from "bun:test"
import { sanitizeForSync, sanitizeTimelineEvent } from "../src"

describe("ONeNas sync sanitizer", () => {
  test("removes raw file and terminal fields and redacts local paths", () => {
    expect(
      sanitizeForSync({
        absolutePath: "C:\\Users\\person\\secret.ts",
        fileContent: "private source",
        stdout: "raw output",
        summary: "Edited C:\\Users\\person\\project\\src\\app.ts",
      }),
    ).toEqual({ summary: "Edited [local-path]" })
  })

  test("never syncs terminal output events", () => {
    expect(
      sanitizeTimelineEvent({
        id: "event_12345678",
        runId: "run_12345678",
        sessionId: "session_12345678",
        type: "terminal_output" as never,
        createdAt: new Date(0).toISOString(),
        data: { stdout: "secret" },
      }),
    ).toBeNull()
  })

  test("sanitizes user prompt history", () => {
    expect(
      sanitizeTimelineEvent({
        id: "event_12345678",
        runId: "run_12345678",
        sessionId: "session_12345678",
        type: "user_text",
        createdAt: new Date(0).toISOString(),
        data: { text: "Check C:\\Users\\person\\project\\app.ts" },
      }),
    ).toMatchObject({ data: { text: "Check [local-path]" } })
  })
})
