# RH 可观测 + kind 预检 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose workflow `kind`/`singleSegment` on config listings and attach `summarizeCloudJob` summaries to job APIs + UI so single-segment templates warn early and task center shows elapsed/kind/segments.

**Architecture:** Extend pure helpers in `lib/runninghub-guards.mjs`; wire `runninghub.ts` + `listMvWorkflowFiles` to annotate listings and job responses; thin UI in `app/page.tsx` and `app/mv/page.tsx`.

**Tech Stack:** Node ESM `.mjs` + Vite/Next TSX, existing `detectRunningHubWorkflowKind`, `npm test` script suite.

## Global Constraints
- No RunningHub paid calls; no secrets in git/logs/UI
- TDD: failing test first for new pure helpers
- Small reversible commits; stay on `feature/rh-observability-kind`

---

### Task 1: Pure helpers + tests

**Files:**
- Modify: `lib/runninghub-guards.mjs`, `lib/runninghub-guards.d.ts`
- Modify: `scripts/test-runninghub-guards.mjs`

- [ ] **Step 1:** RED — assert `isSingleSegmentKind('mv-reference')===true`, `('director')===false`; `annotateWorkflowListing` on fixture with MiniMaxH3ReferenceToVideo → kind `mv-reference`, singleSegment true; invalid/empty → kind null; `attachJobSummary` adds `summary.elapsedSec` and redacts error
- [ ] **Step 2:** Run `node scripts/test-runninghub-guards.mjs` → fail (missing exports)
- [ ] **Step 3:** GREEN — implement helpers (detectKind injected or import detect from adapters carefully: prefer passing kind string into annotate, or duplicate class-set heuristic in guards to avoid TS/CJS friction — **prefer**: `annotateWorkflowListing(entry, { kind, kindError })` built by caller OR export `inferKindFromClasses(classes)` in guards mirroring detect order)
- [ ] Prefer `inferWorkflowKindFromNodes(workflow)` in guards mirroring `detectRunningHubWorkflowKind` class priority (FeiHou → Reference → Director → null) so tests stay pure without importing TS adapters
- [ ] **Step 4:** Tests green; commit

### Task 2: Wire server APIs

**Files:**
- Modify: `vite-plugins/runninghub.ts` (`listWorkflowFiles`, `cloudConfig`, `listCloudJobs`, `cloudStatus`)
- Modify: `vite-plugins/local-runtime.ts` (`listMvWorkflowFiles`)

- [ ] Annotate short-drama + mv workflow listings with kind/singleSegment via `inferWorkflowKindFromNodes` + `isSingleSegmentKind`
- [ ] `cloudConfig` returns `mvWorkflows` array
- [ ] Job list/status responses include `summary: summarizeCloudJob(job)`
- [ ] No behavior change to submit path
- [ ] Commit

### Task 3: Frontend surfaces

**Files:**
- Modify: `app/page.tsx` (JobState + monitorCloud + jobs page + short-drama workflow select warning)
- Modify: `app/mv/page.tsx` (catalog kind label; WorkflowCatalogItem type)

- [ ] JobState adds optional `elapsedSec`, `workflowKind`, `segmentCount`, `terminal`
- [ ] monitorCloud copies from `current.summary`
- [ ] Jobs progress card shows 耗时 / kind / 段数 when present
- [ ] Short-drama select: if selected item.singleSegment, show warning paragraph
- [ ] MV catalog span shows kind + 单段 when singleSegment
- [ ] Commit

### Task 4: Docs + verify

**Files:**
- Modify: `docs/RUNNINGHUB.md`, `docs/ITERATION_PLAN.md`, `docs/ITERATION_NOTES.md`

- [ ] Document config kind fields + job summary
- [ ] Check Sprint 2 observability checkbox
- [ ] `npm test`; eslint touched files if available
- [ ] Push branch; open PR targeting main (base includes or note dependency on #6 commits — branch forked from feature/rh-hardening-guards so PR will include those commits OR open against that branch). Prefer PR into `main` listing both Sprint 2 chunks; if #6 still open, either update #6 by merging this branch into it OR open new PR and note stacks on #6.
- [ ] Decision: **merge tonight's commits onto `feature/rh-hardening-guards` and update PR #6** if cleaner; else new PR `feature/rh-observability-kind` → `main` (will include #6 commits). Prefer **new PR → main** documenting full Sprint 2 remaining.
