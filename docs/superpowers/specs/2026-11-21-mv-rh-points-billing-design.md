# Design: RunningHub 积分余额接入钱包解析、门禁与费用记录

Date: 2026-11-21
Module: MV / 流程优化 — 消费级 Key 改用官方 `remainPoint` / `chargedPoint`（积分），不再只认 RH 币
Status: Approved（用户在方案说明后回复「跑一轮」）

## Problem

1. 官方账户查询仍是 `POST https://www.runninghub.cn/uc/openapi/accountStatus`，但响应已单独返回 `remainPoint`（积分余额），与 `remainCoins`（RH 币）、`remainMoney`、`apiType` 并存。任务结果还可带 `consumeCoins`、`settleMode`（例如 `POINT`）和 `chargedPoint`（实扣积分）。见 [账户查询](https://www.runninghub.cn/runninghub-api-doc-cn/api-425748943) 与 [任务输出](https://www.runninghub.cn/runninghub-api-doc-cn/api-425749004)。
2. 仓库里的 `normalizeRhAccount`、生成/口型门禁、`vite-plugins/runninghub.ts` 的账户映射、MV 页「RH 币」展示与 `costCoins` 只读了 `remainCoins` / `consumeCoins`。积分账户在币为 0 时会被 `INSUFFICIENT_COINS` 拦住，即便 `remainPoint` 有一千多分。
3. 不能把 `remainCoins` 和 `remainPoint` 相加（单位不同）。24 / 秒的预估公式今晚不改；是否与积分 1:1，要等实跑一单用 `chargedPoint` 核对，本夜不付费验证。

## Goals

- `normalizeRhAccount` 解析 `remainPoint`（number 或数字字符串）。字段缺失时不要当成 0：旧夹具只有 `remainCoins` 时行为与今天一致。
- **可消费余额**：只要 `remainPoint` 出现（含 0），就只用 `remainPoint`；缺省时回退 `remainCoins`。禁止 `remainCoins + remainPoint`。
- 口型预检默认门槛仍为 400。`coins=0 && points=1939.39` 必须放行；`points` 在场且为 0 / 低于门槛则 skip。门禁走积分时，用户可见 reason 写「积分」。
- `planMvGeneratePreflight` / `planMvGenerateUiPreflight` 同一可消费规则；估算公式不变（2 段 15s+7.5s @ 24/秒 = 540）。`remainCoins=0` 且 `remainPoint >= 预估` → `go:true`；`remainPoint` 在场且不足时，剩余币再多也不放行。
- 插件账户映射透传 `points`（字段存在时 `points: Number(data.remainPoint)`）。`mapUiAccount` 把 `points` 映射为 `remainPoint`，供页面预检使用。
- MV 页 `RunningHubAccount`、页头「RH 币」、历史「消耗 N RH 币」在积分是当前可消费余额时改显示「积分」。
- 费用记录优先 `chargedPoint`，否则回退 `consumeCoins`。不编汇率。已有 `costCoins` 字段保留，但优先填 `chargedPoint`。
- UI 库仍不得 `import 'node:…'`。不改接口 URL，不提交付费任务，不把密钥写入仓库。

## Error codes / labels

- 稳定错误码仍用 `INSUFFICIENT_COINS`（已在 CLI、页面门禁、测试和历史日志里使用；改名会大面积牵动）。
- 用户可见文案：走积分时必须出现「积分」；仅币账户（无 `remainPoint`）保持现有「币」表述。

## Non-goals (tonight)

- 不改 24 / 秒估算，不发明币↔积分汇率。
- 不合并已打开的 PR 栈；不跑 `gh pr create`。
- 不调 RunningHub 付费 API，不跑 15s 口型试片。

## Verification

- 先扩展既有测试（`scripts/test-mv-lipsync-preflight.mjs` / `test-mv-generate-preflight.mjs` / `test-mv-generate-ui-preflight.mjs`），确认红，再写最小实现。
- 验收见计划与测试用例：官方形账户解析、口型 1939.39 放行 / 0 分拦截、生成 540 边界、`mapUiAccount` 透传 points、`pickRhJobCost` 优先 chargedPoint、UI 库无 `node:`。
- `npm test` 全绿。
