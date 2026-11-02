# Rock-solo MV Prompt Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth production MV prompt template `rock-solo` (solo electric-guitar stage rock) wired into `MV_PROMPT_TEMPLATES` with CLI + tests.

**Architecture:** Mirror `buildPianoBalladMvPrompt` / folk-solo: private shot vocabulary + asset assert + six-section H3 Ref2VA string builder; register in `MV_PROMPT_TEMPLATES`; no UI changes.

**Tech Stack:** Node ESM (`lib/mv-prompt.mjs`), CLI (`cli/director-master.mjs`), node:assert tests, TypeScript `.d.ts` for exports.

## Global Constraints
- No RunningHub / paid API calls
- Do not commit secrets, private paths, or large media
- Preserve existing band/folk-solo/folk-duo/piano-ballad outputs
- Cut only on phrase/breath/vocal gap; instrumental never frames singer face; vocal prefers face CU
- Work only in this worktree on `feature/rock-solo-mv-template`

---

### Task 1: Failing test for rock-solo

**Files:**
- Create: `scripts/test-rock-solo-mv-prompt.mjs`
- Modify: `package.json` (test + test:rock-solo-mv-prompt scripts)

**Interfaces:**
- Produces: failing import of `buildRockSoloMvPrompt`, `ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION`

- [ ] **Step 1: Write the failing test** (copy structure from `scripts/test-piano-ballad-mv-prompt.mjs`, swap piano→rock/electric guitar/stage/amp/pedal vocabulary; registry must include `rock-solo`; unknown-template error still mentions existing ids)

- [ ] **Step 2: Wire into package.json test scripts**

- [ ] **Step 3: Run test to verify it fails**

Run: `node scripts/test-rock-solo-mv-prompt.mjs`
Expected: FAIL (module has no `buildRockSoloMvPrompt`)

- [ ] **Step 4: Commit**

```bash
git add scripts/test-rock-solo-mv-prompt.mjs package.json docs/superpowers/specs/2026-11-03-rock-solo-mv-prompt-design.md docs/superpowers/plans/2026-11-03-rock-solo-mv-prompt.md
git commit -m "test(mv): add failing rock-solo prompt template coverage"
```

---

### Task 2: Implement buildRockSoloMvPrompt + registry

**Files:**
- Modify: `lib/mv-prompt.mjs` (append after piano-ballad, before or into registry)
- Modify: `lib/mv-prompt.d.ts` (export + extend `MvPromptTemplateId`)
- Modify: `cli/director-master.mjs` (help text list rock-solo)

**Interfaces:**
- Consumes: `getSegmentVocalTiming`, `clean`, `lyricLanguage`, `segmentTimestamp`, `retentionLine`, `DUAL_SHEET_RE`
- Produces: `buildRockSoloMvPrompt(input)`, `ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION = "rock-solo-ref2va-v1"`, registry entry `rock-solo` label `摇滚独唱（电吉他舞台）`

Shot vocabulary (instrumental): stage wide / guitar hands / amp-pedal detail / silhouette wide — never face.
Vocal: face CU first, upper-body, guitar-hands accent between phrases, tight mouth CU.
Reject dual sheets; require ≥1 person + ≥1 scene.

- [ ] **Step 1: Implement minimal code to pass tests**

- [ ] **Step 2: Run** `node scripts/test-rock-solo-mv-prompt.mjs` then `npm test` — all green

- [ ] **Step 3: Update CLI help string to include rock-solo in `--template` list

- [ ] **Step 4: Commit**

```bash
git add lib/mv-prompt.mjs lib/mv-prompt.d.ts cli/director-master.mjs
git commit -m "feat(mv): rock-solo prompt template + registry entry"
```

---

### Task 3: Docs + iteration notes + verify

**Files:**
- Create: `docs/ROCK_SOLO_MV_PROMPT_STANDARD.md`
- Modify: `docs/ITERATION_NOTES.md` (prepend 2026-11-03 entry)
- Modify: `docs/ITERATION_PLAN.md` (mark rock-solo done; next = UI picker / dance-edm)

- [ ] **Step 1: Write standard doc mirroring PIANO_BALLAD_MV_PROMPT_STANDARD.md**

- [ ] **Step 2: Prepend iteration notes with module/验收/Landed/Verification/next night**

- [ ] **Step 3: `npm test` + `node cli/director-master.mjs mv-templates` shows 5 templates including rock-solo

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(mv): rock-solo standard + nightly iteration notes"
```

- [ ] **Step 5: Push and open PR** base=`feature/piano-ballad-mv-template` (stack) or note stack on #13

```bash
git push -u origin HEAD
gh pr create --base feature/piano-ballad-mv-template --title "feat(mv): rock-solo prompt template" --body "..."
```
