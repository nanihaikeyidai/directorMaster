# Wire character consistency pack into mv-cut and lipsync trial — design (2026-11-11)

## Problem
PR #22 landed `classifyCharacterRef` / `buildCharacterConsistencyPack` / CLI `mv-character-pack`, but production and the nightly lipsync trial still ignore the pack. `mv-cut` walks `--people` then `--scenes` in filesystem order, caps at 9 mid-collection, and never injects `identityLockText`. `mv-lipsync-prep` only gates a single `--person` image. Mid-shot or scene-wide refs can still land in Picture 1, and costume changes have no face lock in the generated prompt. `mv-generate` already uploads `manifest.visualAssets` in array order, so fixing order + prompt in `mv-cut` is enough for the generate path.

## Goal
A small, testable apply layer that:

1. Maps collected visual assets into a character consistency pack (category `场景` hints `role: "scene"` unless an explicit role is set).
2. Hard-fails when there is no usable close-up face lock (same Chinese reason as the pack).
3. Reorders assets to pack order (face lock → three-view → costume → unknown → scene) and caps at 9 *after* packing, so a late still-B is not dropped by a mid-loop cap.
4. Injects `identityLockText` into each segment prompt without editing every genre template.
5. Lets `mv-lipsync-prep` accept `--ref` / `--dir`, attach the pack to the trial plan, and use the pack's primary face as the close-up gate.

No new genre template. No RunningHub calls in lib or tests.

## Non-goals
- New MV genre / prompt templates
- Changing `buildCharacterConsistencyPack` classification rules
- Auto-cropping a mid-shot into a close-up
- Submitting RH tasks or spending coins in tests
- Merging the stacked open PR chain
- Requiring a pack when `mv-lipsync-prep` is used in the legacy single-`--person` mode (backward compatible)

## Approaches considered
- **A (chosen):** Pure helpers on `lib/mv-character-consistency.mjs`; `mv-cut` and `buildLipsyncTrialPlan` call them. Prompt lock is a post-process on the template string so all registered templates pick it up.
- **B:** CLI-only reordering inside `mv-cut` / `mv-lipsync-prep`, no shared helper. Duplicates rules and is harder to test without ffmpeg.
- **C:** Thread `identityLockText` through every template `settings.continuity`. Touches all builders and tests for a one-line append.

## API (`lib/mv-character-consistency.mjs`)

### `applyCharacterPackToAssets(assets, opts?)`
`assets` is an array of visual asset objects (`path` required; optional `category`, `role`, `width`, `height`, `faceBox`, plus any other fields to preserve).

- Build pack refs: if `role` is already a known role, keep it; else if `category === "场景"`, set `role: "scene"`; else classify from path.
- `buildCharacterConsistencyPack(refs)`.
- If `!ok`, return `{ ok: false, reason, assets: original, packResult }` (do not reorder).
- If ok, reorder by `pack.orderedRefs` (match with `normalizeRefPath`). Cap at `opts.maxRefs` (default 9), keeping pack priority. Preserve original asset object fields; do not invent paths.
- Return `{ ok: true, reason, assets: ordered, packResult }`.

### `appendIdentityLockToPrompt(prompt, identityLockText)`
`prompt` is the string from `buildMvPromptForTemplate`.

- Empty lock or empty prompt → return prompt unchanged.
- Idempotent: if the prompt already contains the lock text, or already contains `Identity lock / 人物一致性`, return unchanged.
- Insert the lock as its own line immediately before the `\noverall_soundscape:` marker (inside `detailed_description`). If that marker is missing, append after a newline.

## `mv-cut`
After collecting people + scene files (copy into `assets/` as today):

- Do **not** throw when the raw collection exceeds 9; collect all supported images first, then `applyCharacterPackToAssets`.
- If `!ok`, throw with the pack's Chinese `reason` (exit is the CLI try/catch).
- Replace `visualAssets` with the packed, capped list.
- Build each segment prompt from the packed assets, then `appendIdentityLockToPrompt(prompt, pack.identityLockText)`.
- Persist a JSON-safe `characterPack` snapshot on the manifest: `{ ok, reason, summary, warnings, identityLockText, primaryFace, orderedRefs: [{ path, role }] }` using the copied workspace paths (already in `visualAssets`). Do not add host-private path commentary in docs commits.

Optional `--no-character-pack` is out of scope (YAGNI).

## Lipsync trial
`buildLipsyncTrialPlan` gains optional `refs` (array of path strings or `{ path, role?, width?, height?, faceBox? }`).

- If `refs` is absent or empty: keep today's behavior (single `person` close-up gate only; no pack fields required).
- If `refs` is non-empty: run `applyCharacterPackToAssets` / `buildCharacterConsistencyPack`. If `!pack.ok`, the plan fails with the pack's Chinese reason (even if a legacy `person` object would have passed). On success, set `person` from the primary face (merge ffprobe/`faceBox` dimensions when provided on that ref), still require `assessFaceCloseUpRef` to pass, and attach `characterPack` (the pack result) plus `identityLockText` and `orderedRefs` to the plan.
- If both a legacy `person` and `refs` are supplied, include `person.path` in the refs list (person first) before packing.

CLI `mv-lipsync-prep`: add repeatable `--ref` and `--dir` (same semantics as `mv-character-pack`). If any refs/dir are present, pass them as `refs` (and include `--person` when set). Human-readable output prints pack ok/reason and primary face when a pack is attached. `--json` includes the new fields. Help text updated. Exit 1 on `!ok` unchanged.

## Acceptance
- Scene-category assets classify as `scene` even with a generic filename.
- Packed assets order face → three-view → costume → scene; costume after face; cap 9 keeps the face lock and drops later scenes.
- No face lock → `ok: false` and Chinese reason mentioning 近脸/锁脸; `mv-cut` throws that reason.
- `appendIdentityLockToPrompt` inserts the lock before `overall_soundscape:` and is idempotent.
- `buildLipsyncTrialPlan({ hops, refs })` attaches pack + identity lock when ok; fails without a face lock; legacy `{ hops, person }` with no `refs` is unchanged.
- CLI help lists `--ref` / `--dir` on `mv-lipsync-prep`.
- `npm test` includes the new cases (extend `test-mv-character-consistency` and `test-mv-lipsync-prep`); no secrets / media / RH spend.

## Standing approval
This spec is written under the user's standing nightly MV iteration routine (流程优化 / 人物一致性 / 对口型). Unattended run: no interactive review gate.
