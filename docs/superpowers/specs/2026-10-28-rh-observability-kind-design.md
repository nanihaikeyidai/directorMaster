# RunningHub 可观测 + kind 预检（Sprint 2 余项）设计 — 2026-10-28

## 问题
1. `summarizeCloudJob` 已有纯函数，但任务中心 / 轮询响应未带摘要字段，前端看不到耗时、终态、段数、kind。
2. `/config` 的 `shortDramaWorkflows` 只有 path/fileName/nodeCount，选中单段模板（`mv-reference` / `feihou-remix`）时前端无法提前警告；多段批量会撞上后端 400。
3. MV `/api/local/workflows` 已有 `classes`，但未归一成 `kind` / `singleSegment`，目录按钮无法一眼区分。

## 方案（小步、可测）
### A. 纯函数扩展 `lib/runninghub-guards.mjs`
- `isSingleSegmentKind(kind)` → `SINGLE_SEGMENT_KINDS.has(kind)`
- `annotateWorkflowListing(entry, workflowJson)`：在 listing 上附加 `kind`（检测失败则 `null` + `kindError`）与 `singleSegment`（boolean）
- `attachJobSummary(job, { secret })`：返回 `{ ...job, summary: summarizeCloudJob(job, { secret }) }`（不改动磁盘原始字段语义；API 层附加）

### B. 服务端
- `listWorkflowFiles`：解析 JSON 后用 `detectRunningHubWorkflowKind` 填 `kind`/`singleSegment`
- `cloudConfig`：额外返回 `mvWorkflows`（同 shape）；已有 `shortDramaWorkflows` 带 kind
- `listCloudJobs` / `cloudStatus`：响应附加 `summary`（`summarizeCloudJob`；密钥空串即可，磁盘错误应已脱敏）
- `listMvWorkflowFiles`：cloud/local 项增加 `kind`/`singleSegment`（复用 guards + detect）

### C. 前端
- 导演台任务中心：云端轮询时展示 `summary.elapsedSec`、`workflowKind`、`segmentCount`、终态标记；错误仍用脱敏 `summary.error || job.error`
- 短剧设置：选中 `singleSegment===true` 的工作流时显示中文提示「一次只支持单段，多段请逐段提交」
- MV 工作流目录：按钮副文案显示 kind（如 `mv-reference · 单段`）

## 非目标
- 不付费调 RH；不改 adapter 提交逻辑；不做字幕 V1；不做短剧「自动改串行」队列（仅提示）

## 验收
- [ ] listing / config 项含 `kind` 与 `singleSegment`；无效 JSON 不含假 kind
- [ ] jobs GET 列表与单条含 `summary`（elapsedSec/terminal/脱敏 error）
- [ ] 任务中心可见耗时与 kind；短剧单段模板有预检文案；MV 目录显示 kind
- [ ] `npm test` 全绿；无密钥/大文件入仓
