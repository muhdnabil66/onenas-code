import { cp, mkdir, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = resolve(root, "dist")

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await Promise.all([
  cp(resolve(root, "index.html"), resolve(output, "index.html")),
  cp(resolve(root, "style.css"), resolve(output, "style.css")),
  ...["download", "releases", "docs"].map((route) =>
    cp(resolve(root, route), resolve(output, route), { recursive: true }),
  ),
])

console.log("Built ONeNas Code static site with routes /, /download, /releases and /docs")
