# MV 分段审核与可恢复任务 — 设计

**日期：** 2026-10-25  
**状态：** 已定稿（用户 approve-merge-sprint1-mv）

## 问题

1. 文案要求「先审核再生成」，但没有段级审核状态；`promptsReady` 只表示提示词与签名一致。
2. 「一键云端出完整 MV」自动生成提示词后立刻把**全部段**入队，可绕过人工审核。
3. 批量弹窗可选任意段；刷新后进行中的云端/`jobId` 不能可靠续跑与单段重试。

## 方案

纯逻辑抽到 `lib/mv-segment-review.mjs`（可单测），UI/`page.tsx` 只接线；生成队列元数据写入项目持久化，刷新后恢复。

### 审核状态机

每段：`pending` | `approved` | `submitted` | `failed`

- 新生成提示词或签名失效 → 该段（或全部）回 `pending`，清除旧 `approved`
- 用户点「通过审核」→ `approved`（仅当该段有当前有效提示词）
- 成功提交生成队列 → `submitted`
- 生成失败 → `failed`（可「重试」回到入队，成功后再 `submitted`）

批量 / 单段云端或本地生成 / 一键完整 MV：默认索引 = 仅 `approved`；无一 approved 则提示，不入队。一键流程在自动切段+出提示词后**停在 pending**，不再自动入队。

### 可恢复任务

持久化（随现有 `saveCurrentProject` / project bundle）：

- `segmentReview: Record<index, { status, updatedAt? }>`
- `generation` 段状态含 `jobId` / `message` / `provider`
- `generationQueue` 未完成项（queued/running）

加载项目后：对仍有 `jobId` 且非终态的 runninghub 段继续 poll；队列未完成项重新 `drain`；提供「重试失败段」。

## 非目标

不重做切点 UX；不做 P1 歌词导入；本 sprint 不做音画对齐（余力再加）。

## 验收

1. 未审核段不能被批量或一键云端提交。
2. 改切点/素材后已审核段回到 pending。
3. 失败段可单段重试；刷新后仍能根据 jobId 看到进行中任务（有本地服务时）。
