# 禁止凭空生成话筒支架 Implementation Plan

> **For agentic workers:** 本夜由每晚迭代在同一 worktree 内联执行（TDD：先红后绿）。

**Goal:** 让场景锁定词和民谣 v4 提示词明确禁止发明参考图中没有的麦克风/话筒支架。

**Architecture:** 扩展现有双语 `sceneLockText` 与 folk-solo/duo 的 close-up hold / continuity，不新开包。注入路径仍是 `appendIdentityLockToPrompt`。

**Tech Stack:** 现有 Node ESM 库 + `scripts/test-*.mjs`（`npm test`）。

## Global Constraints

- `lib/mv-character-consistency.mjs` 与 `lib/mv-prompt.mjs` 不引入 `node:`。
- 不改 piano-ballad / rock-solo / dance-edm / rap-hiphop。
- 无场景参考时 `sceneLockText` 仍为空。

---

### Task 1: sceneLockText 禁止话筒支架

**Files:**
- Modify: `lib/mv-character-consistency.mjs` (`buildSceneLockText`)
- Test: `scripts/test-mv-character-consistency.mjs`

- [x] **Step 1: Write the failing test**

在已有海边裁切包断言之后追加 microphone stand / boom arm / 话筒支架 / 除非场景参考中可见。

仅近脸、无场景的包仍须 `sceneLockText === ''`（现有断言保留）。

- [x] **Step 2: Run test to verify it fails**

Run: `node scripts/test-mv-character-consistency.mjs`

Expected: FAIL，现有词只有 handheld microphone / 手持麦克风，匹配不到 microphone stand / 话筒支架。

- [x] **Step 3: Write minimal implementation**

在 `buildSceneLockText` 的吉他-手持麦克风句之后追加中英条款（microphone stand, boom arm, mic hardware, 话筒支架，除非场景参考中可见）。

- [x] **Step 4: Re-run the test and confirm it passes.**

### Task 2: folk-solo/duo 升至 v4

**Files:**
- Modify: `lib/mv-prompt.mjs`（版本常量、close-up hold/camera tail、continuity）
- Modify: `docs/FOLK_SOLO_MV_PROMPT_STANDARD.md`, `docs/FOLK_DUO_MV_PROMPT_STANDARD.md`
- Test: `scripts/test-folk-mv-prompt.mjs`, `scripts/test-folk-duo-mv-prompt.mjs`

- [x] **Step 1: Write the failing tests**

版本断言改为 `folk-*-ref2va-v4`。唱词与无人声提示词都须匹配 microphone stand / mic stand；唱词镜头仍须保留特写场景残留；无人声段仍不得出现 tight facial close-up hold。

- [x] **Step 2: Run tests to verify they fail**

Run: `node scripts/test-folk-mv-prompt.mjs && node scripts/test-folk-duo-mv-prompt.mjs`

Expected: FAIL on version (仍是 v3) 且缺少 microphone stand。

- [x] **Step 3: Implement**

新增 `FOLK_NO_INVENTED_MIC`，拼进 close-up hold / camera tail，并追加到 folk-solo 与 folk-duo 的 Continuity 行。版本改为 v4。标准文档同步一句禁令。

- [x] **Step 4: `npm test` 全绿后提交。**
