# MV recommend from audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract music signals from existing ffmpeg/ffprobe energy hops and feed them into `recommendMvPromptTemplate`, including CLI `mv-recommend --audio` / `--hops-json`.

**Architecture:** Pure core in `lib/mv-music-signals.mjs` (`extractMusicSignalsFromHops`) reuses `isVocalActiveHop` + hop shape from `mv-lipsync-prep.mjs`. Thin IO `probeMusicSignals` calls `probeEnergyHops`. CLI `mv-recommend` extracts when `--audio`/`--hops-json` is present, then applies existing flag overrides. TDD via `scripts/test-mv-music-signals.mjs`.

**Tech Stack:** Node ESM (>=22), reuse `probeEnergyHops` (ffmpeg) for `--audio`, no new npm deps.

## Global Constraints
- Stack on `feature/mv-lipsync-prep` (PR #20 tip, itself stacked on PR #19).
- No RH calls in lib/tests; no secrets; no large media in git.
- Do not add a new genre template.
- Chinese `reasons` for inferred signals / 信号不足.
- Conservative BPM: omit rather than guess.

---

### Task 1: Failing tests for hop → signal extraction

**Files:**
- Create: `scripts/test-mv-music-signals.mjs`
- Modify: `package.json` (`test` + `test:mv-music-signals`)

- [x] Write failing tests: loud vocal-active → high/dense; quiet bass-dominant → low/sparse; mixed mid-level → medium; empty hops → 信号不足; extras override; recommend always returns a registered id; BPM regular-pulse vs noisy/flat; CLI `--hops-json --json` spawn
- [x] Run test — expect FAIL (module missing)
- [x] Commit failing tests (TDD record)

### Task 2: Implement `lib/mv-music-signals` + CLI wiring

**Files:**
- Create: `lib/mv-music-signals.mjs`
- Create: `lib/mv-music-signals.d.ts`
- Modify: `cli/director-master.mjs` (`mvRecommend`, `printMvRecommend`, help string)
- Modify: `package.json` if not already wired

- [x] Implement `extractMusicSignalsFromHops` + `probeMusicSignals`
- [x] Wire `mv-recommend --audio` / `--hops-json`; `--json` includes `{ ...recommendResult, extraction }`
- [x] Human-readable output prints inferred signals after the recommend summary
- [x] `npm test` green; commit feat

### Task 3: Docs + iteration notes

**Files:**
- Create: `docs/superpowers/specs/2026-11-09-mv-recommend-from-audio-design.md`
- Create: `docs/superpowers/plans/2026-11-09-mv-recommend-from-audio.md`
- Modify: `docs/ITERATION_NOTES.md` (prepend 2026-11-09 00:00 Asia/Shanghai)
- Modify: `docs/ITERATION_PLAN.md` (mark this item done; next-night remains vocal-source 15s trial / open PR hygiene / character-consistency)

- [x] Write/refresh docs
- [x] Commit docs
- [x] Push + open PR stacked on `feature/mv-lipsync-prep` (do not merge)
