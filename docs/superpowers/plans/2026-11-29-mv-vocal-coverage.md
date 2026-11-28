# 人声/伴奏覆盖切段 Implementation Plan

> **For agentic workers:** 本夜由每晚迭代在同一 worktree 内联执行（TDD：先红后绿）。

**Goal:** 按人声活跃图（或 hops）排出人声近景段与伴奏远景/闭口段，避免把前奏、尾奏或长伴奏并进人声段导致「没人声时嘴巴还在动」。

**Architecture:** 新增浏览器安全纯函数库 `lib/mv-vocal-coverage.mjs`，复用 `instrumentalCoverageNote` / `singingCoverageNote`。CLI `mv-vocal-plan` 读 map 或 hops；`mv-cut --vocal-map` 在省略切点且无歌词时走该规划器。

**Tech Stack:** 现有 Node ESM 库 + `scripts/test-*.mjs`（`npm test`）。

## Global Constraints

- `lib/mv-vocal-coverage.mjs` 不引入 `node:`。
- 不改 prep / preflight / finalize 门槛。
- 短于 2s 的无人声空隙不单独出远景段。

---

### Task 1: 纯函数规划器 + 闭口笔记

**Files:**
- Create: `lib/mv-vocal-coverage.mjs`, `lib/mv-vocal-coverage.d.ts`
- Modify: `lib/mv-lyric-segments.mjs`（加强 `instrumentalCoverageNote`）
- Test: `scripts/test-mv-vocal-coverage.mjs`
- Fixture: `examples/mv-vocal-map-camilla.json`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Re-run the test and confirm it passes.**

### Task 2: CLI `mv-vocal-plan` + `mv-cut --vocal-map`

**Files:**
- Modify: `cli/director-master.mjs`、`package.json`
- Test: `scripts/test-mv-vocal-coverage.mjs`（spawn CLI）

- [ ] **Step 1: Write the failing CLI / mv-cut assertions**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement the command and wire `npm test`.**
- [ ] **Step 4: `npm test` 全绿后提交。**
