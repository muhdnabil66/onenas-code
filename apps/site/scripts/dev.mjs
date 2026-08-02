import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve } from "node:path"

const root = resolve(process.argv[2] || ".")
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript" }

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
  const requested = resolve(root, `.${pathname}`)
  if (!requested.startsWith(root)) {
    response.writeHead(403).end()
    return
  }
  let file = requested
  try {
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html")
    await stat(file)
  } catch {
    response.writeHead(404).end("Not found")
    return
  }
  response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" })
  createReadStream(file).pipe(response)
}).listen(Number(process.env.PORT || 4173), "127.0.0.1", () => {
  console.log("ONeNas Code site available at http://127.0.0.1:4173")
})
