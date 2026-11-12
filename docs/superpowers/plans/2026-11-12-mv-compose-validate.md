# MV 最终合成校验（P0-5）Implementation Plan

> **For agentic workers:** Use TDD (failing tests first, then minimal implementation) and verification-before-completion. Do not claim pass until `npm test` has been run in this worktree.

**Goal:** Add a pure, testable pre-compose report so MV final mux cannot silently ship out-of-order segments, holes, duplicates, duration drift, or a generated soundtrack in place of the original song.

**Architecture:** New `lib/mv-compose-validate.mjs` (+ `.d.ts`) mirrors `lib/mv-av-alignment.mjs`. CLI `mv-compose-check` mirrors `mv-align-check`. `muxOriginalAudio` calls the checker before ffmpeg.

**Tech Stack:** Node ESM (>=22), no new npm deps. Tests in `scripts/test-mv-compose-validate.mjs`.

## Global Constraints

- Work only in `/workspace/directorMaster/.worktrees/mv-compose-validate` on branch `feature/mv-compose-validate`, stacked on `feature/mv-character-pack-apply` (PR #23 tip, 25c6f57).
- Do not edit other worktrees or merge open PRs.
- No RH calls in lib/tests; no secrets; no large media; no private paths like `D:\...`.
- No new genre template.
- Chinese reasons/messages. Default tolerance 0.08s.
- TDD: failing tests first, watch them fail, then implement. Frequent conventional commits.
- After implementation: `npm test` fully green. Update `docs/ITERATION_NOTES.md` + `docs/ITERATION_PLAN.md`, commit docs, push, open PR stacked on `feature/mv-character-pack-apply` (do not merge).

Follow the companion design: `docs/superpowers/specs/2026-11-12-mv-compose-validate-design.md`.
