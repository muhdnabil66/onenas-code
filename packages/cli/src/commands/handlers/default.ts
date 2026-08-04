import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Effect } from "effect"
import { Daemon } from "../../services/daemon"

function showBanner(): void {
  console.log(`
  [0;2m��������+������+ ���+   ���+�������+�������+      �����+  ������+ �������+���+   ��+��������+
  [0;2m��+---��+��+--��+����+ �������+----+��+----+     ��+--��+��+----+ ��+----+����+  ���+--��+--+
  [0;2m   ���   ������++��+����+��������+  �������+    �����������  ���+�����+  ��+��+ ���   ���
  [0;2m   ���   ��+--��+���+��++�����+--+  +----���    ��+--������   �����+--+  ���+��+���   ���
  [0;2m   ���   ���  ������ +-+ ����������+��������    ���  ���+������++�������+��� +�����   ���
  [0;2m   +-+   +-+  +-++-+     +-++------++------+    +-+  +-+ +-----+ +------++-+  +---+   +-+
  [0m`)
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
