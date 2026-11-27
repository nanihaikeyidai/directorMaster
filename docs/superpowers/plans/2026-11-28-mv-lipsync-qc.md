# 口型试片成片近脸覆盖 QC Implementation Plan

> **For agentic workers:** 本夜由每晚迭代在同一 worktree 内联执行（TDD：先红后绿）。

**Goal:** 用抽帧几何信号检查人声口型试片的近脸覆盖，避免只靠文件名或人工目检。

**Architecture:** 新增浏览器安全纯函数库 `lib/mv-lipsync-qc.mjs`，复用与参考图门禁相同的几何阈值，但明确忽略生成帧路径提示。CLI 只读 `--frames-json`。

**Tech Stack:** 现有 Node ESM 库 + `scripts/test-*.mjs`（`npm test`）。

## Global Constraints

- `lib/mv-lipsync-qc.mjs` 不引入 `node:`。
- 不改 prep / preflight / finalize 的既有门槛。
- 不引入人脸检测依赖。

---

### Task 1: 纯函数成片近脸 QC

**Files:**
- Create: `lib/mv-lipsync-qc.mjs`, `lib/mv-lipsync-qc.d.ts`
- Test: `scripts/test-mv-lipsync-qc.mjs`

- [x] **Step 1: Write the failing test**

覆盖：缺帧 / 少于 3 帧报 `MISSING_FRAMES`；路径带 close-up 但无几何信号不得判近脸；7/10 帧 `faceHeightRatio >= 0.25` 通过；10 帧中景（脸高占比过低）报 `LOW_CLOSEUP_COVERAGE`；`purpose: instrumental` 即使全是远景也通过。

- [x] **Step 2: Run test to verify it fails**

Run: `node scripts/test-mv-lipsync-qc.mjs`

Expected: FAIL，模块或导出尚不存在。

- [x] **Step 3: Write minimal implementation**

实现 `assessOutputFrameCloseUp` 与 `planLipsyncQc`，默认 `minCloseUpRatio = 0.6`、`minFrames = 3`、`purpose = 'vocal'`。

- [x] **Step 4: Re-run the test and confirm it passes.**

### Task 2: CLI `mv-lipsync-qc`

**Files:**
- Modify: `cli/director-master.mjs`（命令、帮助行）
- Modify: `package.json`（接入 `npm test`）
- Test: `scripts/test-mv-lipsync-qc.mjs`（spawn CLI）

- [x] **Step 1: Write the failing CLI assertions**

`--frames-json` 通过样本 exit 0；中景样本 exit 1；缺参报错。

- [x] **Step 2: Run tests to verify they fail**

- [x] **Step 3: Implement the command and wire `npm test`.**

- [x] **Step 4: `npm test` 全绿后提交。**
