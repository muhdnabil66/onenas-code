import { expect, test } from "bun:test"
import { managedProviderConfig } from "./atlas-provider-bridge"

test("managed provider config only exposes AtlasFlux AI models", () => {
  const config = managedProviderConfig("http://127.0.0.1:43210", {
    user: { id: "user_123" },
    plan: { id: "pro", name: "Pro" },
    credits: { balance: 500, currency: "credits" },
    features: {},
    relay: { url: "wss://relay.example/connect" },
    minimumVersion: "1.18.11",
    models: [
      {
        id: "openai/example",
        name: "Example",
        contextWindow: 128000,
        maxOutputTokens: 16000,
        supportsReasoning: true,
        supportsTools: true,
      },
    ],
  })

  expect(config.enabled_providers).toEqual(["atlasflux"])
  expect(Object.keys(config.provider)).toEqual(["atlasflux"])
  expect(config.provider.atlasflux.options.baseURL).toBe("http://127.0.0.1:43210/v1")
  expect(config.provider.atlasflux.models["openai/example"]).toMatchObject({
    tool_call: true,
    reasoning: true,
    limit: { context: 128000, output: 16000 },
  })
})
