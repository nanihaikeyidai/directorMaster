# MV character consistency pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify 定妆/三视图/换装/场景 refs, require a close-up face lock, order them for Ref2VA, and emit identity-lock prompt text via `lib/mv-character-consistency.mjs` + CLI `mv-character-pack`.

**Architecture:** Pure core in `lib/mv-character-consistency.mjs` reuses `assessFaceCloseUpRef` from `mv-lipsync-prep.mjs`. Thin `listCharacterRefPaths` helper for CLI `--dir`. CLI mirrors other `mv-*` commands (human-readable Chinese + `--json`, exit 1 if `!ok`). TDD via `scripts/test-mv-character-consistency.mjs`.

**Tech Stack:** Node ESM (>=22), no new npm deps.

## Global Constraints
- Stack on `feature/mv-recommend-from-audio` (PR #21 tip).
- No RH calls in lib/tests; no secrets; no large media in git.
- Do not add a new genre template.
- Chinese `reason` / report / warnings; `identityLockText` is English+Chinese.
- Do not commit private paths like `D:\...`.

---

### Task 1: Failing tests for classify + pack

**Files:**
- Create: `scripts/test-mv-character-consistency.mjs`
- Modify: `package.json` (`test` + `test:mv-character-consistency`)

- [x] Write failing tests: path classification for all roles; meta role override; faceBox promotion; reject without face; pack ordering (costume after face, scene last); identityLockText face/identity language; missing three-view warnings; listCharacterRefPaths filters images
- [x] Run test — expect FAIL (module missing)
- [x] Commit with implementation (feat lib+test)

### Task 2: Implement lib + CLI

**Files:**
- Create: `lib/mv-character-consistency.mjs`
- Create: `lib/mv-character-consistency.d.ts`
- Modify: `cli/director-master.mjs` (command + help)
- Modify: `package.json` if not already wired

- [x] Implement `classifyCharacterRef` + `buildCharacterConsistencyPack` + `formatCharacterPackReport` + `listCharacterRefPaths`
- [x] Wire `mv-character-pack --ref/--dir/--json`; exit 1 when `!ok`
- [x] `npm test` green; commit feat lib+test then feat cli

### Task 3: Docs + iteration notes

**Files:**
- Create: `docs/superpowers/specs/2026-11-10-mv-character-consistency-design.md`
- Create: `docs/superpowers/plans/2026-11-10-mv-character-consistency.md`
- Modify: `docs/ITERATION_NOTES.md` (prepend 2026-11-10 00:00 Asia/Shanghai)
- Modify: `docs/ITERATION_PLAN.md` (tick character-consistency; next-night remains vocal-source 15s trial / open PR hygiene)

- [x] Write/refresh docs
- [x] Commit docs
- [x] Push + open PR stacked on `feature/mv-recommend-from-audio` (do not merge)
