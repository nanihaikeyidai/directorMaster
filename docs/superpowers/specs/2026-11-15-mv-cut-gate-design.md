# Design: MV 切镜句界门禁

Date: 2026-11-15
Module: MV / 流程优化 — 切点只落在乐句/句尾、呼吸或人声空白
Status: Approved for nightly automation（用户 2026-10-31 锁定切镜规则；提示词已写「禁止句中切」，但 `mv-cut` / 合成前没有可测试的切点校验）

## Problem

用户要求：切镜不在一句歌词中间切；切点只落在乐句/句尾、呼吸或人声空白处。有歌词时间码则对齐句界，否则用人声能量谷；禁止按固定秒数硬切。

当前各曲风模板只把这条规则写进提示词，`mv-cut --cuts` 仍接受任意时间点。句中硬切会把一句歌唱拆开，口型与表演都被切断。本夜补上纯函数门禁和 CLI，不改提示词正文，也不在 `mv-cut` 里默认硬失败（以免打断已有工程）。

## Goals

- 纯函数 `checkMvCuts`：输入切点 + 歌词时间码和/或能量 hops，输出每一切点是否合法、应吸附到哪、以及中文 `reason`。库内不跑 ffmpeg/ffprobe。
- 有歌词时间码时优先：落在某句 `startSec`/`endSec` 容差内 → 句界通过；严格落在一句内部 → `MID_LYRIC`，吸附到较近的句首或句尾（距离相等时向后吸附到句尾）。
- 无歌词、仅有 hops 时：复用 `isVocalActiveHop`。人声活跃段的边界、人声空白/前奏/间奏内部、以及曲首/曲尾，均为合法切点；严格落在连续人声活跃段内部 → `MID_LYRIC`（按能量谷近似句中），吸附到较近的活跃段边界（平局向后）。
- 默认容差 **120 ms**。对 hops，有效容差为 `max(toleranceSec, hopSec / 2)`，避免 0.25s hop 把边界误判成句中。
- 空切点、非法数字、重复切点、超出音频时长、既无歌词也无 hops，均应 `ok: false` 并给出错误码。
- CLI `mv-cut-check --cuts`，可配 `--lyrics` / `--hops-json` / `--audio`（`--audio` 仅 CLI 调已有 `probeEnergyHops`）；`!ok` 时 exit 1；help 列出该命令。
- `npm test` 含 `test-mv-cut-gate`；无密钥、无大媒体、无 RH 调用。

## Non-goals (tonight)

- 不把该门禁默认接到 `mv-cut`（可在下一晚加 `--check-cuts` 或 UI 预检）。
- 不在库内做更复杂的「句内局部能量谷 → 换气」检测；有细句界请提供歌词时间码。
- 不合并已打开的 PR 栈。
- 实机 RunningHub 试片另按每晚口型试片规则处理。

## API

```ts
export const CUT_GATE_TOLERANCE_SEC = 0.12;

type LyricCue = { startSec: number; endSec: number; text?: string };

type CutKind = 'phrase_end' | 'breath' | 'vocal_gap' | 'song_edge' | 'mid_lyric' | 'invalid';

type CutAssessment = {
  t: number;
  ok: boolean;
  kind: CutKind;
  snappedT: number;
  code?: string;
  reason: string;
};

type CutCheckIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  t?: number;
  snappedT?: number;
};

type CutCheckInput = {
  cuts?: unknown;
  lyrics?: unknown;
  hops?: unknown;
  durationSec?: number;
  toleranceSec?: number;
  hopSec?: number;
};

type CutCheckReport = {
  ok: boolean;
  toleranceSec: number;
  hopSec?: number;
  durationSec?: number;
  reason: string;
  cuts: CutAssessment[];
  snappedCuts: number[];
  issues: CutCheckIssue[];
};

parseLyricCues(input?: unknown): LyricCue[]
// 接受数组，或 { lyrics | cues | lines }。单条可用 startSec/endSec、start/end、start_time/end_time；
// text 可选（text / lyrics / line）。end <= start 或非有限数字的条目丢弃。

findVocalRuns(hops, opts?): Array<{ startSec: number; endSec: number; active: boolean }>
// 按 isVocalActiveHop 合并连续段。endSec 为半开区间右端（最后 hop 的 t + hopSec）。

classifyCutPoint(t, ctx): CutAssessment
checkMvCuts(input?): CutCheckReport
```

## Error codes

- `NO_CUTS`：切点缺失或无法解析成至少一个有限数字
- `NO_EVIDENCE`：既无有效歌词时间码，也无 hops
- `INVALID_CUT`：非有限数字或负值
- `DUPLICATE_CUT`：与已有切点重合（容差内）
- `OUT_OF_RANGE`：超出 `[0, durationSec]`（加容差）
- `MID_LYRIC`：落在歌词句内，或（无歌词时）落在连续人声活跃段内部

## CLI

`mv-cut-check --cuts 8.4,21.7 [--lyrics cues.json] [--hops-json hops.json | --audio file] [--tolerance 0.12] [--duration SEC] [--json]`

stdout 为报告 JSON；`!ok` 时 exit 1。`--audio` 与 `--hops-json` 同时出现时以 hops-json 为准，不探音频。
