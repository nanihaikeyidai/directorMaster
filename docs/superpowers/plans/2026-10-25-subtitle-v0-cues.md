# Subtitle V0 Cues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development. Steps use checkbox (`- [x]`) syntax.

**Goal:** Ship offline cue normalize + bilingual SRT/ASS export + CLI + adapter stub with tests, no RH network.

**Architecture:** Pure `lib/subtitle-cues.mjs` for model/export; thin CLI command; heuristic-only adapter export in `runninghub-workflow-adapters.ts`.

**Tech stack:** Node ESM (existing), assert tests like `scripts/test-mv-prompt.mjs`.

---

### Task 1: Failing tests + fixture

**Files:**
- Create: `scripts/test-subtitle-cues.mjs`
- Create: `scripts/fixtures/subtitle-cues-sample.json`

- [x] Write asserts for: normalize timed lines; ms→SRT timestamp; bilingual SRT two files / dual ASS; reject inverted/empty; writeBilingualSubtitles to temp dir
- [x] Run `node scripts/test-subtitle-cues.mjs` → fail (module missing)

### Task 2: Cue library

**Files:**
- Create: `lib/subtitle-cues.mjs`
- Create: `lib/subtitle-cues.d.ts`

- [x] Implement `normalizeCues`, `formatSrtTimestamp`, `cuesToSrt`, `cuesToAssBilingual`, `writeBilingualSubtitles`
- [x] Pass `scripts/test-subtitle-cues.mjs`

### Task 3: CLI + package test wire

**Files:**
- Modify: `cli/director-master.mjs`
- Modify: `package.json`

- [x] Add `subtitle` command (offline cues; video-without-cues missing-key path)
- [x] `npm test` includes subtitle test
- [x] Dry-run CLI on fixture → files in temp out

### Task 4: Adapter stub

**Files:**
- Modify: `vite-plugins/runninghub-workflow-adapters.ts`
- Extend subtitle test or small assert for `detectSubtitleWorkflowKind` (import via dynamic or duplicate heuristic test in .mjs by reading exported logic — prefer exporting a tiny shared check; for TS-only file, test heuristic by documenting + unit via node --experimental or duplicate minimal mirror in lib). **Decision:** implement `detectSubtitleWorkflowKind` in `lib/subtitle-cues.mjs` as pure helper AND re-export/wrap from adapters TS for app use; tests import from lib.

Actually keep heuristic in both places lightly: lib has `detectSubtitleWorkflowKindFromClasses(classNames)` and TS adapter wraps workflow → class list → same logic inline matching lib (or adapters imports from lib if vinext allows). Simplest: put full `detectSubtitleWorkflowKind(workflow)` in `lib/subtitle-cues.mjs` (accepts plain object) and call/re-export from adapters.

### Task 5: Docs + finish

**Files:**
- Update: `docs/ITERATION_PLAN.md` V0.5 checkboxes
- Create: `docs/ITERATION_NOTES.md`
- Spec/plan already written

- [x] `npm test` green
- [x] Commit, push, `gh pr create`
