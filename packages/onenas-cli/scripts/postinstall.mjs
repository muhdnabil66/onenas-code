import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, "..")
const REPO = "muhdnabil66/onenas-code"
const VERSION = process.env.ONENAS_BINARY_VERSION || "latest"

const OS = process.platform === "win32" ? "windows" : process.platform
const ARCH = process.arch === "arm64" ? "arm64" : "x64"
const EXE = process.platform === "win32" ? ".exe" : ""
const ASSET = `onenas-code-${OS}-${ARCH}${EXE}`
const DEST_DIR = path.join(pkgRoot, "resources")
const DEST = path.join(DEST_DIR, `opencode${EXE}`)

const CI = process.env.CI === "true" || process.env.CI === "1"

async function main() {
  if (process.env.ONENAS_SKIP_BINARY || CI) {
    console.log(`onenas-code: skipping binary download${CI ? " (CI detected)" : ""}`)
    return
  }
  if (fs.existsSync(DEST) && fs.statSync(DEST).size > 10 * 1024 * 1024) {
    console.log(`onenas-code: binary already present (${Math.round(fs.statSync(DEST).size / 1024 / 1024)}MB), skipping download`)
    return
  }
  const url = `https://github.com/${REPO}/releases/${VERSION}/download/${ASSET}`
  console.log(`onenas-code: downloading binary from ${url}`)
  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) {
    console.warn(`onenas-code: no binary available for ${OS}-${ARCH} (${response.status} ${response.statusText})`)
    console.warn(`onenas-code: download manually from ${url} and place at ${DEST}`)
    return
  }
  fs.mkdirSync(DEST_DIR, { recursive: true })
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(DEST, buffer)
  if (process.platform !== "win32") fs.chmodSync(DEST, 0o755)
  console.log(`onenas-code: binary installed (${Math.round(buffer.length / 1024 / 1024)}MB)`)
}

main().catch((error) => {
  console.error(`onenas-code: postinstall failed: ${error.message}`)
  if (!CI) process.exit(1)
})
