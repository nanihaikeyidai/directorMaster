# MV character consistency pack — design (2026-11-10)

## Problem
After lipsync gates (PR #20) and audio→recommend (PR #21), Ref2VA / lipsync trials still pick 定妆 / 三视图 / 换装 / 场景 refs ad-hoc. Mid-shot or scene-wide images get uploaded first, costume stills lack a face lock, and prompts do not tell the model to keep the same bone structure across outfit changes. Identity drifts.

## Goal
A pure, testable character-consistency pack that:
1. Classifies three-view / face-front / costume / scene refs from path (and optional meta).
2. Requires at least one usable close-up face lock.
3. Orders refs for RunningHub (face lock first, three-view, costumes, scene last).
4. Emits a short English+Chinese `identityLockText` for prompt injection.

No new genre template. No RunningHub calls in this module.

## Non-goals
- New MV genre / prompt templates
- Committing binary stills or scanning private media directories into git
- Submitting RH tasks or spending coins
- Replacing `assessFaceCloseUpRef` (reuse it when validating a close-up)

## API (`lib/mv-character-consistency.mjs`)

### Roles
- `face_closeup` — still-B / ref-crop / face-front / close-up / bust / 胸像 / 近脸 (and threeview-B / `*-B` bust)
- `threeview_front` — threeview-A / still-A / `*-A` / front (not `face-front`)
- `threeview_side` — threeview-C / still-C / `*-C` / side / side-best
- `threeview_back` — back / 背
- `costume` — costume / outfit / 换装 / look-
- `scene` — scene / 场景 / wide / 远景 / establishing; also `A.jpg` + beach/establishing (e.g. `newface-beach A.jpg`)
- `unknown` otherwise

Optional meta `{ role, width, height, faceBox }` overrides the path guess when `role` is a known role. `faceBox` plus image height may promote an otherwise unknown portrait to `face_closeup` via `assessFaceCloseUpRef` (`faceHeightRatio >= 0.25`), but explicit scene/costume/three-view path roles win first.

### `classifyCharacterRef(pathOrMeta)` → role string
Accepts a path string or `{ path, role?, width?, height?, faceBox? }`. Path/name heuristics first (same spirit as `CLOSEUP_PATH_RE` in `mv-lipsync-prep.mjs`).

### `buildCharacterConsistencyPack(refs, opts?)`
`refs` is an array of `{ path, role?, width?, height?, faceBox? }` (string entries allowed).

- Classify each; deduplicate by normalized path (first wins).
- `primaryFace` = first `face_closeup` that would pass `assessFaceCloseUpRef` when dimensions exist, otherwise the first path-heuristic `face_closeup`. If none, promote a three-view bust (`still-B` / `threeview-B` / `*-B`).
- No usable face lock → `{ ok: false, reason }` with a Chinese reason. Missing three-view is a warning, not a hard fail, when a face lock is present. Prefer front+side at least.
- `orderedRefs`: primary face first, then extra face close-ups, `threeview_front`, `threeview_side`, `threeview_back`, costumes, unknowns, scenes last.
- `identityLockText`: short English+Chinese constraint — same face identity, bone structure, eyes, nose, mouth, hairline across costume changes; do not invent a second person; keep makeup/face consistent with Picture N (primary, 1-based index in `orderedRefs`).
- Return `{ ok, reason?, pack: { primaryFace, threeview, costumes, scenes, orderedRefs, identityLockText, warnings[] }, summary }`.

### `formatCharacterPackReport(result)`
Human-readable Chinese report for the CLI.

### Thin path helper
`listCharacterRefPaths(dir)` — list common image extensions (`png/jpeg/jpg/webp/gif`) in a folder (non-recursive, sorted). Used by CLI `--dir`.

## CLI
`mv-character-pack --ref <path> [--ref <path>...]` or `--dir <folder>`, plus `--json`. Prints the report; exit 1 when `!ok`. Paths may be names only (classification is path-based; files need not exist for `--ref`).

## Acceptance
- Path fixtures classify into the roles above; meta `role` overrides the path guess
- Pack orders face → three-view → costume → scene; costume after face
- No face lock → `ok: false` and a Chinese reason mentioning 近脸/锁脸
- `identityLockText` contains face/identity language (EN+ZH)
- Missing front/side three-view → warnings, still `ok` if a close-up exists
- `npm test` includes `test-mv-character-consistency`; no secrets / media / RH spend
