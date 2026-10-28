# Subtitle V1 ASR Parse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development. Steps use checkbox syntax.

**Goal:** Offline RH/Confucius-like ASR JSON → `normalizeCues` + cue patch helper + CLI `--asr`, no network.

**Architecture:** New `lib/subtitle-asr.mjs` owns RH shape variance and patches; V0 `lib/subtitle-cues.mjs` stays the export contract; CLI thin-wires `--asr`.

**Tech stack:** Node ESM, assert tests like `scripts/test-subtitle-cues.mjs`.

**Approved by standing nightly routine** (2026-10-29).

---

### File map

| File | Responsibility |
|---|---|
| `lib/subtitle-asr.mjs` (+ `.d.ts`) | `parseRhAsrOutput`, `applyCuePatches` |
| `scripts/test-subtitle-asr.mjs` | Unit + fixture coverage |
| `scripts/fixtures/rh-asr-*.json` | Shape fixtures |
| `cli/director-master.mjs` | `--asr`, `--duration-ms`, video+key error |
| `package.json` | Wire `test-subtitle-asr` into `npm test` |
| Docs | design (done), this plan, ITERATION_*, SUBTITLE_BILINGUAL_PLAN |

**Next night (not tonight):** live RH adapter behind key / 成片入口 / optional burn / UI cue editor.

---

### Task 1: Failing tests + fixtures

**Files:**
- Create: `scripts/test-subtitle-asr.mjs`
- Create: `scripts/fixtures/rh-asr-segments.json`
- Create: `scripts/fixtures/rh-asr-sentences-ms.json`
- Create: `scripts/fixtures/rh-asr-result-nested.json`
- Create: `scripts/fixtures/rh-asr-array.json`
- Create: `scripts/fixtures/rh-asr-untimed-text.json`

- [x] Assert `parseRhAsrOutput` for each shape; weak-split needs `durationMs` + `needsReview`/`source:'weak-split'`; plain timed pass-through; `applyCuePatches` happy + OOB + inverted; `normalizeCues(result.cues)` succeeds
- [x] Run `node scripts/test-subtitle-asr.mjs` → FAIL (module missing)

### Task 2: Implement `lib/subtitle-asr.mjs`

**Files:**
- Create: `lib/subtitle-asr.mjs`
- Create: `lib/subtitle-asr.d.ts`

- [x] Implement parser + patch per design
- [x] Pass `scripts/test-subtitle-asr.mjs`

### Task 3: CLI + package wire

**Files:**
- Modify: `cli/director-master.mjs`
- Modify: `package.json`

- [x] `--asr` path writes bilingual exports; passes `--duration-ms`
- [x] Mutual exclusion `--asr` vs `--cues`
- [x] `--video` without cues/asr: no key → V0 message; key present → "V1 live RH not wired tonight / use --asr" (no network)
- [x] `npm test` includes subtitle-asr
- [x] Dry-run CLI on a fixture

### Task 4: Docs

**Files:**
- Update: `docs/ITERATION_PLAN.md` Sprint 3 partial checkboxes
- Prepend: `docs/ITERATION_NOTES.md` for 2026-10-29
- Update: `docs/SUBTITLE_BILINGUAL_PLAN.md` V1 status note
- Spec/plan already written

- [x] Docs reflect night-1 slice done; live RH still open

### Task 5: Verify + finish branch

- [x] `npm test` green
- [x] eslint changed files if project uses it
- [x] Commit, push `-u origin HEAD`, `gh pr create` targeting main
- [x] Do **not** merge Sprint 2 PRs #6/#7
