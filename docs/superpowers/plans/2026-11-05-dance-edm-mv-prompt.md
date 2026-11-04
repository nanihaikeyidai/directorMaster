# Dance-edm MV Prompt Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth production MV prompt template `dance-edm` (solo dance-EDM / club stage performance) wired into `MV_PROMPT_TEMPLATES` with CLI + tests.

**Architecture:** Mirror `buildRockSoloMvPrompt` / rock-solo: private shot vocabulary + asset assert + six-section H3 Ref2VA string builder; register in `MV_PROMPT_TEMPLATES`; soft-update UI picker expected ids.

**Tech Stack:** Node ESM (`lib/mv-prompt.mjs`), CLI (`cli/director-master.mjs`), node:assert tests, TypeScript `.d.ts` for exports.

## Global Constraints
- No RunningHub / paid API calls
- Do not commit secrets, private paths, or large media
- Preserve existing band/folk-solo/folk-duo/piano-ballad/rock-solo outputs
- Cut only on phrase/breath/vocal gap; instrumental never frames singer face; vocal prefers face CU
- Work only in this worktree on `feature/dance-edm-mv-template`

---

### Task 1: Design/plan/standard docs

**Files:**
- Create: `docs/superpowers/specs/2026-11-05-dance-edm-mv-prompt-design.md`
- Create: `docs/superpowers/plans/2026-11-05-dance-edm-mv-prompt.md`
- Create: `docs/DANCE_EDM_MV_PROMPT_STANDARD.md`

- [x] **Step 1: Write design + plan + short standard**
- [ ] **Step 2: Commit docs**

```bash
git add docs/superpowers/specs/2026-11-05-dance-edm-mv-prompt-design.md \
  docs/superpowers/plans/2026-11-05-dance-edm-mv-prompt.md \
  docs/DANCE_EDM_MV_PROMPT_STANDARD.md
git commit -m "docs(mv): dance-edm prompt template design/plan/standard"
```

---

### Task 2: Failing test for dance-edm

**Files:**
- Create: `scripts/test-dance-edm-mv-prompt.mjs`
- Modify: `package.json` (test + test:dance-edm-mv-prompt scripts)
- Soft-update: `scripts/test-mv-ui-template-picker.mjs` expected ids

**Interfaces:**
- Produces: failing import of `buildDanceEdmMvPrompt`, `DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION`

- [ ] **Step 1: Write the failing test** (mirror `scripts/test-rock-solo-mv-prompt.mjs`; swap to LED/club/deck/controller/fog/laser/stage vocabulary; registry must include `dance-edm` + prior five)
- [ ] **Step 2: Wire into package.json test scripts**
- [ ] **Step 3: Run test to verify it fails**
- [ ] **Step 4: Commit**

```bash
git add scripts/test-dance-edm-mv-prompt.mjs scripts/test-mv-ui-template-picker.mjs package.json
git commit -m "test(mv): add failing dance-edm prompt template coverage"
```

---

### Task 3: Implement buildDanceEdmMvPrompt + registry

**Files:**
- Modify: `lib/mv-prompt.mjs` (append after rock-solo, before registry)
- Modify: `lib/mv-prompt.d.ts` (export + extend `MvPromptTemplateId`)
- Modify: `cli/director-master.mjs` (help text list dance-edm)

**Interfaces:**
- Consumes: `getSegmentVocalTiming`, `clean`, `lyricLanguage`, `segmentTimestamp`, `retentionLine`, `DUAL_SHEET_RE`
- Produces: `buildDanceEdmMvPrompt(input)`, `DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION = "dance-edm-ref2va-v1"`, registry entry `dance-edm` label `电子舞曲（舞台/俱乐部）`

Shot vocabulary (instrumental): club/LED stage wide / DJ deck hands / fog-laser detail / side silhouette — never face.
Vocal: face CU first, upper-body singing/dancing, deck-hands accent between phrases, tight mouth CU.
Reject dual sheets; require ≥1 person + ≥1 scene.

- [ ] **Step 1: Implement minimal code to pass tests**
- [ ] **Step 2: Run** `node scripts/test-dance-edm-mv-prompt.mjs` then `npm test` — all green
- [ ] **Step 3: Update CLI help string to include dance-edm in `--template` list
- [ ] **Step 4: Commit**

```bash
git add lib/mv-prompt.mjs lib/mv-prompt.d.ts cli/director-master.mjs
git commit -m "feat(mv): dance-edm prompt template + registry entry"
```

---

### Task 4: Iteration notes + verify + PR

**Files:**
- Modify: `docs/ITERATION_NOTES.md` (prepend 2026-11-05 entry)
- Modify: `docs/ITERATION_PLAN.md` (mark dance-edm done; next = next genre / PR hygiene)

- [ ] **Step 1: Prepend iteration notes**
- [ ] **Step 2: Light-touch ITERATION_PLAN**
- [ ] **Step 3: `npm test` + `node cli/director-master.mjs mv-templates` shows 6 templates including dance-edm**
- [ ] **Step 4: Commit**

```bash
git add docs/ITERATION_NOTES.md docs/ITERATION_PLAN.md
git commit -m "docs(mv): dance-edm iteration notes + plan"
```

- [ ] **Step 5: Push and open PR** base=`feature/mv-ui-template-picker`

```bash
git push -u origin feature/dance-edm-mv-template
gh pr create --base feature/mv-ui-template-picker --head feature/dance-edm-mv-template \
  --title "feat(mv): dance-edm prompt template" --body "..."
```
