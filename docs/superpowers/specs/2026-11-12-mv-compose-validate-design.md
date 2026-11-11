# Design: MV 最终合成校验（P0-5）

Date: 2026-11-12
Module: MV / Sprint 1 leftover P0-5 / 成片封装原曲
Status: Approved for nightly automation (user locked 流程优化 + 对口型；backlog P0-5 仍未做)

## Problem

`muxOriginalAudio` / `composeMvVideos` 已能拼接视频并用原曲覆盖音轨，但合成前没有可测试的校验：段顺序错乱、缺段（空洞）、同一段或同一成片重复、时间轴缺口/重叠、总时长与原曲对不上，或成片误把模型音轨当母带，都可能静默出片。P0-4 只做逐段音画时长对齐，并把本项显式推迟。

## Goals

- 纯函数合成前报告：调用方提供切点、探测时长与音轨来源；校验库内不跑 ffmpeg/ffprobe。
- 默认时长容差 **80 ms**（与 `checkAvAlignment` / `docs/MV_AUDIO_TIMELINE_UX.md` 一致）。
- 覆盖：视频段顺序、缺段空洞、重复（段号或成片路径）、时间轴缺口/重叠、总时长 vs 原曲、原曲必须是唯一母带音轨。
- 每条 issue 含中文 `message` + `suggestion`；`ok === false` 仅当存在 `severity: error`。
- CLI `mv-compose-check --manifest`；stdout JSON；`!ok` 时 exit 1。

## Non-goals (tonight)

- 重写 `muxOriginalAudio` / `composeMvVideos` 的 ffmpeg 实现。
- UI 导出/合成硬门禁。
- 重复 P0-4 的逐段 A/V 时长码（本校验不发 AUDIO_DURATION_MISMATCH 等）。
- 实机 RunningHub 试片（另按每晚口型试片规则处理）。

## API

```ts
type ComposeSegmentInput = {
  index: number;            // 1-based preferred; 0-based accepted if documented
  startSec?: number;
  endSec?: number;
  expectedDuration?: number; // end-start if omitted but both ends present
  videoDuration?: number;
  videoPath?: string;
};

type ComposeOptions = {
  durationToleranceSec?: number; // default 0.08
  sourceAudioDuration?: number;
  sourceAudioPath?: string;
  audioSource?: 'original' | 'generated' | 'unknown';
  requireOriginalAudio?: boolean; // default true
  requireVideo?: boolean;         // default true
};

type ComposeIssue = {
  code:
    | 'NO_SEGMENTS'
    | 'INVALID_DURATION'
    | 'SEGMENT_ORDER'
    | 'MISSING_SEGMENT'
    | 'DUPLICATE_SEGMENT'
    | 'DUPLICATE_VIDEO'
    | 'TIMELINE_GAP'
    | 'TIMELINE_OVERLAP'
    | 'TOTAL_DURATION_MISMATCH'
    | 'MISSING_SOURCE_AUDIO'
    | 'GENERATED_AUDIO_MASTER'
    | 'UNKNOWN_AUDIO_MASTER'
    | 'MISSING_VIDEO';
  severity: 'error' | 'warning';
  segmentIndex: number | null;
  message: string;
  suggestion: string;
  expected?: number;
  actual?: number;
  delta?: number;
};

type ComposeReport = {
  ok: boolean;
  toleranceSec: number;
  issues: ComposeIssue[];
  summary: string;
  expectedTotalDuration?: number;
  actualTotalDuration?: number;
};

checkMvCompose(input, options?): ComposeReport
// input: ComposeSegmentInput[] | { segments, sourceAudioDuration?, sourceAudioPath?, audioSource? }
formatComposeReport(report): string
```

Options on the input object (when not an array) are used as defaults and may be overridden by the second argument.

## Severity rules

| Code | When | Severity |
| --- | --- | --- |
| NO_SEGMENTS | 空数组或非数组 | error |
| INVALID_DURATION | start/end/expected/video/source 时长非有限，或 expected/video/source ≤ 0，或 end < start | error |
| DUPLICATE_SEGMENT | 同一 index 出现两次 | error |
| MISSING_SEGMENT | 规范化后的段号不是连续的 1..n（缺号） | error |
| SEGMENT_ORDER | 输入顺序与段号或 startSec 升序不一致 | error |
| DUPLICATE_VIDEO | 非空 `videoPath`（规范化后）被两段使用 | error |
| TIMELINE_OVERLAP | 相邻段均有 start/end，且后段 start < 前段 end − tol | error |
| TIMELINE_GAP | 相邻段均有 start/end，且后段 start > 前段 end + tol | error |
| TOTAL_DURATION_MISMATCH | 提供了 `sourceAudioDuration`，且 \|期望总时长 − 原曲时长\| > tol。期望总时长优先为末段 end − 首段 start（两端都有时），否则为各段 expectedDuration（或 end−start）之和 | error |
| MISSING_SOURCE_AUDIO | `requireOriginalAudio`（默认 true）且没有可用原曲证据：既没有非空 `sourceAudioPath`，也没有有限正数 `sourceAudioDuration`，且 `audioSource` 也不是 `'original'` | error |
| GENERATED_AUDIO_MASTER | `audioSource === 'generated'` | error |
| UNKNOWN_AUDIO_MASTER | `audioSource === 'unknown'`。若同时已有原曲 path 或正时长，则降为 warning（不足以单独否决）；否则当 `requireOriginalAudio` 时为 error | warning 或 error |
| MISSING_VIDEO | `requireVideo`（默认 true）且该段既没有非空 `videoPath` 也没有有限正数 `videoDuration` | error |

`ok === false` iff 任一条 severity 为 error。summary 用中文：通过时说明段数与总时长；失败时概述错误条数与主要 code。

段号规范化：若所有 `index` 都 ≥ 1，按 1-based 检查空洞；若存在 0 且无更大空洞规则冲突，按 0-based 转成 1-based（index+1）再检查。不要把合法的 1-based 列表误判。

相邻时间轴只用「输入排序后、再按 index 排序后」的相邻对；若 SEGMENT_ORDER 已报错，仍检查能判断的 gap/overlap，避免漏报。

`expectedDuration` 别名（库或 CLI 归一化）：`duration`。时间别名：`start`/`startSec`，`end`/`endSec`。音轨别名：`muxedAudioSource` → `audioSource`。

## CLI

`mv-compose-check --manifest <json> [--tolerance 0.08] [--require-original-audio|--no-require-original-audio] [--require-video|--no-require-video]`

Manifest 为 segments 数组，或含 `segments` 的对象（可带 `sourceAudioDuration` / `sourceAudioPath` / `audioSource` / `muxedAudioSource`）。stdout 为完整 `ComposeReport` JSON；人类可读摘要可写 stderr 或与 `mv-align-check` 一样只打 JSON。`!ok` → `process.exitCode = 1`。help 列出该命令。

## Hook into mux (thin)

`muxOriginalAudio` 在调用 ffmpeg 之前，用 `videoPaths` + `audioPath`（`audioSource: 'original'`）跑一次校验；可选传入 `segments` / `sourceAudioDuration`。`!ok` 则抛出 `formatComposeReport` 文本，不跑 ffmpeg。不在单测里真的跑通拼接，除非用极小夹具；重复路径 / 缺原曲应在调用 ffmpeg 前被拦住。

## Tests

`scripts/test-mv-compose-validate.mjs` 接入 `npm test` 与 `test:mv-compose-validate`。夹具：`examples/mv-compose-fixture.json`（通过）、`examples/mv-compose-fixture-bad.json`（至少含空洞或重复 + 生成音轨母带之一，使 `ok:false`）。

## Verification

- 先写失败测试，再写实现。
- `npm test` 全绿；CLI 对 ok 夹具 exit 0 / `ok:true`，对 bad 夹具 exit 1。
- 无 RH、无密钥、无大媒体入仓。
