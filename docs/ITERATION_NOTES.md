# Iteration Notes

## 2026-10-30 会话 — Sprint 3 night-2：Live RH ASR adapter（key-gated）+ CLI 成片入口

### Module chosen
**视频后期配字幕 / Sprint 3 V1 night-2**：`lib/subtitle-rh-asr.mjs` 可注入 deps 的 RH ASR 流水线 + CLI `--video` 成片入口。默认/`--dry-run` 仅写 `asr-job-plan.json`（`planned`）；`--watch` 接线真实传输但本夜验证不调用付费 RH。

### Acceptance
1. `DEFAULT_SUBTITLE_ASR_WORKFLOW_ID` = `2104649076645130241`；`hasSubtitleAsrKey` / `resolveSubtitleAsrConfig` / `buildSubtitleAsrSubmitBody` / `extractAsrRawFromCloudOutputs` / `runSubtitleAsrPipeline(input, deps)`
2. 缺钥抛清晰中英错误；永不返回/打印 API key
3. dryRun → `planned` + plan JSON；happy mock → cues 写出；FAILED / poll cap 覆盖
4. `scripts/test-subtitle-rh-asr.mjs` 接入 `npm test`（无 fetch）
5. CLI `--video --out [--dry-run|--watch|--workflow-id|--duration-ms|…]`；移除「尚未接入」文案
6. adapters 一句话指向 lib；docs/spec/plan/ITERATION_*/SUBTITLE 更新
7. 无实机 RH 付费调用

### Landed
- `lib/subtitle-rh-asr.mjs` (+ `.d.ts`)
- `scripts/test-subtitle-rh-asr.mjs`
- CLI 成片入口 + help
- Docs：`docs/superpowers/specs/2026-10-30-subtitle-v1-rh-live-design.md`、`plans/2026-10-30-subtitle-v1-rh-live.md`

### Verification
- `npm test` 全绿；CLI dry-run 用假 video 路径；无 RH HTTP

### Remaining / next night
- 可选 ffmpeg burn-in
- UI cue 编辑再导出
- （可选）实机冒烟需用户显式授权密钥与付费

### Paths
- Design: `docs/superpowers/specs/2026-10-30-subtitle-v1-rh-live-design.md`
- Plan: `docs/superpowers/plans/2026-10-30-subtitle-v1-rh-live.md`


## 2026-10-29 会话 — Sprint 3 night-1：RH ASR 离线解析 → cues + patch + CLI --asr

### Module chosen
**视频后期配字幕 / Sprint 3 V1 night-1**：离线将 RunningHub/Confucius-like ASR JSON 映射为 cue，支持 cue patch，CLI `--asr` 导出双语字幕。无 RH 付费/网络 ASR。

### Acceptance
1. `parseRhAsrOutput(raw, options?)` → cue 形状，且 `normalizeCues` 成功
2. 支持 segments(秒) / sentences(ms) / result 嵌套 / 数组 / plain timed 透传 / 无时间戳 text+durationMs 弱切分（`needsReview` + `source:'weak-split'`）
3. `applyCuePatches(cues, patches)` 不可变；拒 OOB / 非法时间
4. CLI `subtitle --asr <json> --out <dir> [--langs] [--duration-ms] [--basename]` 离线双语导出
5. `--video` 无 --cues/--asr：无 key → 明确错误；有 key → 提示 V1 live 未接线、用 `--asr`（不调 RH）
6. `scripts/test-subtitle-asr.mjs` + fixtures 接入 `npm test`
7. Design/plan/ITERATION_*/SUBTITLE 文档更新
8. 无完整 RH submit / 无 UI 页（adapters 仅注释指向 lib）

### Landed
- `lib/subtitle-asr.mjs` (+ `.d.ts`)
- fixtures `scripts/fixtures/rh-asr-*.json`
- CLI `--asr` / `--duration-ms`；`--video` 错误文案升级
- Docs：`docs/superpowers/specs/2026-10-29-subtitle-v1-asr-parse-design.md`、`plans/2026-10-29-subtitle-v1-asr-parse.md`

### Verification
- `npm test`（含 test-subtitle-asr）全绿；无密钥/大文件入仓；无 RH 调用

### Remaining / next night
- Live RH adapter（密钥后门禁 submit/poll）+ 成片入口
- 可选 ffmpeg burn
- UI cue 编辑再导出

### Paths
- Design: `docs/superpowers/specs/2026-10-29-subtitle-v1-asr-parse-design.md`
- Plan: `docs/superpowers/plans/2026-10-29-subtitle-v1-asr-parse.md`

## 2026-10-26 会话 — Sprint 1 余项：MV 音画对齐检查（P0-4）

### Module chosen
**MV 音画对齐检查**（Sprint 1 剩余 P0-4）：导出/合成前纯函数报告，默认容差 80ms。

### Landed
- `lib/mv-av-alignment.mjs` (+ `.d.ts`)：`checkAvAlignment` / `formatAlignmentReport`
  - codes：AUDIO/VIDEO_DURATION_MISMATCH、AV_MISMATCH、TAIL_TRUNCATION、LEAD_SILENCE_MISMATCH、MISSING_AUDIO/VIDEO、INVALID_DURATION
  - 每条 issue 含中文 `message` + `suggestion`；`ok === false` 仅当存在 `severity: error`
- CLI：`mv-align-check --manifest <json> [--tolerance 0.08] [--require-video] [--require-audio|--no-require-audio]`
  - 字段别名：`duration`/`expectedDuration`、`exportedDuration`/`audioDuration`、顶层 lead silence
  - stdout JSON；`!ok` → `process.exitCode = 1`
- 示例：`examples/mv-align-fixture.json`（ok）、`examples/mv-align-fixture-bad.json`（多错误）
- 测试：`scripts/test-mv-av-alignment.mjs` 已接入 `npm test`

### Verification
- `npm test` → 既有套件 + mv-av-alignment 全绿
- CLI ok fixture → exit 0 / `ok:true`；bad fixture → exit 1 + issues
- 无 RH/网络/密钥；未合 main

### Remaining / next
- UI 导出前硬门禁（可选 soft report）未做
- P0-5 最终合成校验（顺序/空洞/重复）仍未做
- Sprint 2：RunningHub 多段显式化 / 可移植密钥 / 可观测

### Paths
- Design: `docs/superpowers/specs/2026-10-26-mv-av-alignment-design.md`
- Plan: `docs/superpowers/plans/2026-10-26-mv-av-alignment.md`

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
- 音画对齐检查（Sprint 1 余力）→ 已在 2026-10-26 落地 lib+CLI
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
