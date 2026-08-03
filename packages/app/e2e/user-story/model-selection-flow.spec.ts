import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/OpenCode/NewProject"

test("creates a session in a new project, connects OpenAI, and selects its model", async ({ page }) => {
  let connectedOpenAI = false
  let pendingOpenAI = false
  const connections: Array<{ integrationID: string; body: unknown }> = []

  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_model_selection_flow",
      worktree: directory,
      vcs: "git",
      name: "NewProject",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      sandboxes: [],
    },
    provider: () => ({
      all: [
        {
          id: "atlasflux",
          name: "AtlasFlux AI",
          models: {
            "free-model": {
              id: "free-model",
              name: "Free Model",
              cost: { input: 0, output: 0 },
              limit: { context: 200_000 },
            },
          },
        },
        {
          id: "openai",
          name: "OpenAI",
          models: {
            "gpt-model-1": {
              id: "gpt-model-1",
              name: "GPT Model 1",
              cost: { input: 1, output: 1 },
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: connectedOpenAI ? ["atlasflux", "openai"] : ["atlasflux"],
      default: { providerID: "atlasflux", modelID: "free-model" },
    }),
    integrationMethods: { openai: [{ type: "api", label: "API key" }] },
    onConnectKey: (input) => {
      connections.push(input)
      if (input.integrationID === "openai") pendingOpenAI = true
    },
    onInstanceDispose: () => {
      if (pendingOpenAI) connectedOpenAI = true
    },
    sessions: [],
    pageMessages: () => ({ items: [] }),
    fileList: (path) =>
      path ? [] : [{ name: "NewProject", path: "NewProject", absolute: directory, type: "directory", ignored: false }],
    findFiles: () => ["NewProject"],
  })
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem("opencode.global.dat:server", JSON.stringify({ projects: { local: [] } }))
  })

  await page.goto("/")
  const addProject = page.locator('[data-action="home-add-project-row"]')
  await expectAppVisible(addProject)
  await addProject.click()
  await page.locator("[data-directory-path]").click()

  await page.locator('[data-action="home-new-session"]').click()
  await expectAppVisible(page.locator('[data-component="prompt-input-v2"]'))

  const modelControl = page.locator('[data-action="prompt-model"]')
  await modelControl.click()
  await expect(page.locator('[data-section="free-models"]')).toContainText("Free models provided by ONeNas Code")

  await page.locator('[data-provider-id="openai"]').click()
  await page.locator('[data-input="provider-api-key"]').fill("mock-openai-api-key")
  await page.locator('[data-action="provider-connect-submit"]').click()
  await expect(page.locator('[data-component="dialog-v2"]')).toHaveCount(0)
  expect(connections).toEqual([{ integrationID: "openai", body: { type: "api", key: "mock-openai-api-key" } }])

  await expect(modelControl).toHaveAttribute("data-control-type", "popover")
  await modelControl.click()
  const gptModel = page.locator('[data-option-key="openai:gpt-model-1"]')
  await expect(gptModel).toBeVisible()
  await gptModel.click()

  await expect(modelControl).toContainText("GPT Model 1")
})
