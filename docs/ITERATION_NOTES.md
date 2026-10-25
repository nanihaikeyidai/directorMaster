# Iteration Notes

## 2026-10-25 会话 — Sprint 1 MV 审核状态 + 可恢复任务

### Module chosen
**MV 生产正确性**（定稿优先）：分段审核门禁 + 生成队列持久化 / jobId 续跑 / 失败重试。

### Landed
- `lib/mv-segment-review.mjs`：`pending|approved|submitted|failed` 纯函数 + 批量过滤
- `app/mv/page.tsx`：
  - 每段「通过审核」+ 状态标签（待审核/已审核/已提交/失败）
  - `enqueueGeneration` / 批量弹窗只接受 `approved`；无一 approved 则提示不入队
  - 「一键云端出完整 MV」自动切段+提示词后**停在 pending**，不再自动入队
  - 项目保存：`segmentReviews` / `generationQueue`（queued）/ `generationActive`
  - 恢复项目：按 jobId 续 `waitCloud`；恢复排队项并 `drain`；失败段「重试」
- `lib/mv-generation-resume.mjs`：resume 索引、队列规范化、active 序列化/恢复
- 测试：`test-mv-segment-review` + `test-mv-generation-resume` 已接入 `npm test`

### Verification
- `npm test` → mv-prompt + redub + subtitle + segment-review + generation-resume 全绿
- 未合 main；推送 `feature/mv-review-and-resume` → PR #4

### Manual checklist（需本机导演台）
1. 生成提示词 → 未点「通过审核」时本地/云端/批量均不可提交
2. 审核 2 段 → 批量默认只勾已审核；未审核 checkbox 禁用
3. 一键完整 MV → 只出提示词并提示去审核，不入队
4. 提交云端后刷新：有 jobId 的 running 段应继续轮询（需本地 RH 服务）
5. 人为失败段出现「重试」→ 可再次入队

### Remaining / next
- 音画对齐检查（Sprint 1 余力，未做）
- Sprint 2：RunningHub 多段显式化 / 可移植密钥 / 可观测
- 实机 RH 续跑未在本环境验证（无本机 Comfy/RH）

### Paths
- Design: `docs/superpowers/specs/2026-10-25-mv-review-and-resume-design.md`
- Plan: `docs/superpowers/plans/2026-10-25-mv-review-and-resume.md`

## 2026-10-25 00:00 Asia/Shanghai — Subtitle V0 offline cues

### Module chosen
**视频后期配字幕** — highest gap (plan-only, zero code). Video gen / MV already wired. Standing rule: no RH paid retries → ship offline cue normalize + SRT/ASS exporters first.

### Landed
- `lib/subtitle-cues.mjs` (+ `.d.ts`): `normalizeCues`, `formatSrtTimestamp`, `cuesToSrt`, `cuesToAssBilingual`, `writeBilingualSubtitles`, `detectSubtitleWorkflowKind`
- CLI: `npm run director -- subtitle --cues <json> --out <dir> [--langs zh,en]`
- Missing-key path: `--video` without cues and without `RUNNINGHUB_API_KEY` → clear error, exit 1, no network
- Adapter stub: `detectSubtitleWorkflowKind` in `vite-plugins/runninghub-workflow-adapters.ts` (heuristic)
- Tests: `scripts/test-subtitle-cues.mjs` wired into `npm test`
- Docs: cherry-picked bilingual plan + Superpowers PM; design/plan under `docs/superpowers/`; V0.5 checkboxes updated

### Verification
- `node scripts/test-subtitle-cues.mjs` → ok
- `npm test` → mv-prompt + redub + subtitle ok
- CLI fixture dry-run wrote `.zh.srt` / `.en.srt` / `.bilingual.ass`
- No RH calls; no secrets committed

### New product asks (for backlog)
1. **V1 ASR adapter**: load RH API workflow JSON for Confucius4-R2T2; map upload + poll + parse to cues. Acceptance: with key, `--video` produces cues JSON under `workspace/subtitles/<jobId>/` without crashing on missing nodes.
2. **Cue editor API**: PATCH cues then re-export SRT/ASS without re-ASR. Acceptance: edit one cue text/times → exporters reflect change; invalid times rejected.
3. **Optional burn-in**: `ffmpeg` soft→hard sub when `--burn`. Acceptance: output mp4 plays with visible dual-line subs; skip cleanly if ffmpeg missing.

### Remaining gaps / blockers
- No live RH ASR until workflow JSON exported and key available (no paid retries tonight)
- Translation still caller-supplied (`translation` field); no LLM/API layer
- No UI entry on成片车厢 yet
- Open docs PRs #1 / #2 may overlap; this PR consolidates those docs + V0 code

### Suggested next-night plan
1. Export/save subtitle RH workflow JSON to `workspace/workflows/subtitle/cloud/` (account-side ID)
2. Wire `asr-r2t2` create/poll path behind key gate (single dry validate if free, else stub parse of fixture ASR output)
3. Map RH text/JSON outputs → `normalizeCues`
4. Minimal成片「配字幕」entry or task-center stub pointing at offline CLI for now

### Paths
- Design: `docs/superpowers/specs/2026-10-25-subtitle-v0-cues-design.md`
- Plan: `docs/superpowers/plans/2026-10-25-subtitle-v0-cues.md`
- Product plan: `docs/SUBTITLE_BILINGUAL_PLAN.md`
