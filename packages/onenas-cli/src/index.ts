#!/usr/bin/env node

import { login, loadTokens, clearTokens, fetchBootstrap, type AuthTokens } from "./auth.js"
import { startProviderBridge, managedProviderConfig } from "./bridge.js"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VERSION = "0.1.0"

const HELP = `
  ONeNas Code by AtlasFlux v${VERSION}

  Usage:
    onenas                  Start the TUI agent
    onenas login            Sign in to AtlasFlux AI
    onenas logout           Sign out
    onenas status           Show current account
    onenas models           List available models
    onenas help             Show this help

  Environment:
    ONENAS_PARENT_ORIGIN    AtlasFlux parent URL (default: https://ai.atlasflux.my)
    ONENAS_MODEL            Override default model
`

async function showStatus(tokens: AuthTokens) {
  try {
    const bootstrap = await fetchBootstrap(tokens.access_token)
    console.log(`\n  Signed in as: ${bootstrap.user.name || bootstrap.user.id}`)
    console.log(`  Plan: ${bootstrap.plan.name}`)
    console.log(`  Credits: ${bootstrap.credits.balance} ${bootstrap.credits.currency}`)
    console.log(`  Models: ${bootstrap.models.length} available\n`)
  } catch {
    console.log(`\n  Authenticated but failed to fetch profile. Token may be expired.\n`)
  }
}

async function showModels(tokens: AuthTokens) {
  try {
    const bootstrap = await fetchBootstrap(tokens.access_token)
    console.log(`\n  Available models:\n`)
    for (const model of bootstrap.models) {
      const ctx = model.contextWindow ? ` (${Math.round(model.contextWindow / 1000)}k ctx)` : ""
      console.log(`    ${model.id} - ${model.name}${ctx}`)
    }
    console.log()
  } catch (err: any) {
    console.error(`\n  Failed to fetch models: ${err.message}\n`)
  }
}

async function findOpencodeBinary(): Promise<string | null> {
  const candidates = [
    path.join(__dirname, "../../opencode/bin/opencode"),
    path.join(__dirname, "../../node_modules/.bin/opencode"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  // Try which/where
  try {
    const result = process.platform === "win32"
      ? execFileSync("where", ["opencode"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
      : execFileSync("which", ["opencode"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
    return result.trim().split("\n")[0] || null
  } catch {
    return null
  }
}

async function runTUI(tokens: AuthTokens) {
  // Start provider bridge
  const bridge = await startProviderBridge(() => loadTokens()?.access_token ?? null)
  
  // Fetch bootstrap for model config
  let bootstrap
  try {
    bootstrap = await fetchBootstrap(tokens.access_token)
  } catch (err: any) {
    console.error(`\n  Failed to fetch AtlasFlux config: ${err.message}\n`)
    process.exit(1)
  }

  // Set managed config
  const config = managedProviderConfig(bridge.url, bootstrap)
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)

  // Find and launch OpenCode binary
  const binary = await findOpencodeBinary()
  if (!binary) {
    console.error(`\n  OpenCode binary not found. Make sure @opencode-ai/cli is installed.\n`)
    await bridge.stop()
    process.exit(1)
  }

  console.log(`\n  ONeNas Code by AtlasFlux`)
  console.log(`  Signed in as: ${bootstrap.user.name || bootstrap.user.id}`)
  console.log(`  Credits: ${bootstrap.credits.balance}`)
  console.log(`  Starting agent...\n`)

  // Forward args to opencode (skip node and script path)
  const args = process.argv.slice(2).filter((a) => a !== "login" && a !== "logout" && a !== "status" && a !== "models" && a !== "help")

  try {
    execFileSync(binary, args, {
      stdio: "inherit",
      env: { ...process.env },
    })
  } catch (err: any) {
    if (err.status !== undefined) process.exit(err.status)
  } finally {
    await bridge.stop()
  }
}

async function main() {
  const command = process.argv[2]

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP)
    return
  }

  if (command === "logout") {
    clearTokens()
    console.log(`\n  Signed out.\n`)
    return
  }

  if (command === "login") {
    const tokens = await login()
    await showStatus(tokens)
    return
  }

  // Commands that need auth
  let tokens = loadTokens()
  if (!tokens) {
    console.log(`\n  Not signed in. Opening AtlasFlux login...\n`)
    tokens = await login()
  }

  if (command === "status") {
    await showStatus(tokens)
    return
  }

  if (command === "models") {
    await showModels(tokens)
    return
  }

  // Default: run TUI
  await runTUI(tokens)
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`)
  process.exit(1)
})
