# Design: MV UI/API 合成硬门禁（P0-4 / P0-5）

Date: 2026-11-14
Module: MV / Sprint 1 leftover — 导出与合成前硬门禁
Status: Approved for nightly automation（用户锁定流程优化；P0-5 库已落地，UI/API 硬门禁仍标为可选）

## Problem

`checkMvCompose` 与 `checkAvAlignment` 已有纯函数和 CLI，`muxOriginalAudio` 也会预检，但 UI 走的是 `/api/local/mv/compose`（`composeMvVideos`）。这条路径在 ffmpeg 拼接前不会校验段顺序、空洞、重复、时间轴缺口、总时长或原曲母带，失败的成片会静默出片。预览请求 `audioMode: "both"`，导出可选手「音乐原声」或「视频原声」；云端分段完成后的自动合成默认应是原曲母带。

## Goals

- 纯函数门禁 `planMvComposeGate`：由切点/段信息、视频路径、trim、音轨意图生成报告；库内不跑 ffmpeg/ffprobe。
- 默认时长容差 **80 ms**，复用 `checkMvCompose`；若任一段带有 `videoDuration` / `audioDuration`，再跑 `checkAvAlignment`（`requireAudio: false`）。
- `ok === false` 时禁止官方成片/导出走 ffmpeg；中文 `reason` 汇总失败原因。
- 官方成片（导出且音轨为原曲，或未标明 audioMode）必须原曲为唯一母带。
- 预览（`audioMode: "both"` 或 `purpose: "preview"`）校验收口和原曲证据，但不把「视频原声试听」当成母带错误。
- 「导出 · 视频原声」视为 QC 试听导出：仍校验段完整性，不要求原曲母带，也不把结果标成官方成片。
- trim 窗口（`trimEnd - trimStart`）作为对母带时长的期望，避免用整首时长误报 `TOTAL_DURATION_MISMATCH`。
- `/api/local/mv/compose` 在调用 ffmpeg **之前**执行门禁；失败返回 400 与报告，不跑拼接。
- MV 页在请求合成/导出前先跑同一函数，失败只展示 `reason`，不发起请求。
- CLI `mv-compose-gate`；`npm test` 接入；无 RH、无密钥、无大媒体。

## Non-goals (tonight)

- 重写 `composeMvVideos` 的 ffmpeg / 双音轨预览缓存实现（`audioMode: both` 的预览文件形态保持现状）。
- 在门禁库内探测视频时长（调用方传入 `videoDuration` 才做 P0-4）。
- 合并已打开的 PR 栈。
- 实机 RunningHub 试片（另按每晚口型试片规则处理）。

## API

```ts
type ComposeGatePurpose = 'preview' | 'export';
type ComposeGateAudioMode = 'source' | 'video' | 'both';

type ComposeGateInput = {
  videos?: Array<string | null | undefined>;
  segments?: Array<Record<string, unknown>>;
  cuts?: number[];
  trimStart?: number;
  trimEnd?: number;
  sourceAudioPath?: string;
  audioPath?: string;
  sourceAudioDuration?: number;
  audioMode?: string;
  purpose?: string;
  audioSource?: 'original' | 'generated' | 'unknown';
  durationToleranceSec?: number;
  leadSilenceSec?: number;
  measuredLeadSilenceSec?: number;
  requireVideo?: boolean;
};

type ComposeGatePlan = {
  ok: boolean;
  purpose: ComposeGatePurpose;
  audioMode: ComposeGateAudioMode;
  requireOriginalAudio: boolean;
  reason: string;
  compose: ComposeReport;
  alignment: AlignmentReport | null;
  segments: ComposeSegmentInput[];
};

normalizeComposeAudioMode(value?: unknown): ComposeGateAudioMode
// 省略 / source / original / 音乐原声 → source
// video / generated / 视频原声 → video
// both / preview / 双音轨 → both

normalizeComposePurpose(input): ComposeGatePurpose
// 显式 preview / 预览 → preview；export / final / master / 导出 / 成片 → export
// 否则 both → preview，其余 → export

buildComposeSegments(input): ComposeSegmentInput[]
// 优先使用带 start/end 的 segments，并把 videos 按序补到缺路径的段。
// 若段上没有时间，且有 trimStart/trimEnd，则用 cuts 在 trim 窗口内切段（与页面 segmentListFor 一致）。
// 再没有时间时，退回按 videos 生成仅含 index + videoPath 的段。

planMvComposeGate(input): ComposeGatePlan
```

## Severity / gate rules

| Situation | requireOriginalAudio | audioSource | ok when |
| --- | --- | --- | --- |
| export + source/omitted（官方成片） | true | original（若调用方强制 `generated` 则原样传入以触发 GENERATED_AUDIO_MASTER） | compose 与 alignment 均无 error |
| export + video（QC 试听） | false | 不传 generated | 段校验通过即可，reason 标明不是原曲母带 |
| preview + both/source | true | original | 段 + 原曲证据通过 |
| preview + video | false | 不传 generated | 段校验通过 |

`ok === false` 当 `compose.ok === false` 或 alignment（若运行）有 error。

## CLI

`mv-compose-gate --manifest <json> [--audio-mode source|video|both] [--purpose preview|export] [--tolerance 0.08] [--json]`

Manifest 与 `mv-compose-check` 兼容，可额外带 `videos` / `cuts` / `trimStart` / `trimEnd` / `audioMode` / `purpose`。stdout 为完整 plan JSON；`!ok` → exit 1。help 列出该命令。

## Verification

- 先写失败测试，再写实现。
- `npm test` 全绿；CLI 对通过夹具 exit 0 / `ok:true`，对失败夹具 exit 1。
- 无 RH、无密钥、无大媒体入仓。
