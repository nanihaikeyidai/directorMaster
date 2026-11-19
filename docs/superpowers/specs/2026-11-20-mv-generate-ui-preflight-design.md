# Design: MV 页云端生成预算预估与硬门禁

Date: 2026-11-20
Module: MV / 流程优化 — 把 `planMvGeneratePreflight` 接到页面「一键云端出完整 MV」与「云端批量生成」
Status: Approved for nightly automation（用户锁定流程优化；昨夜 CLI `mv-generate --watch` 已硬门禁，页面尚未显示预估、提交前也不拦）

## Problem

1. `app/mv/page.tsx` 的「一键云端出完整 MV」（`generateFullMv`）只自动切段并生成提示词，并不提交 RunningHub；成功 notice 没有全部段预估币数，审核后点「云端批量生成」时看不到会花多少币。
2. 真正付费路径是 `openBatch("runninghub")` → `runBatch` → `enqueueGeneration` → `generateCloud` → POST `/api/local/runninghub/jobs`。这条链在入队和第一次 POST 之前都不跑昨夜的预算/输入预检，钱包不足或提示词/参考图不全时仍会上传并 create。
3. 页面段音频在内存 / project buffer 里，不能因为没有磁盘分段文件就报 `MISSING_AUDIO`。
4. 页头已有 `rhAccount`（`{ coins, walletBalance }`），账户形状与库用的 `{ remainCoins, remainMoney }` 不同。

## Goals

- 薄封装 `lib/mv-generate-ui-preflight.mjs`（无 `node:` 导入，可进浏览器）：
  - `mapUiAccount(account)`：页面 `{ coins, walletBalance }` → `{ remainCoins, remainMoney }`；`null`/`undefined` 返 `null`；`walletBalance` 字符串可被 `normalizeRhAccount` 解析。
  - `buildMvGenerateUiManifest({ segments, prompts, visualAssets, indexes })`：给了 `indexes` 只含这些段，否则全部段。每段 `path` 固定为 `'ui://segment-audio'`；参考图过滤 audio，`path` 缺失时用 `id` 或 `'ui://picture'`。
  - `planMvGenerateUiPreflight(...)`：`exists = (p) => Boolean(p)`，`requireAccount: true`，账户缺省/`null` → `NO_ACCOUNT`；委托已有 `planMvGeneratePreflight`，不重写预算公式。
  - `formatMvGenerateEstimateLabel(plan, { loading })`：中文短标签，例如「预估 721 币（3 段）· 钱包 0 币，余额不足」；loading 时「预估 … · 钱包读取中」；`go` 且有账户时同时显示预估与钱包。
- 页面接入：
  - 在「一键云端出完整 MV」/「云端批量生成」附近显示全部段预估（有 segments 就显）。
  - 云端批量弹窗 footer 按 `batchSelection` 显示该选择集合的预估；余额不足时按钮可 disabled，并用 title/文案说明原因。本地批量不显示币预估门禁。
  - `generateFullMv` 成功 notice 附带全部段预估币数。
  - `refreshRhAccount` 既 setState 也 return 账户；失败返 `null` 并 `setRhAccountError`。
  - **硬门禁 1**：`enqueueGeneration` 在 `provider === "runninghub"` 时，入队前 await 刷新余额，对 `allowed` indexes 跑预检；`!go` 则 `setNotice(plan.reason)` 并 return，不入队、不改 review 状态。
  - **硬门禁 2**：`generateCloud` 在第一次 POST `/api/local/runninghub/jobs` 之前同样预检；失败 throw 中文 `reason`（重试路径也要拦）。
- 样式小改即可；不加跳过门禁开关；不强制改 jobs API；不新增 CLI。

## Non-goals (tonight)

- 不改 `planMvGeneratePreflight` 的估算公式与错误码。
- 不合并已打开的 PR 栈；不跑 `gh pr create`。
- 不调 RunningHub 付费 API（可读代码，不用密钥发网络请求）。
- 不实机 15s 口型试片（另由父代理查钱包与试片）。

## Verification

- 先写失败测试 `scripts/test-mv-generate-ui-preflight.mjs`，再写实现。
- 验收：2 段 15s+7.5s 默认 24 币/秒 → total 540；缺 prompt / 无图 / 段>15s → 对应 code；`{ coins: 0 }` → `INSUFFICIENT_COINS`；余额=预估且输入齐全 → `go:true`；account 缺省 → `NO_ACCOUNT`；indexes 子集只计那些段；`mapUiAccount({ coins: 0, walletBalance: "-0.013" })` 可被 normalize 为 remainCoins=0；UI 库无 `node:`；页面确实 import。
- `npm test` 全绿；无密钥、无大媒体、无 RH 付费。
