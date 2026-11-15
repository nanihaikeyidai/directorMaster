# Design: 把切镜句界门禁接到 mv-cut

Date: 2026-11-16
Module: MV / 流程优化 — `mv-cut` 只在句界、呼吸或人声空白处切段
Status: Approved for nightly automation（用户 2026-10-31 锁定切镜规则；2026-11-15 已落地 `checkMvCuts` + `mv-cut-check`，但 `mv-cut` 默认仍接受句中切点）

## Problem

`checkMvCuts` 与 CLI `mv-cut-check` 已能拦住歌词句中硬切，并给出吸附建议。`mv-cut` 解析 `--cuts` 后仍直接 ffmpeg 导出分段，句中切点会被接受。用户规则仍然有效：禁止在一句歌词中间切，切点只落在乐句/句尾、呼吸或人声空白。

## Goals

- 纯函数 `planMvCutGate`：决定 `mv-cut` 是否可以继续，以及实际应用哪一份切点列表。库内不跑 ffmpeg/ffprobe，不访问文件系统，不 `process.exit`。
- 复用既有 `checkMvCuts`；不破坏其测试与错误码。
- 空切点 / 无内部切点不是硬失败（不要把 `NO_CUTS` 当成阻断）。单段是否超过 15 秒仍由 `mv-cut` 既有规则拦截。
- 有切点但既无歌词也无 hops → 阻断（`NO_EVIDENCE`）。CLI 默认路径会自动探测 hops，因此这种情况应很少见。
- `checkMvCuts` 通过 → `pass`，使用原始合法切点（不要无故换成 snapped 值）。
- 失败且未开 snap → `block`，`appliedCuts` 不得伪装成已接受的吸附列表；句中失败的中文 `reason` 需带吸附建议。
- 失败且 `--snap-cuts`：仅自动修复可吸附的 `MID_LYRIC`；吸附后复检通过且切点非空、唯一、有序 → `snap`。吸附后重复、越界或非法 → `block`。
- CLI `mv-cut` 在探测时长并解析 `--cuts` 之后、ffmpeg 导出分段之前调用门禁；默认无歌词/hops 文件时探测 `probeEnergyHops`；失败抛中文错误并停止导出。
- 清单写入精简 `cutGate`（`ok` / `mode` / `reason` / `inputCuts` / `appliedCuts`），不写入整段 hops。
- `npm test` 含 `test-mv-cut-apply`；无密钥、无大媒体、无 RH 调用。

## Non-goals (tonight)

- 不给 MV 页新做切点编辑器。若页上已有切点编辑，本夜不接 UI 预检（留给下一晚）。
- 不改 `checkMvCuts` 语义，不改 `mv-cut` 的 15 秒段长规则。
- 不增加 `--skip-cut-gate` / `--no-cut-gate`。
- 不改 `scripts/generate-mv-prompts.mjs`（它使用已有 `project.cuts`，不在 `mv-cut` 导出路径上）。
- 不合并已打开的 PR 栈。
- 实机 RunningHub 试片由父任务处理，本实现不烧币、不提交试片。

## UI check

`app/mv/page.tsx` 已有合成门禁预检，同时也有切点编辑（`cuts` 状态、在播放头裁切、智能建议切点、切点拖动/右键新增）。本夜不发明新 UI，也不在页面接入预检。

## API

```ts
planMvCutGate({
  cuts,
  lyrics?,
  hops?,
  durationSec?,
  toleranceSec?,
  hopSec?,
  snap?: boolean, // default false
}): CutGatePlan

type CutGateMode = 'pass' | 'snap' | 'block' | 'skip';

type CutGatePlan = {
  ok: boolean;
  mode: CutGateMode;
  reason: string;        // 中文
  inputCuts: number[];   // 纳入考虑的有限切点
  appliedCuts: number[]; // mv-cut 应使用的切点
  report: CutCheckReport;
};
```

## Rules

1. 空切点或没有内部切点（内部切点定义为 `t > 0.25 && t < durationSec - 0.25`；若缺时长则 `t > 0.25`）：`ok: true`，`mode: 'skip'`，`appliedCuts: []`。`durationSec` 缺失或 `durationSec <= 15.001` 时，reason 说明无需切点 / 单段可过。`durationSec > 15.001` 且无切点时同样 skip，把超长单段留给 `mv-cut` 既有「段时长超过 15 秒」错误。
2. 有内部切点，但既无歌词也无 hops：`ok: false`，`mode: 'block'`，代码 `NO_EVIDENCE`，中文 reason。
3. `checkMvCuts` 通过：`mode: 'pass'`，`ok: true`，`appliedCuts` 为原始被接受的切点（不是 snapped，除非输入本身已合法）。
4. `checkMvCuts` 失败且 `snap !== true`：`mode: 'block'`，`ok: false`，`appliedCuts` 不得改成 snapped 列表冒充已接受。若失败含 `MID_LYRIC`，reason 需中文并给出 `snappedCuts` / 评估中的建议时刻（便于改 `--cuts` 或加 `--snap-cuts` 重跑）。
5. `checkMvCuts` 失败且 `snap === true`：只把 `MID_LYRIC` 换成对应 `snappedT`，其余错误切点保持原值。对候选列表再跑 `checkMvCuts`。若复检通过且候选是非空、唯一、有序列表：`mode: 'snap'`，`ok: true`，`appliedCuts = snapped/候选切点`，reason 说明已吸附到句界或人声空白。若复检仍失败（吸附后重复、`OUT_OF_RANGE`、`INVALID_CUT` 等）：`mode: 'block'`，`ok: false`。
6. `INVALID_CUT` / `OUT_OF_RANGE` / `DUPLICATE_CUT` 即使开了 snap 也不单独自动修复；除非只吸附 `MID_LYRIC` 后这些错误在复检中消失。
7. 纯函数：无 ffmpeg、无文件系统、无 `process.exit`。

## CLI `mv-cut`

在探测时长并解析/过滤 `--cuts` 之后、复制大量素材和 ffmpeg 导出分段之前：

- 新可选参数：`--lyrics <cues.json>`（与 `mv-cut-check` 相同形状）、`--hops-json <file>`、`--snap-cuts`、可选 `--tolerance`。
- 若未给歌词且未给 hops-json，对源音频调用 `probeEnergyHops`。探测抛错或没有可用 hops 时抛中文错误，不得静默跳过门禁。
- `const plan = planMvCutGate({ cuts, lyrics, hops, durationSec: duration, snap: argv.includes('--snap-cuts'), ... })`
- `!plan.ok` 时 `throw new Error(plan.reason)`，不跑 ffmpeg。
- 通过则用 `plan.appliedCuts` 替换工作切点列表，再构造 `points = [0, ...cuts, duration]`（应用前仍按 `>0.25 && <duration-0.25` 过滤端点，避免曲首/曲尾重复成 0 长段）。
- 写入 manifest 的精简 `cutGate`：`ok`、`mode`、`reason`、`inputCuts`、`appliedCuts`。
- help 的 `mv-cut` 行列出 `--lyrics`、`--hops-json`、`--snap-cuts`。
- 不增加跳过门禁的开关。不改变 `mv-cut-check` 行为（除非 help 需要顺带说明）。
