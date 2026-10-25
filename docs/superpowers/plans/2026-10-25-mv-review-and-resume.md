# MV Review State + Recoverable Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-segment prompt review gates and durable generation resume/retry so unapproved MV segments never auto-submit to local/cloud generation.

**Architecture:** Pure review/queue helpers live in `lib/mv-segment-review.mjs` (+ `.d.ts`) with node tests. `app/mv/page.tsx` stores review map + persists queue/generation fields already saved with the project; batch/full-MV/enqueue filter to approved indexes; resume polls RunningHub by saved `jobId`.

**Tech Stack:** Node ESM tests (`scripts/test-mv-segment-review.mjs`), existing Next/Vite MV page, RunningHub job GET API already used by the page.

## Global Constraints

- Node.js ≥ 22.13.0
- Do not commit secrets, workspace media, or RH keys
- Do not start/stop ComfyUI
- Keep short-drama vs MV workflow dirs isolated
- Prefer small focused modules; avoid rewriting the whole 2300-line page
- `npm test` must stay green (add new script to package.json test chain)
- Chinese UI copy consistent with existing MV page

---

### Task 1: Review state pure module + tests

**Files:**
- Create: `lib/mv-segment-review.mjs`
- Create: `lib/mv-segment-review.d.ts`
- Create: `scripts/test-mv-segment-review.mjs`
- Modify: `package.json` (add `test:mv-segment-review` and append to `test`)

**Interfaces:**
- Produces:
  - `export type SegmentReviewStatus = 'pending' | 'approved' | 'submitted' | 'failed'`
  - `export function createInitialReviews(segmentCount: number): SegmentReviewStatus[]`
  - `export function resetReviewsForPromptChange(reviews: SegmentReviewStatus[], segmentCount: number): SegmentReviewStatus[]` — all `pending`, length = segmentCount
  - `export function approveSegment(reviews: SegmentReviewStatus[], index: number, hasValidPrompt: boolean): SegmentReviewStatus[]` — if !hasValidPrompt throw or no-op keep pending; else set approved
  - `export function markSubmitted(reviews: SegmentReviewStatus[], indexes: number[]): SegmentReviewStatus[]`
  - `export function markFailed(reviews: SegmentReviewStatus[], indexes: number[]): SegmentReviewStatus[]`
  - `export function approvedIndexes(reviews: SegmentReviewStatus[]): number[]`
  - `export function filterSelectableForBatch(reviews: SegmentReviewStatus[], selected: number[]): { allowed: number[]; rejected: number[] }`

- [ ] **Step 1: Write the failing test** in `scripts/test-mv-segment-review.mjs` covering: initial all pending; approve only with valid prompt; reset on prompt change; approvedIndexes; filterSelectableForBatch rejects non-approved; markSubmitted/markFailed.

- [ ] **Step 2: Run** `node scripts/test-mv-segment-review.mjs` — expect FAIL (module missing).

- [ ] **Step 3: Implement** `lib/mv-segment-review.mjs` + `.d.ts` minimally.

- [ ] **Step 4: Run test** — expect PASS. Wire into `package.json` `"test"` script.

- [ ] **Step 5: Commit** `feat(mv): add segment review state helpers`

---

### Task 2: Wire review UI + gates in MV page

**Files:**
- Modify: `app/mv/page.tsx`
- Modify: MV CSS if needed (same file's classes or existing stylesheet used by mv page)

**Interfaces:**
- Consumes: helpers from Task 1
- State: `segmentReviews: SegmentReviewStatus[]` aligned to `segments.length`
- On `generatePrompts` / signature mismatch: `resetReviewsForPromptChange`
- Per-segment button「通过审核」→ `approveSegment` when `promptsReady && generatedPrompts[index]`
- Show status label: 待审核 / 已审核 / 已提交 / 失败
- `enqueueGeneration`: before queueing, `filterSelectableForBatch`; if `allowed` empty, setNotice and return; only enqueue `allowed`; then `markSubmitted` on those indexes when actually started or when queued
- Batch modal: default selection = `approvedIndexes()`; disable checkbox for non-approved (or warn)
- `generateFullMv`: after auto prompts, **do not** call `enqueueGeneration`; setNotice asking user to审核并点云端批量; leave reviews pending
- Persist `segmentReviews` inside existing project save/load payload (same place `promptBundle` / generation is saved — find `saveCurrentProject` / load and extend)

- [ ] **Step 1: Add failing behavioral unit where possible**; for UI, rely on review helper tests + manual checklist in ITERATION_NOTES.

- [ ] **Step 2: Implement state, persistence, gates, labels, approve button.**

- [ ] **Step 3: Smoke** — `npm test`; ensure page still typechecks if project has a check script.

- [ ] **Step 4: Commit** `feat(mv): gate generation on per-segment review approval`

---

### Task 3: Recoverable jobs — persist queue + resume poll + retry

**Files:**
- Modify: `app/mv/page.tsx` (and only if needed a tiny helper in `lib/mv-segment-review.mjs` for merging resume state)
- Optionally Create: `lib/mv-generation-resume.mjs` if page logic exceeds ~80 lines of pure resume rules — prefer extracting

**Interfaces:**
- Persist with project: `generation` map, `generationQueue` (queued/running only), `segmentReviews`
- On project load: if segment has `jobId` and status in preparing|queued|running and provider runninghub, resume existing poll path (`watch` / status fetch already in page)
- Button「重试」on `failed` segments → set review to `approved` (keep) and `enqueueGeneration` for that index only
- Cancel remains via existing queue cancel

- [ ] **Step 1: Write tests** for any extracted resume helper (e.g. which indexes need resume poll).

- [ ] **Step 2: Implement persistence + resume + retry UI.**

- [ ] **Step 3: `npm test` green.**

- [ ] **Step 4: Commit** `feat(mv): persist generation queue and resume cloud jobs`

---

### Task 4: Docs + PR

**Files:**
- Modify: `docs/ITERATION_NOTES.md` (tonight/this session note)
- Modify: `docs/ITERATION_PLAN.md` checkboxes for completed Sprint 1 items
- Modify: `docs/MV_REQUIREMENTS_BACKLOG.md` mark P0-2/P0-3 progress if done

- [ ] **Step 1: Update docs with what shipped and how to verify.**

- [ ] **Step 2: Push branch `feature/mv-review-and-resume`, open PR to main with summary + test evidence.**

- [ ] **Step 3: Do not merge unless asked.**

---

## Self-review

- Spec coverage: review gate + full-MV stop + batch filter + resume/retry → Tasks 1–3
- No TBD placeholders in task steps
- Names: `SegmentReviewStatus`, `approvedIndexes`, `filterSelectableForBatch` consistent
