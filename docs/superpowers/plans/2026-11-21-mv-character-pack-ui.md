# Plan: MV 页人物一致性包预检与应用

> **For agentic workers:** 本夜按 TDD 在当前会话落地；规格见 `docs/superpowers/specs/2026-11-21-mv-character-pack-ui-design.md`。

**Goal:** 让 MV 页在生成提示词和云端提交前应用人物一致性包（近脸锁脸硬门禁、参考图排序、注入 identity lock），并把核心库改成浏览器可导入。

**Architecture:** 抽出纯函数 `assessFaceCloseUpRef`；一致性核心去掉 `node:`；fs 列目录单独文件；页面只导入薄封装 `planMvCharacterPackUi` 与已有 `appendIdentityLockToPrompt`。

**Tech Stack:** 现有 Node ESM 测试脚本 + React MV 页（无新依赖）。

## Global Constraints

- 库进入 `app/mv/page.tsx` 的依赖图不得包含 `from 'node:…'`，也不得导入 `lib/mv-lipsync-prep.mjs`。
- 不重写组包规则，委托 `applyCharacterPackToAssets`。
- 不加跳过门禁开关；不新增 CLI；不提交密钥或大媒体。

### Task 1: 失败测试

- Create: `scripts/test-mv-character-pack-ui.mjs`
- Modify: `package.json` 的 `test` / 增加 `test:mv-character-pack-ui`

先跑确认红（模块不存在或页面未接线）。

### Task 2: 浏览器安全核心 + UI 规划器

- Create: `lib/mv-face-closeup.mjs` + `.d.ts`；`lib/mv-character-consistency-fs.mjs` + `.d.ts`；`lib/mv-character-pack-ui.mjs` + `.d.ts`
- Modify: `lib/mv-lipsync-prep.mjs` 改为再导出 `assessFaceCloseUpRef`；`lib/mv-character-consistency.mjs` 去掉 node 导入；CLI 与 `scripts/test-mv-character-consistency.mjs` 改导入 `listCharacterRefPaths`。

跑 `node scripts/test-mv-character-pack-ui.mjs` 与既有 character/lipsync 测试至库用例绿、页面用例仍红（若尚未接线）。

### Task 3: 页面接入

- Modify: `app/mv/page.tsx`、必要时 `app/globals.css`
- 参考图栏标签 + 角色下拉 + 整理顺序；生成提示词用排序后素材并追加锁脸词；硬门禁接到 `generatePrompts` / `generateFullMv` / 云端入队与 jobs POST。

`npm test` 全绿后写迭代笔记并更新 `docs/ITERATION_PLAN.md`。
