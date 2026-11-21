# Plan: RunningHub 积分余额接入钱包解析、门禁与费用记录

> **For agentic workers:** 用户已批准本夜方案（「跑一轮」）；规格见 `docs/superpowers/specs/2026-11-21-mv-rh-points-billing-design.md`。按 TDD 在 `feature/mv-rh-points-billing` 落地，不另等一轮 review。

**Goal:** 让口型试片、云端整片预检和 MV 页按官方积分（`remainPoint` / `chargedPoint`）判断余额与记费，币为 0 但积分足够时不再误拦。

**Architecture:** 在已有 `normalizeRhAccount` 上附加可选 `remainPoint`；抽出可消费余额规则与 `pickRhJobCost`，生成预检和 UI 封装继续委托，不重写 24 / 秒公式。

**Tech Stack:** 现有 Node ESM 测试脚本 + React MV 页 + `vite-plugins/runninghub.ts`（无新依赖）。

## Global Constraints

- 进入 `app/mv/page.tsx` 的库不得 `from 'node:…'`。
- 禁止 `remainCoins + remainPoint`；字段缺失不等于 0。
- 错误码可保留 `INSUFFICIENT_COINS`；用户可见文案走积分时写「积分」。
- 不提交密钥或 RunningHub 付费任务；不 force-push / 不改写已发布历史。

### Task 1: 失败测试 + 规格

- Modify: `scripts/test-mv-lipsync-preflight.mjs`、`scripts/test-mv-generate-preflight.mjs`、`scripts/test-mv-generate-ui-preflight.mjs`
- Create: 本设计与本计划

先跑确认红（解析不到 remainPoint、0 币+积分仍被拦、文案仍只写「币」）。

### Task 2: 解析、门禁、记费、页面

- Modify: `lib/mv-lipsync-preflight.mjs` + `.d.ts`（normalize、budget reason、`pickRhJobCost`）
- Modify: `lib/mv-generate-preflight.mjs` + `.d.ts`、`lib/mv-generate-ui-preflight.mjs` + `.d.ts`（同一可消费规则；UI 文案）
- Modify: `vite-plugins/runninghub.ts`（透传 points；costCoins 优先 chargedPoint）
- Modify: `app/mv/page.tsx`（类型、mapUiAccount 所需 points、页头与历史「积分」）
- Modify: `lib/mv-cloud-generate.mjs`（结果费用优先 chargedPoint；钱包摘要带 remainPoint）

### Task 3: 全绿与提交

`npm test` 全绿后写迭代笔记，按 nightly 风格分 commit 并 push 分支（不开 PR）。
