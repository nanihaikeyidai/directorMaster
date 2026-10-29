# Subtitle V1 RH Live Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Key-gated injectable RunningHub ASR pipeline + CLI 成片入口 (`--video` dry-run/plan + `--watch` transport wired but not live-invoked tonight).

**Architecture:** New `lib/subtitle-rh-asr.mjs` owns config, pure body/output helpers, and `runSubtitleAsrPipeline` with required injectable deps. Night-1 `parseRhAsrOutput` + V0 `writeBilingualSubtitles` remain the cue/export contract. CLI default path is dry-run (no RH HTTP).

**Tech Stack:** Node ESM, assert tests like `scripts/test-subtitle-asr.mjs`, fetch only inside optional RH deps factory.

## Global Constraints

- No real RunningHub network calls in tests or nightly verification.
- Never log or return `RUNNINGHUB_API_KEY`.
- Do not merge Sprint 2 PRs #6/#7; do not redo Sprint 2.
- Standing rule: 不擅自付费重试 RunningHub.

---

### File map

| File | Responsibility |
|---|---|
| `lib/subtitle-rh-asr.mjs` (+ `.d.ts`) | Config, key gate, body builder, extract outputs, pipeline, RH deps factory |
| `scripts/test-subtitle-rh-asr.mjs` | Mock-deps coverage |
| `cli/director-master.mjs` | `--video` dry-run / `--watch` wire; help |
| `package.json` | Wire test into `npm test` |
| `vite-plugins/runninghub-workflow-adapters.ts` | One-line pointer to lib |
| Docs | design, this plan, ITERATION_*, SUBTITLE_BILINGUAL_PLAN |

---

### Task 1: Failing tests

**Files:**
- Create: `scripts/test-subtitle-rh-asr.mjs`

- [x] Cover: no key throws; dryRun planned; happy path mock upload→create→poll SUCCESS→outputs fixture → cues written; FAILED path; poll timeout/cap
- [x] Pure helpers: `hasSubtitleAsrKey`, `resolveSubtitleAsrConfig`, `buildSubtitleAsrSubmitBody`, `extractAsrRawFromCloudOutputs`
- [x] Run → FAIL (module missing)

### Task 2: Implement lib

**Files:**
- Create: `lib/subtitle-rh-asr.mjs`
- Create: `lib/subtitle-rh-asr.d.ts`

- [x] Implement per design (injectable pipeline + RH deps factory)
- [x] Pass `scripts/test-subtitle-rh-asr.mjs`

### Task 3: CLI + package + adapter note

**Files:**
- Modify: `cli/director-master.mjs`
- Modify: `package.json`
- Modify: `vite-plugins/runninghub-workflow-adapters.ts` (comment)

- [x] `--video --out` with key → dry-run / default planned + `asr-job-plan.json`
- [x] `--watch` wires real deps (not invoked in verify)
- [x] Remove 「尚未接入」 error string
- [x] Help text updated; `npm test` includes new script

### Task 4: Docs

- [x] Prepend `docs/ITERATION_NOTES.md` 2026-10-30
- [x] Update Sprint 3 checkboxes in `docs/ITERATION_PLAN.md`
- [x] Short status in `docs/SUBTITLE_BILINGUAL_PLAN.md`
- [x] Mark plan checkboxes done after verify

### Task 5: Verify + finish branch

- [x] `npm test` full green
- [x] CLI dry-run with tiny fake video path + key in env for that process only
- [x] Commit / push / `gh pr create` (new PR; do not merge)
