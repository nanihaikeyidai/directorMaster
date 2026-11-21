# Design: RunningHub 积分预估按实扣 chargedPoint 校准

Date: 2026-11-22
Module: MV / 流程优化 — POINT 模式预估改用已观测的 `chargedPoint` 费率（带安全边际），无观测时仍回退 24/秒与口型 400
Status: Approved（夜间自动迭代；按本设计直接落地，不另等一轮交互审批）

## Problem

1. 2026-11-21 已把门禁与记费切到 `remainPoint` / `chargedPoint`，但明确留下 `DEFAULT_MV_COINS_PER_SEC = 24` 与口型门槛 `DEFAULT_LIPSYNC_MIN_COINS = 400`。24 来自更早的 RH 币时代 15s 试片（312/356 币 ≈ 23.7/秒），不是积分汇率。
2. 同日一笔已结算的像素幻想 MiniMaxH3ReferenceToVideo（`workflowId` `2087128116820013058`，`taskId` `2124001118332866561`，15s）给出 POINT 时代实扣：`chargedPoint` 116.28，两个输出展示同一数值，钱包 1664.16 → 1547.88，差额正好 116.28（只扣一次）。约 7.752 积分/秒，远低于 24。
3. 若继续用 24 预估积分，会显著高估像素幻想任务，把门禁做得过严。但不能发明币↔积分汇率，也不能把 24 这个默认常量改掉：没有匹配观测的工作流（例如默认口型工作流「迅风幻影自动版」`2089048490512052225`）必须继续走 24/秒与 400。

## Goals

- 新增浏览器安全的纯函数库 `lib/mv-rh-cost-calibrate.mjs`（+ `.d.ts`）：无 `node:`、无 fs、无网络；不导入 `mv-lipsync-preflight.mjs` / `mv-generate-preflight.mjs`（由后者导入本库，避免循环）。
- 内置一条 seed 观测：上述 2026-11-21 像素幻想实跑（`cost` 116.28，`durationSec` 15，`source` `chargedPoint`，`settleMode` `POINT`，`unit` `points`，含 `workflowId` / `taskId` / `date`）。两次输出只记一条观测。
- `DEFAULT_RH_COST_MARGIN = 1.25`。匹配观测时：`rate = max(cost/durationSec) * margin`（取最大、不平均，避免低估）。15s 像素幻想 + 积分：`ceil(15 * 116.28/15 * 1.25) = 146`；15s+7.5s 合计 `146+73=219`。
- `resolveMvCostPerSec` / `resolveLipsyncMinCost` 必须同时给定 `unit` 与 `workflowId` 才校准。省略 `workflowId` 或工作流无该单位观测时，回退 24 与 400，`source: 'default'`。不把 A 工作流的费率套到 B。
- 生成预检 `planMvGeneratePreflight` / `planMvGenerateUiPreflight`：可选 `workflowId`、`observations`、`useSeed`、`costMargin`。已传 `coinsPerSec` 时以调用方为准、不自动校准。省略 `coinsPerSec` 且有 `workflowId` 时，用 `rhSpendable(account)` 推断单位（`remainPoint` 在场为 points，否则 coins），再调用 `resolveMvCostPerSec`。校准元数据挂到 `estimate`（`source` / `observationCount` / `maxObservedPerSec` 等），保留原有 `coinsPerSec` / `perSegment` / `total`。
- 生产路径要真正传入当前工作流 ID：云端生成 CLI（`lib/mv-cloud-generate.mjs` 的 `DEFAULT_WORKFLOW_ID` 或实际 job workflow）和 MV 页（默认/所选 `cloudWorkflowId`，默认即像素幻想 `2087128116820013058`）做小幅透传，不重设计页面。
- 口型 `checkLipsyncBudget` / `planLipsyncPreflight`：已传 `minCoins` 则以调用方为准。否则有 `workflowId`（`planLipsyncPreflight` 可从 `trialPlan.workflowId` 取）时，按可消费单位解析校准门槛。迅风无 seed → 仍 400。像素幻想 + 积分 → 146。校准后的 reason 须写出校准门槛并带「按实扣校准」。
- `formatMvGenerateEstimateLabel` 在 `estimate.source === 'calibrated'` 时可写「按实扣校准」。既有 540 币/积分标签测试不得改断言（那些调用不传像素 `workflowId`，除非误改默认行为）。
- 既有测试里对 24、540、400 的断言保持绿色，且不改那些断言。`DEFAULT_MV_COINS_PER_SEC` 与 `DEFAULT_LIPSYNC_MIN_COINS` 的数值不变。不发明币↔积分汇率。

## Observation shape

```ts
{
  workflowId: string;
  durationSec: number; // > 0
  cost: number;        // >= 0
  source: string;      // e.g. 'chargedPoint' | 'consumeCoins'
  settleMode?: string;
  unit: 'points' | 'coins';
  taskId?: string;
  date?: string;
  workflowName?: string;
  note?: string;
}
```

纯函数：

- `appendCostObservation(observations, entry)`：校验后返回新数组；同一 `taskId` 精确重复则跳过。
- `observationFromSettledJob(...)`：优先 `chargedPoint`（`unit: 'points'`），否则 `consumeCoins`（`unit: 'coins'`）。同一任务两个输出费用相同时，由调用方只记一条。
- `resolveMvCostPerSec({ unit, workflowId, observations, margin, useSeed = true })`
- `resolveLipsyncMinCost({ unit, workflowId, observations, margin, durationSec = 15, useSeed = true })`：校准则 `Math.ceil(durationSec * coinsPerSec)`，否则 400（本库内复制数字 400，避免循环导入；口型模块导出的常量仍是未校准时的权威值）。

## Non-goals (tonight)

- 不改默认工作流 ID，不改 24 / 400 常量值，不发明汇率。
- 不跑 RunningHub 付费任务，不把试片媒体、`.env`、密钥或 `create.json` 写入仓库。
- 不合并 PR、不 `gh pr create`、不 rebase / force-push。
- 不新增曲风模板。本夜 15s 口型试片另跑，不在本设计里编造试片结果。

## Verification

- 新测试 `scripts/test-mv-rh-cost-calibrate.mjs` 接入 `npm test`。覆盖 seed 费率与 146/219、无/未知 workflowId 回退 24/400/540、像素幻想积分门禁 219/218 与口型 146/145、显式 `coinsPerSec` / `minCoins` 覆盖、纯币账户仍 24、`taskId` 去重、`observationFromSettledJob` 优先 chargedPoint、新库无 `node:`。
- 既有 `test-mv-generate-preflight` / `test-mv-generate-ui-preflight` / `test-mv-lipsync-preflight` 的 24/540/400 用例不改断言且保持绿色。
- `npm test` 全绿。
