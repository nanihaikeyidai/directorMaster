# Wire character pack into mv-cut and lipsync trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder MV visual refs and inject identity-lock prompt text by applying the existing character consistency pack inside `mv-cut` and `mv-lipsync-prep`.

**Architecture:** Add `applyCharacterPackToAssets` and `appendIdentityLockToPrompt` to `lib/mv-character-consistency.mjs`. `mv-cut` packs collected assets, caps at 9 after packing, writes `characterPack` on the manifest, and decorates each segment prompt. `buildLipsyncTrialPlan` optionally consumes `refs` and attaches the pack. Legacy single-`--person` lipsync stays unchanged.

**Tech Stack:** Node ESM (>=22), no new npm deps. Tests in `scripts/test-mv-character-consistency.mjs` and `scripts/test-mv-lipsync-prep.mjs`.

## Global Constraints
- Stack on `feature/mv-character-consistency` (PR #22 tip, commit 5718e6b). Work in `/workspace/directorMaster/.worktrees/mv-character-pack-apply` on branch `feature/mv-character-pack-apply`.
- No RH calls in lib/tests; no secrets; no large media in git; do not commit private paths like `D:\...`.
- Do not add a new genre template.
- Do not change `classifyCharacterRef` / `buildCharacterConsistencyPack` role rules except by feeding category/role hints into the existing API.
- Chinese reasons; `identityLockText` stays English+Chinese from the existing pack builder.
- TDD: failing tests first, then minimal implementation. Frequent commits.
- After implementation: `npm test` must be fully green. Then update `docs/ITERATION_NOTES.md` + `docs/ITERATION_PLAN.md`, commit docs, push, open PR stacked on `feature/mv-character-consistency` (do not merge).

---

### Task 1: Failing tests for apply + prompt append

**Files:**
- Modify: `scripts/test-mv-character-consistency.mjs`
- Modify: `lib/mv-character-consistency.d.ts` (only after implementation in Task 2; do not export stubs that silently pass)

**Interfaces:**
- Produces: tests that import `applyCharacterPackToAssets` and `appendIdentityLockToPrompt` from `../lib/mv-character-consistency.mjs`

- [ ] **Step 1: Append failing tests** to `scripts/test-mv-character-consistency.mjs` (keep existing tests). Use this coverage (adapt to the file's existing assert helper style; read the file first and match it):

  - Scene category: `{ path: 'bg.jpg', category: '场景' }` classifies as scene in the pack (`packResult.pack.scenes` includes it; role is `scene`).
  - Order: assets `[costume look-summer.jpg, scene-wide.jpg, still-B.jpg]` (with categories 人物/场景/人物) come back as still-B, look-summer, scene-wide when `ok`.
  - No face lock: only `scene-wide.jpg` + `look-summer.jpg` → `ok: false`, reason matches `/近脸|锁脸/`, `assets` stays in input order.
  - Cap 9: one `still-B.jpg` plus nine `scene-0N.jpg` (category 场景) → `ok`, `assets.length === 9`, first asset is still-B, no 10th scene.
  - Preserve fields: input `{ path: 'still-B.jpg', category: '人物', description: 'bust', id: 'keep-me' }` still has `description` and `id` after apply.
  - `appendIdentityLockToPrompt`:
    - given a prompt containing `\noverall_soundscape:\n音`, inserting lock text `Identity lock / 人物一致性：Keep the face.` places that sentence as its own line immediately before `overall_soundscape:`.
    - calling twice is idempotent (lock appears once).
    - empty lock or empty prompt returns the original string.

- [ ] **Step 2: Run** `node scripts/test-mv-character-consistency.mjs` from the worktree. Expected: FAIL because the new named exports are missing.

- [ ] **Step 3: Commit only if you also implement in the same commit with Task 2.** Prefer one feat commit for tests+lib after Task 2 passes, or a test commit then a feat commit. Message style: `test(mv): apply character pack to assets + prompt lock` / `feat(mv): apply character pack to mv assets and prompts`.

---

### Task 2: Implement lib helpers + typings

**Files:**
- Modify: `lib/mv-character-consistency.mjs`
- Modify: `lib/mv-character-consistency.d.ts`

**Interfaces:**
- Consumes: `buildCharacterConsistencyPack`, `normalizeRefPath`, existing role list
- Produces:

```js
export function applyCharacterPackToAssets(assets, opts = {})
// assets: Array<{ path: string, category?: string, role?: string, width?: number, height?: number, faceBox?: object, ... }>
// opts.maxRefs default 9
// returns { ok, reason, assets, packResult }

export function appendIdentityLockToPrompt(prompt, identityLockText)
// returns string
```

- [ ] **Step 1: Implement `applyCharacterPackToAssets`**

```js
export function applyCharacterPackToAssets(assets, opts = {}) {
  const maxRefs = Number.isFinite(Number(opts.maxRefs)) ? Number(opts.maxRefs) : 9;
  const list = Array.isArray(assets) ? assets : [];
  const refs = list.map((asset) => {
    const role = asset?.role || (asset?.category === '场景' ? 'scene' : undefined);
    const input = { path: asset?.path, role };
    if (asset?.width) input.width = asset.width;
    if (asset?.height) input.height = asset.height;
    if (asset?.faceBox) input.faceBox = asset.faceBox;
    return input;
  });
  const packResult = buildCharacterConsistencyPack(refs);
  if (!packResult.ok) {
    return { ok: false, reason: packResult.reason, assets: list, packResult };
  }
  const byPath = new Map();
  for (const asset of list) {
    const key = normalizeRefPath(asset?.path);
    if (key && !byPath.has(key)) byPath.set(key, asset);
  }
  const ordered = [];
  const seen = new Set();
  for (const ref of packResult.pack.orderedRefs || []) {
    const key = normalizeRefPath(ref.path);
    const asset = byPath.get(key);
    if (!asset || seen.has(key)) continue;
    seen.add(key);
    ordered.push(asset);
    if (ordered.length >= maxRefs) break;
  }
  return { ok: true, reason: packResult.reason, assets: ordered, packResult };
}
```

- [ ] **Step 2: Implement `appendIdentityLockToPrompt`**

```js
export function appendIdentityLockToPrompt(prompt, identityLockText) {
  const src = prompt == null ? '' : String(prompt);
  const text = String(identityLockText || '').trim();
  if (!src) return src;
  if (!text) return src;
  if (src.includes(text) || src.includes('Identity lock / 人物一致性')) return src;
  const marker = '\noverall_soundscape:';
  const index = src.indexOf(marker);
  if (index >= 0) return src.slice(0, index) + '\n' + text + src.slice(index);
  return src + '\n' + text;
}
```

- [ ] **Step 3: Export both from `lib/mv-character-consistency.d.ts`** with typings consistent with existing `CharacterConsistencyResult` / `CharacterRefInput`.

- [ ] **Step 4: Run** `node scripts/test-mv-character-consistency.mjs` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(mv): apply character pack to assets and inject identity lock`

---

### Task 3: Wire `mv-cut` + lipsync trial plan + CLI

**Files:**
- Modify: `cli/director-master.mjs` (`mvCut`, help, `mvLipsyncPrep`, `printMvLipsyncPrep`)
- Modify: `lib/mv-lipsync-prep.mjs` (`buildLipsyncTrialPlan`)
- Modify: `lib/mv-lipsync-prep.d.ts` if present
- Modify: `scripts/test-mv-lipsync-prep.mjs`

**Interfaces:**
- Consumes: `applyCharacterPackToAssets`, `appendIdentityLockToPrompt`, `buildCharacterConsistencyPack`, `listCharacterRefPaths`
- Produces: updated `buildLipsyncTrialPlan(input)` where `input.refs` is optional. On pack success the return includes `characterPack`, `identityLockText`, `orderedRefs`. Legacy input without `refs` is unchanged (no requirement to add those keys).

- [ ] **Step 1: Write failing lipsync tests** in `scripts/test-mv-lipsync-prep.mjs` (match existing hop fixtures and assert helpers):

  - With vocal-ok hops + `refs: ['still-B.jpg', 'look-summer.jpg', 'scene-wide.jpg']` (no dimensions needed if path heuristics pass close-up): `ok === true`, `characterPack.ok === true`, `identityLockText` matches `/Identity lock|人物一致性/`, `orderedRefs[0]` path is still-B.
  - With vocal-ok hops + `refs: ['scene-wide.jpg']` only: `ok === false`, reason matches `/近脸|锁脸/`.
  - Legacy: vocal-ok hops + `person: { path: 'ref-crop.jpg', width: 768, height: 1200 }` and **no** `refs` key: still `ok === true`, and `characterPack` is absent or undefined (do not break old callers).

- [ ] **Step 2: Run** `node scripts/test-mv-lipsync-prep.mjs` — Expected: FAIL on the new refs cases.

- [ ] **Step 3: Implement `buildLipsyncTrialPlan` extension**

  After reading current `buildLipsyncTrialPlan`:
  - If `Array.isArray(input.refs) && input.refs.length`:
    - Build a refs list; if `input.person?.path`, unshift that path (object form, keep width/height/faceBox) when not already present.
    - `const applied = applyCharacterPackToAssets(refs.map(...))` or `buildCharacterConsistencyPack` directly; prefer `applyCharacterPackToAssets` so order/cap stays consistent.
    - If `!applied.ok`, return `{ ok: false, audio, person: assessFaceCloseUpRef(input.person || applied.assets[0] || {}), workflowId, reason: applied.reason, characterPack: applied.packResult }`.
    - Else set person input from `applied.packResult.pack.primaryFace` (include width/height/faceBox when present), then continue the existing audio + `assessFaceCloseUpRef` gates. On success attach `characterPack`, `identityLockText`, `orderedRefs`.
  - If no `refs`, keep the existing body exactly.

- [ ] **Step 4: Wire CLI `mv-lipsync-prep`**
  - Collect `optionAll('ref')` and `--dir` via `listCharacterRefPaths` (import already used by `mv-character-pack`; reuse).
  - If refs exist, ffprobe width/height best-effort like `--person`, pass as `refs`.
  - Include `--person` in refs when set.
  - Default workflow id unchanged: `2089048490512052225`.
  - `printMvLipsyncPrep`: if `plan.characterPack`, print `人物一致性包：通过/未通过` and reason; if primary face, print its basename.
  - Update the help string to mention `mv-lipsync-prep ... [--person <image>] [--ref <path> ...] [--dir <folder>] ...`.

- [ ] **Step 5: Wire `mvCut`**
  - Import `applyCharacterPackToAssets` and `appendIdentityLockToPrompt` (character pack helpers are already imported; extend the import).
  - In the people/scenes loop, **remove** the `if (visualAssets.length>=9) throw ...` mid-loop cap. Still skip non-images; still copy into `assetRoot`.
  - After the loop, call `applyCharacterPackToAssets(visualAssets)`.
  - If `!applied.ok`, `throw new Error(applied.reason || '人物一致性包不可用')`.
  - `visualAssets = applied.assets` (already capped to 9).
  - Build prompts with packed assets: `prompt: appendIdentityLockToPrompt(mvPrompt(..., visualAssets, ...), applied.packResult.pack.identityLockText)`.
  - Add `characterPack` to the manifest:

```js
const pack = applied.packResult;
characterPack: {
  ok: pack.ok,
  reason: pack.reason,
  summary: pack.summary,
  warnings: pack.pack.warnings || [],
  identityLockText: pack.pack.identityLockText || '',
  primaryFace: pack.pack.primaryFace ? { path: pack.pack.primaryFace.path, role: pack.pack.primaryFace.role } : null,
  orderedRefs: (pack.pack.orderedRefs || []).map((ref) => ({ path: ref.path, role: ref.role })),
}
```

  - Update `mv-cut` help only if needed (no new required flags).

- [ ] **Step 6: Run** `node scripts/test-mv-lipsync-prep.mjs` and `node scripts/test-mv-character-consistency.mjs` — Expected: PASS.

- [ ] **Step 7: Commit** `feat(cli): mv-cut and lipsync-prep apply character consistency pack`

---

### Task 4: Docs, full test, push PR

**Files:**
- Modify: `docs/ITERATION_NOTES.md` (prepend a 2026-11-11 00:00 Asia/Shanghai entry: module, acceptance, landed, verification, 15s trial status if known else leave a placeholder the nightly agent will fill, next night)
- Modify: `docs/ITERATION_PLAN.md` (tick “character pack applied in mv-cut / lipsync trial”; next remains vocal-source 15s trial / open PR hygiene)
- Already created: `docs/superpowers/specs/2026-11-11-mv-character-pack-apply-design.md`, `docs/superpowers/plans/2026-11-11-mv-character-pack-apply.md`

- [ ] **Step 1: Run** `npm test` in the worktree. Expected: all green, including the two suites above. Do not claim done if anything fails.

- [ ] **Step 2: Write iteration notes / tick the plan** (no secrets, no private D:\ paths, no RH spend claims unless a trial actually ran).

- [ ] **Step 3: Commit** `docs(mv): character-pack-apply design/plan + iteration notes`

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feature/mv-character-pack-apply
gh pr create --base feature/mv-character-consistency --title "feat(mv): apply character pack in mv-cut and lipsync trial" --body "..."
```

Base must be `feature/mv-character-consistency` (PR #22), not `main`. Do not merge. Do not force-push. Report the PR URL and commit SHAs.

---

## Self-review
- Spec coverage: apply/reorder/cap, scene category hint, hard fail without face, prompt injection + idempotence, mv-cut manifest, lipsync refs + legacy path, tests, docs, stacked PR — all have tasks.
- No TBD placeholders.
- Names are consistent: `applyCharacterPackToAssets`, `appendIdentityLockToPrompt`, `characterPack` on plan/manifest.
