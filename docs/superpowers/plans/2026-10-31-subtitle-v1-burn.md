# Subtitle V1 Burn-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Optional ffmpeg hard-sub burn-in lib + CLI `--burn` after soft bilingual export, skip cleanly when ffmpeg missing.

**Architecture:** New `lib/subtitle-burn.mjs` owns path escape, pure arg builder, probe, and injectable `burnSubtitlesIntoVideo`. Soft writers stay in `subtitle-cues.mjs`. CLI adds `--burn` and relaxes `--video`+`--cues`/`--asr` mutual exclusion only when burning.

**Tech Stack:** Node ESM, `node:child_process` execFile, assert tests like `scripts/test-subtitle-rh-asr.mjs`.

## Global Constraints

- No RunningHub network calls.
- Never commit secrets, privacy paths, or large generated mp4s.
- Soft export must not require ffmpeg.
- Do not merge open Sprint 2 PRs; do not redo Sprint 2.
- Standing rule: 不擅自付费重试 RunningHub.

---

### File map

| File | Responsibility |
|---|---|
| `lib/subtitle-burn.mjs` (+ `.d.ts`) | Escape, args, probe, burn |
| `scripts/test-subtitle-burn.mjs` | Injectable-exec coverage |
| `cli/director-master.mjs` | `--burn` + help; allow `--video` with cues/asr when burn |
| `package.json` | Wire test into `npm test` |
| Docs | design (already), this plan, ITERATION_*, SUBTITLE_BILINGUAL_PLAN |

---

### Task 1: Failing tests

**Files:**
- Create: `scripts/test-subtitle-burn.mjs`

**Interfaces:**
- Produces expected API: `escapeSubtitlesFilterPath`, `buildBurnFfmpegArgs`, `probeFfmpeg`, `burnSubtitlesIntoVideo`, `resolveBurnSubtitleFile`

- [x] **Step 1: Write failing test file** covering:
  - escape: `C:\\subs\\a.ass` → forward slashes + `\:` for drive colon
  - escape: `/tmp/foo bar.ass` → path usable in filter (spaces preserved inside quotes handled by arg builder)
  - `buildBurnFfmpegArgs` for `.ass`: includes `-vf` with `subtitles=` and **no** `force_style`
  - `buildBurnFfmpegArgs` for `.srt`: includes `force_style`
  - `probeFfmpeg({ execFile })` when exec throws ENOENT → `{ available:false }`
  - `probeFfmpeg` when exec resolves → `{ available:true }`
  - `burnSubtitlesIntoVideo` with probe unavailable → `{ status:'skipped', reason:'ffmpeg-not-found' }`
  - happy path: mock execFile records args; returns `{ status:'burned', outputPath }`
  - missing videoPath or subtitlePath → throw
  - `resolveBurnSubtitleFile`: prefer bilingual.ass from written paths

- [x] **Step 2: Run → FAIL** (`module not found`)

```bash
node scripts/test-subtitle-burn.mjs
```

---

### Task 2: Implement lib

**Files:**
- Create: `lib/subtitle-burn.mjs`
- Create: `lib/subtitle-burn.d.ts`

**Interfaces:**
- Consumes: none from subtitle-cues (paths only)
- Produces: exports listed above

- [x] **Step 3: Minimal implementation** matching design
- [x] **Step 4: Pass** `node scripts/test-subtitle-burn.mjs`

---

### Task 3: CLI + package

**Files:**
- Modify: `cli/director-master.mjs`
- Modify: `package.json`

- [x] **Step 5: CLI**
  - Parse `flag('burn')` / `--burn`
  - If `--burn` and (`--cues` or `--asr`): require `--video` as burn source; **do not** treat as ASR pipeline; allow coexistence
  - After `writeBilingualSubtitles`, if burn: `resolveBurnSubtitleFile` → `burnSubtitlesIntoVideo` → attach `burn` on return
  - If `--video` ASR path returns `planned`: set `burn: { status:'skipped', reason:'no-cues-yet' }` when `--burn` without forcing live
  - If `--burn` without video when cues/asr: clear error
  - Update help string

- [x] **Step 6: package.json** append `&& node scripts/test-subtitle-burn.mjs` to `test` script; optional `test:subtitle-burn`

---

### Task 4: Docs

- [x] Prepend `docs/ITERATION_NOTES.md` for 2026-10-31
- [x] Update Sprint 3 in `docs/ITERATION_PLAN.md` — mark burn done; leave UI cue edit open
- [x] Short V1 night-3 note in `docs/SUBTITLE_BILINGUAL_PLAN.md`
- [x] Mark plan checkboxes done after verify

---

### Task 5: Verify + finish branch

- [x] `npm test` full green
- [x] Manual soft+burn dry: cues fixture + tiny video optional; if creating mp4 for smoke, delete before commit (do not commit mp4)
- [x] Commit / push / `gh pr create` against `main` (or stack on night-2 base — prefer PR from `feature/subtitle-v1-burn`; body notes depends on #9 soft-export)
- [x] Load verification-before-completion + finishing-a-development-branch patterns: evidence before claims

### Commit message style

```
feat(subtitle): Sprint 3 V1 night-3 — optional ffmpeg burn-in + CLI --burn
```

