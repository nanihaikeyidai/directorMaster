# Plan: MV UI/API 合成硬门禁

> 本夜在 nightly 自动化中执行。TDD：先提交失败测试，再写实现。

## Task 1: Failing tests

- Create `scripts/test-mv-compose-gate.mjs` and wire `test:mv-compose-gate` into `package.json` `test`.
- Cover: happy official export; default purpose/audioMode; preview both; missing original on official export; generated master override blocked; QC video export without source still ok; holes / duplicate videos; trim window vs full-song duration; alignment mismatch; `buildComposeSegments` from cuts; CLI; source assertions that `composeMvVideos` calls the gate before ffmpeg, and `app/mv/page.tsx` imports and pre-checks.

## Task 2: Library

- Add `lib/mv-compose-gate.mjs` + `lib/mv-compose-gate.d.ts` per the design.

## Task 3: API + CLI + UI

- `composeMvVideos` runs `planMvComposeGate` after resolving videos/source/trim and **before** any ffmpeg. `!ok` → 400 `{ error: reason, ok: false, compose, alignment }` and no concat.
- CLI `mv-compose-gate`.
- MV page: before `/api/local/mv/compose` for 合并/导出 and 云端完成后的成片合成，先跑门禁；失败 `setNotice(plan.reason)` 且不 fetch。预览自动拼接同样预检，失败写入 `fullPreviewStatus`。

## Task 4: Docs

- Update `docs/ITERATION_PLAN.md`, `docs/ITERATION_NOTES.md`, and backlog if needed.

## Verification

- `npm test` green, including the new file.
- No secrets, no RH spend in this feature, no large media.
