# 口型试片工作流默认 + 封装原曲 Implementation Plan

> **For agentic workers:** Use TDD (failing tests first, then minimal implementation) and verification-before-completion. Do not claim pass until `npm test` has been run in this worktree.

**Goal:** Give the lipsync trial path a single source of truth for the default workflow (迅风幻影自动版) and a testable finalize plan that muxes the original song over the generated clip before anyone reviews mouth movement.

**Architecture:** New `lib/mv-lipsync-finalize.mjs` (+ `.d.ts`) owns the workflow registry, `resolveLipsyncWorkflow`, and `planLipsyncFinalize` (pure; delegates compose checks to `checkMvCompose`). CLI `mv-lipsync-finalize` dry-runs the plan or calls existing `muxOriginalAudio`. `buildLipsyncTrialPlan` fills the default workflow when omitted.

**Tech Stack:** Node ESM (>=22), no new npm deps. Tests in `scripts/test-mv-lipsync-finalize.mjs`.

## Global Constraints

- Work only in `/workspace/directorMaster/.worktrees/mv-lipsync-finalize` on branch `feature/mv-lipsync-finalize`, stacked on `feature/mv-compose-validate` (PR #24 tip, 81a2291).
- Do not edit other worktrees or merge open PRs.
- No RH calls in lib/tests; no secrets; no large media; no private paths like `D:\...`.
- Do not change `mv-generate` / UI production default (像素幻想).
- No new genre template.
- Chinese reasons/messages.
- TDD: failing tests first, watch them fail, then implement. Frequent conventional commits.
- After implementation: `npm test` fully green. Update `docs/ITERATION_NOTES.md` + `docs/ITERATION_PLAN.md`, commit docs, push, open PR stacked on `feature/mv-compose-validate` (do not merge).

Follow the companion design: `docs/superpowers/specs/2026-11-13-mv-lipsync-finalize-design.md`.
