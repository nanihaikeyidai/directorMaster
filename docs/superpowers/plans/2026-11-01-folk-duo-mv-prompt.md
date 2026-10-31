# Folk Duo MV Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add folk-duo Ref2VA prompt template (guitarist + singer) and wire CLI `--template folk-duo` on Approach A.

**Architecture:** Extend `lib/mv-prompt.mjs` mirroring `buildFolkSoloMvPrompt` with two-performer cast and dual shot vocabulary; switch in `cli/director-master.mjs`; keep band/folk-solo unchanged.

**Tech Stack:** Node ESM; existing vocal timing helpers.

## Global Constraints

- Approach A only (no new package).
- Never cut mid-lyric; instrumental never singer face CU; vocal prefers singer face CU.
- Two distinct adults; never duplicate one face into both roles.
- No RH paid calls tonight; `npm test` must stay green.

---

### Task 1: Failing folk-duo tests + package.json

**Files:**
- Create: `scripts/test-folk-duo-mv-prompt.mjs`
- Modify: `package.json` (`test` / `test:folk-duo-mv-prompt`)

**Interfaces:**
- Produces: assertions for `buildFolkDuoMvPrompt`, `FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION`

- [ ] **Step 1: Write failing test** covering six sections, instrumental no singer face CU, vocal lip-sync + both subjects, role labels, throws for <2 people / no scene, version `/^folk-duo-ref2va-/`.
- [ ] **Step 2: Run** `node scripts/test-folk-duo-mv-prompt.mjs` → FAIL (export missing).
- [ ] **Step 3: Commit** test + package.json only.

### Task 2: Implement `buildFolkDuoMvPrompt`

**Files:**
- Modify: `lib/mv-prompt.mjs`, `lib/mv-prompt.d.ts`
- Optional: `docs/FOLK_DUO_MV_PROMPT_STANDARD.md` short standard

- [ ] **Step 1: Implement** `assertFolkDuoAssets`, role assign, `folkDuoShotPlan`, `buildFolkDuoMvPrompt`, export version `folk-duo-ref2va-v1`.
- [ ] **Step 2: Run** folk-duo + full `npm test` → PASS.
- [ ] **Step 3: Commit**.

### Task 3: CLI template switch + docs notes

**Files:**
- Modify: `cli/director-master.mjs` (`mvPrompt`, `mvCut` allowlist, help text)
- Modify: `docs/ITERATION_NOTES.md`, `docs/ITERATION_PLAN.md` (template library note)

- [ ] **Step 1: Allow** `folk-duo` in template switch/allowlist/help.
- [ ] **Step 2: Smoke** `node -e` import + dry template resolve (no ffmpeg needed).
- [ ] **Step 3: Append iteration note for 2026-11-01 00:00 Asia/Shanghai; commit**.

### Task 4: Push PR

- Branch `feature/folk-duo-mv-prompt` from folk-solo tip; push; `gh pr create` summarizing folk-duo + link design/plan.
- Do not commit secrets, `.env`, large media, or `/workspace/camilla*` outputs.
