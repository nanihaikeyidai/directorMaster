# Iteration Notes

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
