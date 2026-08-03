import { spawn } from "node:child_process"

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const command = process.platform === "win32" ? "electron-vite.exe" : "electron-vite"
const child = spawn(command, ["dev"], {
  env,
  stdio: "inherit",
  shell: false,
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})

child.on("error", (error) => {
  console.error(error)
  process.exit(1)
})
