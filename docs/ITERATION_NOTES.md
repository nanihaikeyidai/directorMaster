# Iteration Notes

## 2026-11-05 00:00 Asia/Shanghai — MV dance-edm 模板（第六类）

### Module chosen
**MV / 模板库扩展**（每晚至少新增一类曲风模板）。UI picker 已落地，本晚加第六类 **dance-edm（电子舞曲 · 舞台/俱乐部独唱表演）**，挂进既有 `MV_PROMPT_TEMPLATES` 注册表。无 RH 付费。

### 验收标准
- 无人声段只出俱乐部/LED/舞台远景 / deck·controller 手部 / 雾与激光剪影，不出歌手面部特写；人声段首镜为面部特写；vocal_enters 起点前不对脸、起点后切脸
- 句中不切；人设表/缺场景报错；六段顺序正确
- 注册表含 band/folk-solo/folk-duo/piano-ballad/rock-solo/dance-edm，`buildMvPromptForTemplate('dance-edm')` 可用；未知模板报错并列出可选项
- `npm test` 全绿；`mv-templates` 输出 6 个模板

### Landed
- `buildDanceEdmMvPrompt` + `DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION=dance-edm-ref2va-v1`
- 注册表追加 `dance-edm`（label：电子舞曲（舞台/俱乐部））；`listMvPromptTemplates` / `buildMvPromptForTemplate` / UI picker 自动覆盖
- CLI：`mv-cut --template` help 列出 dance-edm（allowlist 来自注册表）
- 测试 `scripts/test-dance-edm-mv-prompt.mjs` 接入 `npm test`；软更新 UI picker 期望 id；文档 `docs/DANCE_EDM_MV_PROMPT_STANDARD.md`
- Design/plan：`docs/superpowers/specs/2026-11-05-dance-edm-mv-prompt-design.md`、`docs/superpowers/plans/2026-11-05-dance-edm-mv-prompt.md`

### Verification
- `npm test` 全绿（含 dance-edm + mv-ui-template-picker）
- `node cli/director-master.mjs mv-templates` 输出 6 个模板
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- 下一曲风：说唱（rap-hiphop）或其他变体，或 vocal-duo / live-band 变体
- open PR 合并卫生：#4、#6–#16 仍可能 open；本 PR 堆叠在 mv-ui-template-picker (#16) 之上

## 2026-11-04 00:00 Asia/Shanghai — MV UI 模板下拉读注册表

### Module chosen
**MV / UI 模板 picker**（CLI 注册表已有 band/folk-solo/folk-duo/piano-ballad/rock-solo，本晚把 `app/mv/page.tsx` 从硬编码 band 接到 `listMvPromptTemplates` / `buildMvPromptForTemplate`）。无 RH 付费。

### 验收标准
- `normalizeMvPromptTemplateId`：空/未知 → `band`；已注册 id 原样返回
- `GET /api/local/mv/templates` → `{ templates: listMvPromptTemplates() }`
- 项目持久化 `promptTemplateId`（create/PUT 规范化）；恢复项目时 soft-normalize
- MV 页工具栏 `<select aria-label="MV 提示词模板">`；生成走 `buildMvPromptForTemplate`；signature 含 templateId+version
- `npm test` 全绿；无 RH / 无密钥 / 无大媒体

### Landed
- `normalizeMvPromptTemplateId` + d.ts
- local-runtime：GET templates；create/PUT 写 `promptTemplateId`
- `app/mv/page.tsx`：模板下拉、生成路径、signature、save/restore
- 测试 `scripts/test-mv-ui-template-picker.mjs` 接入 `npm test`
- Design/plan：`docs/superpowers/specs/2026-11-04-mv-ui-template-picker-design.md`、`docs/superpowers/plans/2026-11-04-mv-ui-template-picker.md`

### Verification
- `npm test` 全绿（含 mv-ui-template-picker）
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- 下一曲风：dance-edm（电子舞曲）或其他变体
- open PR 合并卫生：#4、#6–#15 仍可能 open；本 PR 堆叠在 mv-master-rebrand (#15) 之上

## 2026-11-03 00:00 Asia/Shanghai — MV rock-solo 模板（第五类）

### Module chosen
**MV / 模板库扩展**（每晚至少新增一类曲风模板）。piano-ballad 已落地，本晚加第五类 **rock-solo（摇滚独唱 · 电吉他舞台弹唱）**，挂进既有 `MV_PROMPT_TEMPLATES` 注册表。无 RH 付费。

### 验收标准
- 无人声段只出舞台远景 / 电吉他手部·琴颈 / 音箱踏板细节，不出歌手面部特写；人声段首镜为面部特写；vocal_enters 起点前不对脸、起点后切脸
- 句中不切；人设表/缺场景报错；六段顺序正确
- 注册表含 band/folk-solo/folk-duo/piano-ballad/rock-solo，`buildMvPromptForTemplate('rock-solo')` 可用；未知模板报错并列出可选项
- `npm test` 全绿；`mv-templates` 输出 5 个模板

### Landed
- `buildRockSoloMvPrompt` + `ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION=rock-solo-ref2va-v1`
- 注册表追加 `rock-solo`（label：摇滚独唱（电吉他舞台））；`listMvPromptTemplates` / `buildMvPromptForTemplate` 自动覆盖
- CLI：`mv-cut --template` help 列出 rock-solo（allowlist 来自注册表）
- 测试 `scripts/test-rock-solo-mv-prompt.mjs` 接入 `npm test`；文档 `docs/ROCK_SOLO_MV_PROMPT_STANDARD.md`

### Verification
- `npm test` 全绿（band / folk-solo / folk-duo / piano-ballad / rock-solo / redub / subtitle / review / resume / align）
- `node cli/director-master.mjs mv-templates` 输出 5 个模板
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- UI 模板下拉直接读 `listMvPromptTemplates()`
- 下一曲风：电子舞曲（dance-edm）或其他变体
- open PR 合并卫生：#4、#6–#13 仍 open，本 PR 堆叠在 piano-ballad #13 之上

## 2026-11-02 00:00 Asia/Shanghai — MV piano-ballad 模板 + 模板注册表

### Module chosen
**MV / 模板库扩展**（每晚至少新增一类曲风模板）。folk-duo 已落地，本晚加第四类 **piano-ballad（钢琴自弹自唱）**，并把 CLI 的模板 if/else 收敛为注册表，后续加曲风只需注册一项。无 RH 付费。

### 验收标准
- 无人声段只出场地远景/琴键手部/琴槌细节，不出歌手面部特写；人声段首镜为面部特写；vocal_enters 起点前不对脸、起点后切脸
- 句中不切；人设表/缺场景报错；六段顺序正确
- 注册表含 band/folk-solo/folk-duo/piano-ballad，`buildMvPromptForTemplate('folk-solo')` 与原函数输出一致；未知模板报错并列出可选项
- `npm test` 全绿

### Landed
- `buildPianoBalladMvPrompt` + `PIANO_BALLAD_MV_PROMPT_TEMPLATE_VERSION=piano-ballad-ref2va-v1`
- `MV_PROMPT_TEMPLATES` / `listMvPromptTemplates()` / `buildMvPromptForTemplate()`（+ d.ts）
- CLI：`mv-cut --template piano-ballad`（allowlist 来自注册表）；新增 `mv-templates` 列出模板，方便 AI 调用
- 测试 `scripts/test-piano-ballad-mv-prompt.mjs` 接入 `npm test`；文档 `docs/PIANO_BALLAD_MV_PROMPT_STANDARD.md`

### Verification
- `npm test` 全绿（band / folk-solo / folk-duo / piano-ballad / redub / subtitle / review / resume / align）
- `node cli/director-master.mjs mv-templates` 输出 4 个模板
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- UI 模板下拉直接读 `listMvPromptTemplates()`
- 下一曲风：电子/舞曲（dance-performance）或 摇滚独唱 / 说唱
- open PR 合并卫生：#4、#6–#12 仍 open，本 PR 堆叠在 #12 之上

## 2026-11-01 00:00 Asia/Shanghai — MV folk-duo 提示词模板 + CLI

### Module chosen
**MV / folk-duo 模板库扩展**（用户定稿方案 A：扩展 `lib/mv-prompt.mjs` + CLI；folk-solo 之后落地 folk-duo；参考 BV1dsxM6EEKn 吉他手+主唱）。无 RH 付费。

### Landed
- `buildFolkDuoMvPrompt` + `FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION=folk-duo-ref2va-v1`
- 角色启发式（主唱/singer vs 吉他/guitar）；≥2 人物 + ≥1 场景；禁 identical-twin/copy，允许两张不同定妆
- 切镜：句中不切；无人声=场地远景或吉他手手部（不对主唱脸）；人声优先主唱脸 CU + 吉他手点缀；`vocal_enters` 混成
- CLI：`mv-cut --template folk-duo`（allowlist `band|folk-solo|folk-duo`）
- 测试：`scripts/test-folk-duo-mv-prompt.mjs` 接入 `npm test`
- Docs：design/plan + `docs/FOLK_DUO_MV_PROMPT_STANDARD.md`

### Verification
- `node scripts/test-folk-duo-mv-prompt.mjs` → ok
- `npm test` 全绿（含 band / folk-solo / folk-duo）
- 无 RunningHub / 无密钥 / 无大媒体提交

### Remaining / next night
- 下一曲风模板变体 **或** UI 模板下拉选择器 **或** Sprint 2 open PR 合并卫生（#4 / #6–#11 仍 open）
- folk-solo PR #11 与本 folk-duo 分支为堆叠关系，合入时注意 base

### Paths
- Design: `docs/superpowers/specs/2026-11-01-folk-duo-mv-prompt-design.md`
- Plan: `docs/superpowers/plans/2026-11-01-folk-duo-mv-prompt.md`

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
