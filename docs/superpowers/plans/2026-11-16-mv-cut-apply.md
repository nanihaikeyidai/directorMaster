# MV 切镜门禁接入 mv-cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `planMvCutGate`，并把硬门禁接到 CLI `mv-cut`：导出分段前校验切点只落在句界、呼吸或人声空白；可选 `--snap-cuts` 吸附到句界后复检。

**Architecture:** 在既有纯函数库 `lib/mv-cut-gate.mjs` 增加 `planMvCutGate`，复用 `checkMvCuts`。`mv-cut` 在解析切点之后、ffmpeg 导出之前调用该函数；默认无证据时由 CLI 调用已有 `probeEnergyHops`。

**Tech Stack:** Node ESM, existing director-master CLI, fixture JSON, `node:assert` tests.

## Global Constraints

- 库内不跑 ffmpeg/ffprobe；不调用 RunningHub；不提交密钥或大媒体。
- 不破坏 `checkMvCuts` 现有测试与错误码。
- 不改变 `mv-cut` 的 15 秒段长规则；不增加跳过门禁的开关。
- 中文 `reason`。
- 分支基于 `feature/mv-cut-gate`。
- 本夜不给 MV 页新做切点编辑器，也不接 UI 预检。

---

### Task 1: Design already written

- [x] Spec: `docs/superpowers/specs/2026-11-16-mv-cut-apply-design.md`
- [x] This plan

### Task 2: Failing tests

**Files:**
- Create: `scripts/test-mv-cut-apply.mjs`
- Modify: `package.json` (`test` chain after `test-mv-cut-gate` + `test:mv-cut-apply`)

Cover: lyric happy path → `pass` and `appliedCuts` 等于合法切点；句中切且无 snap → `block`，中文 reason 含吸附建议，`appliedCuts` 不得变成 snapped 列表；句中切且 snap → `snap` 且 `appliedCuts` 为句界；吸附后合并为重复切点 → `block`；有切点无证据 → `NO_EVIDENCE`；空切点 + 12s / 90s → `skip`；help 的 `mv-cut` 行列出 `--lyrics` / `--hops-json` / `--snap-cuts`；源码检查 `mvCut()` 在导出分段的 ffmpeg 之前调用 `planMvCutGate`，且默认路径在缺歌词/hops-json 时调用 `probeEnergyHops`。

- [ ] Write failing tests first, run `node scripts/test-mv-cut-apply.mjs`, confirm missing export / `mv-cut` not calling the gate.
- [ ] Do not implement the library until the failure is observed.

### Task 3: Library + typings

**Files:**
- Modify: `lib/mv-cut-gate.mjs`, `lib/mv-cut-gate.d.ts`

Implement `planMvCutGate` per the design.

### Task 4: CLI wiring

**Files:**
- Modify: `cli/director-master.mjs` (`mvCut()` import + gate + help)

Parse optional `--lyrics` / `--hops-json` / `--snap-cuts` / `--tolerance`. Default probe hops. `!plan.ok` throws. Write compact `cutGate` on the manifest.

### Task 5: Verify and notes

- [ ] `node scripts/test-mv-cut-apply.mjs` green
- [ ] `npm test` green
- [ ] Update `docs/ITERATION_PLAN.md` and `docs/ITERATION_NOTES.md`
