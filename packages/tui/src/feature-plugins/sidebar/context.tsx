import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo } from "solid-js"

const id = "internal:sidebar-context"

const moneyUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const moneyMyr = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "MYR",
})

const USD_TO_MYR_RATE = 4.3
const CREDITS_PER_MYR = 100
const CREDIT_MARGIN = 1.2

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)
  const last = createMemo(() =>
    msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0),
  )
  const isAtlasFlux = createMemo(() => last()?.providerID === "atlasflux")
  const credits = createMemo(() =>
    Math.ceil(cost() * USD_TO_MYR_RATE * CREDITS_PER_MYR * CREDIT_MARGIN),
  )

  const state = createMemo(() => {
    const message = last()
    if (!message) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      message.tokens.input +
      message.tokens.output +
      message.tokens.reasoning +
      message.tokens.cache.read +
      message.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === message.providerID)?.models[message.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{state().tokens.toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>{state().percent ?? 0}% used</text>
      {isAtlasFlux() ? (
        <>
          <text fg={theme().textMuted}>{moneyMyr.format(credits() * 0.01)} spent</text>
          <text fg={theme().textMuted}>{credits().toLocaleString()} credits</text>
        </>
      ) : (
        <text fg={theme().textMuted}>{moneyUsd.format(cost())} spent</text>
      )}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
