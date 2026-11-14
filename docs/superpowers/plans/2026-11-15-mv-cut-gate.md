# MV 切镜句界门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `checkMvCuts` + CLI `mv-cut-check`，在提交/剪辑前拦住歌词句中硬切，并把非法切点吸附到句界或人声能量谷。

**Architecture:** 纯函数库 `lib/mv-cut-gate.mjs` 复用 `isVocalActiveHop`。歌词时间码优先；否则用 hops 上的人声活跃段边界与空白。CLI 只负责读入切点/歌词/hops 或调用已有 `probeEnergyHops`，再打印报告。

**Tech Stack:** Node ESM, existing director-master CLI, fixture JSON, `node:assert` tests.

## Global Constraints

- 库内不跑 ffmpeg/ffprobe；不调用 RunningHub；不提交密钥或大媒体。
- 默认容差 0.12s；hops 有效容差 `max(toleranceSec, hopSec / 2)`。
- 本夜不默认改 `mv-cut` 行为。
- 中文 `reason` / issue.message。
- 分支基于 `feature/mv-compose-ui-gate`。

---

### Task 1: Design already written

- [x] Spec: `docs/superpowers/specs/2026-11-15-mv-cut-gate-design.md`
- [x] This plan

### Task 2: Failing tests

**Files:**
- Create: `scripts/test-mv-cut-gate.mjs`
- Create: `examples/mv-cut-hops.json`, `examples/mv-cut-lyrics.json`

Cover: happy lyric boundaries; mid-lyric snap (tie → later end); hops vocal-gap vs mid-run; song edges; 120ms tolerance (5.50 vs 5.58 ok, deep interior fail); NO_CUTS / NO_EVIDENCE / DUPLICATE_CUT / OUT_OF_RANGE / INVALID_CUT; CLI ok exit 0 and mid-lyric exit 1; help lists `mv-cut-check`.

- [ ] Write failing tests first, run `node scripts/test-mv-cut-gate.mjs`, confirm missing export / command.
- [ ] Do not implement the library until the failure is observed.

### Task 3: Library + typings

**Files:**
- Create: `lib/mv-cut-gate.mjs`, `lib/mv-cut-gate.d.ts`

Implement `CUT_GATE_TOLERANCE_SEC`, `parseLyricCues`, `findVocalRuns`, `classifyCutPoint`, `checkMvCuts` per the design.

### Task 4: CLI + npm test hook

**Files:**
- Modify: `cli/director-master.mjs` (import, `mvCutCheck()`, dispatch, help)
- Modify: `package.json` (`test` chain + `test:mv-cut-gate`)

CLI parses `--cuts` as comma-separated seconds (also accept a JSON array string). Optional `--lyrics`, `--hops-json`, `--audio`, `--tolerance`, `--duration`. Print JSON. `!ok` → `process.exitCode = 1`.

### Task 5: Verify and notes

- [ ] `node scripts/test-mv-cut-gate.mjs` green
- [ ] `npm test` green
- [ ] Update `docs/ITERATION_PLAN.md` and `docs/ITERATION_NOTES.md`
