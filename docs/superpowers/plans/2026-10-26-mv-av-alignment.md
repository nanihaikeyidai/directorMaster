# MV AV Alignment Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pure `checkAvAlignment` report (80ms tolerance) plus CLI `mv-align-check` so export/merge can surface actionable 音画对齐 issues before spend.

**Architecture:** Mirror `lib/mv-segment-review.mjs`: pure ESM helpers + `.d.ts`, Node assert tests, thin CLI. No ffprobe inside the lib.

**Tech Stack:** Node ESM, existing `cli/director-master.mjs` pattern.

## Global Constraints

- No secrets, no RH calls, no large binaries.
- Duration tolerance default `0.08` seconds.
- Chinese message + suggestion on every issue.
- Index in issues is the segment's `index` field as provided (prefer 1-based SEG numbers from manifests).

---

### Task 1: Failing tests for checkAvAlignment

**Files:**
- Create: `scripts/test-mv-av-alignment.mjs`
- Create (later): `lib/mv-av-alignment.mjs`

- [ ] **Step 1: Write failing test file** covering: ok path; audio mismatch; video/tail truncation; lead silence; missing audio warning; invalid duration; formatAlignmentReport contains codes.

- [ ] **Step 2: Run** `node scripts/test-mv-av-alignment.mjs` — expect FAIL (module missing).

- [ ] **Step 3: Implement** `lib/mv-av-alignment.mjs` + `lib/mv-av-alignment.d.ts` until tests pass.

- [ ] **Step 4: Wire** into `package.json` `test` and `test:mv-av-alignment` scripts.

- [ ] **Step 5: Commit** feat(mv): av alignment checker

### Task 2: CLI mv-align-check

**Files:**
- Modify: `cli/director-master.mjs`
- Create: `examples/mv-align-fixture.json` (tiny synthetic manifest)

- [ ] **Step 1: Add** `mvAlignCheck()` reading `--manifest`, optional `--tolerance`, `--require-video`, `--require-audio` (default on).

- [ ] **Step 2: Map** manifest fields per design; print JSON; `process.exitCode = 1` when `!ok` (or throw after print — prefer exitCode after console.log so stdout still has report).

- [ ] **Step 3: Help text** update.

- [ ] **Step 4: Manual** `node cli/director-master.mjs mv-align-check --manifest examples/mv-align-fixture.json`

- [ ] **Step 5: Commit**

### Task 3: Docs + iteration notes

**Files:**
- Modify: `docs/ITERATION_PLAN.md`, `docs/ITERATION_NOTES.md`, `docs/MV_REQUIREMENTS_BACKLOG.md`

- [ ] Mark Sprint 1 音画对齐 as done (lib+CLI); note UI hard-gate still optional.
- [ ] Commit docs.

### Task 4: Verify + push PR

- [ ] `npm test` all green
- [ ] Push `feature/mv-av-alignment`, open PR to `main` (body notes stacks on / related to #4 review/resume commits if included)
