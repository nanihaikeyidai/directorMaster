# MV lipsync trial prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate nightly lipsync trials on vocal-band activity + face close-up before any RH spend.

**Architecture:** Pure scoring in `lib/mv-lipsync-prep.mjs` (inject hops / image meta); thin ffmpeg probe + CLI `mv-lipsync-prep`; TDD via `scripts/test-mv-lipsync-prep.mjs`.

**Tech Stack:** Node ESM (>=22), ffmpeg/ffprobe for CLI probe only, no new npm deps.

## Global Constraints
- Stack on `feature/mv-template-recommend` (PR #19 tip).
- No RH calls in lib/tests; no secrets; no large media in git.
- Chinese `reason` strings for operator-facing refusal.

---

### Task 1: Failing tests + pure vocal/face gates

**Files:**
- Create: `scripts/test-mv-lipsync-prep.mjs`
- Create: `lib/mv-lipsync-prep.mjs`
- Create: `lib/mv-lipsync-prep.d.ts`
- Modify: `package.json` (test script)
- Modify: `cli/director-master.mjs` (mv-lipsync-prep + help)

- [ ] Write failing tests for `isVocalActiveHop`, `selectVocalSegment`, `assessFaceCloseUpRef`, `buildLipsyncTrialPlan`
- [ ] Run test — expect FAIL (module missing)
- [ ] Implement minimal pure functions + d.ts
- [ ] Wire CLI stub that calls buildLipsyncTrialPlan with injected hops when `--hops-json` given; live `--audio` uses probeEnergyHops
- [ ] `npm test` green; commit

### Task 2: Docs + iteration notes

- [ ] Update `docs/ITERATION_NOTES.md` (2026-11-08 entry) + `docs/ITERATION_PLAN.md` checkbox
- [ ] Commit docs
