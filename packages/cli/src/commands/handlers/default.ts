import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Effect } from "effect"
import { Daemon } from "../../services/daemon"

function showBanner(): void {
  console.log(`
  \x1b[0;2m ██████╗ ███╗   ██╗███████╗███╗   ██╗ █████╗ ███████╗\x1b[0m
  \x1b[0;2m██╔═══██╗████╗  ██║██╔════╝████╗  ██║██╔══██╗██╔════╝\x1b[0m
  \x1b[0;2m██║   ██║██╔██╗ ██║█████╗  ██╔██╗ ██║███████║███████╗\x1b[0m
  \x1b[0;2m██║   ██║██║╚██╗██║██╔══╝  ██║╚██╗██║██╔══██║╚════██║\x1b[0m
  \x1b[0;2m╚██████╔╝██║ ╚████║███████╗██║ ╚████║██║  ██║███████║\x1b[0m
  \x1b[0;2m ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝\x1b[0m`)
}

export default Runtime.handler(Commands, () =>
  Effect.gen(function* () {
    const daemon = yield* Daemon.Service
    const transport = yield* daemon.transport()
    const { runTui } = yield* Effect.promise(() => import("../../tui"))
    showBanner()
    yield* runTui(transport)
    showBanner()
  }),
)
