# RunningHub 积分预估按实扣校准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 本夜按 TDD 在 `feature/mv-rh-cost-calibrate`（base `feature/mv-rh-points-billing` @ 6476408）落地；规格见 `docs/superpowers/specs/2026-11-22-mv-rh-cost-calibrate-design.md`。夜间自动迭代，不另等一轮交互审批。使用 executing-plans 在本工作树内联执行。

**Goal:** 让 POINT 模式的生成/口型预检对已有实扣观测的工作流使用 `chargedPoint` 费率（×1.25 边际）估算，其它情况继续保守回退 24/秒与 400。

**Architecture:** 抽出浏览器安全的纯校准库（seed 观测 + 解析/去重 + 按 workflowId×unit 取最大费率），生成与口型预检在调用方未覆盖费率/门槛且提供 workflowId 时选用它。生产 CLI 与 MV 页只做 workflowId 透传。24 与 400 常量留在原模块且数值不变。

**Tech Stack:** 现有 Node ESM 测试脚本 + 纯函数 lib + React MV 页小幅透传（无新依赖）。

## Global Constraints

- 进入 `app/mv/page.tsx` 的库不得 `from 'node:…'`，校准库本身也不得 `node:` / fs / 网络。
- 校准库不得导入 `mv-lipsync-preflight.mjs` 或 `mv-generate-preflight.mjs`。
- 不改 `DEFAULT_MV_COINS_PER_SEC = 24`、`DEFAULT_LIPSYNC_MIN_COINS = 400`，不发明币↔积分汇率。
- 既有测试对 24 / 540 / 400 的断言不得修改并须保持绿色。
- 不提交密钥、试片媒体或 RunningHub 付费任务；不 force-push / 不改写已发布历史。

## File map

- Create: `lib/mv-rh-cost-calibrate.mjs` + `lib/mv-rh-cost-calibrate.d.ts`
- Create: `scripts/test-mv-rh-cost-calibrate.mjs`
- Create: 本设计与本计划
- Modify: `lib/mv-generate-preflight.mjs` + `.d.ts`（可选校准参数，挂 estimate 元数据）
- Modify: `lib/mv-generate-ui-preflight.mjs` + `.d.ts`（透传参数；校准标签）
- Modify: `lib/mv-lipsync-preflight.mjs` + `.d.ts`（可选校准；reason 写「按实扣校准」）
- Modify: `lib/mv-cloud-generate.mjs`（把实际/默认 `workflowId` 传入预检）
- Modify: `app/mv/page.tsx`（把 `cloudWorkflowId` 透传到 UI 预检，不重设计）
- Modify: `package.json`（`npm test` 接入新测试）
- Modify: `docs/ITERATION_NOTES.md`（完成后另 commit）

---

### Task 1: 失败测试 + 规格

**Files:**

- Create: `docs/superpowers/specs/2026-11-22-mv-rh-cost-calibrate-design.md`
- Create: `docs/superpowers/plans/2026-11-22-mv-rh-cost-calibrate.md`
- Create: `scripts/test-mv-rh-cost-calibrate.mjs`
- Modify: `package.json`（`test` 与 `test:mv-rh-cost-calibrate`）

- [ ] **Step 1: 写入设计、计划与失败测试**（断言见测试文件；覆盖 seed 9.69/146/219、无 workflowId → 24/540、迅风 → 24/400、积分 219 go / 218 INSUFFICIENT、口型 146/145、显式覆盖、纯币账户仍 24、taskId 去重、优先 chargedPoint、无 `node:`、页面/CLI 透传 workflowId）。

- [ ] **Step 2: 跑测试确认红**

Run: `node scripts/test-mv-rh-cost-calibrate.mjs`

Expected: FAIL（模块尚未存在或预检尚未接线）。既有 `node scripts/test-mv-generate-preflight.mjs` 等仍绿。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-22-mv-rh-cost-calibrate-design.md \
  docs/superpowers/plans/2026-11-22-mv-rh-cost-calibrate.md \
  scripts/test-mv-rh-cost-calibrate.mjs package.json
git commit -m "test(mv): failing RH cost calibration coverage + spec/plan"
```

### Task 2: 校准库 + 预检接线

**Files:** 见上方 File map 的 lib / 页面。

**Interfaces:**

- `appendCostObservation(observations, entry) => observation[]`
- `observationFromSettledJob(job) => observation | null`
- `resolveMvCostPerSec({ unit, workflowId, observations, margin, useSeed }) => { coinsPerSec, source: 'calibrated'|'default', observationCount, maxObservedPerSec, margin, workflowId, unit }`
- `resolveLipsyncMinCost({ unit, workflowId, observations, margin, durationSec, useSeed }) => { minCoins, source, ... }`
- `planMvGeneratePreflight` / `planMvGenerateUiPreflight` 增加可选 `workflowId`, `observations`, `useSeed`, `costMargin`
- `checkLipsyncBudget` / `planLipsyncPreflight` 增加同样可选字段；后者可回退 `trialPlan.workflowId`

- [ ] **Step 1: 实现校准库与接线，使新测试转绿，且不改既有 24/540/400 断言**

要点：

- seed 一条像素幻想观测；`useSeed` 默认 true；merge 时用 `appendCostObservation` 去重。
- 省略 `workflowId` 或无匹配观测 → 24 / 400，`source: 'default'`。
- 生成预检：已传 `coinsPerSec` 胜出；否则有 `workflowId` 时按账户可消费单位校准，并挂 estimate 元数据。
- 无账户时不要按积分校准（单位按 coins 回退，像素幻想无币观测 → 仍 24，保证 dry-run 既有 540 用例）。
- 口型：已传 `minCoins` 胜出；否则有 workflowId 则校准。迅风无观测 → 400。校准 reason 含门槛与「按实扣校准」。
- `formatMvGenerateEstimateLabel` 仅在 `estimate.source === 'calibrated'` 时加「按实扣校准」。
- `runMvGenerate` 把 `workflowId`（默认 `DEFAULT_WORKFLOW_ID`）传入 `planMvGeneratePreflight`。
- `app/mv/page.tsx` 在现有 `planMvGenerateUiPreflight` 调用处传入 `workflowId: cloudWorkflowId`（useMemo 依赖补上），不做页面重设计。

- [ ] **Step 2: 跑新测试与既有预检测试确认绿**

Run: `node scripts/test-mv-rh-cost-calibrate.mjs && node scripts/test-mv-generate-preflight.mjs && node scripts/test-mv-generate-ui-preflight.mjs && node scripts/test-mv-lipsync-preflight.mjs`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/mv-rh-cost-calibrate.mjs lib/mv-rh-cost-calibrate.d.ts \
  lib/mv-generate-preflight.mjs lib/mv-generate-preflight.d.ts \
  lib/mv-generate-ui-preflight.mjs lib/mv-generate-ui-preflight.d.ts \
  lib/mv-lipsync-preflight.mjs lib/mv-lipsync-preflight.d.ts \
  lib/mv-cloud-generate.mjs app/mv/page.tsx
git commit -m "feat(mv): calibrate RH point estimates from chargedPoint"
```

### Task 3: 全量验证、迭代笔记、push

- [ ] **Step 1: `npm test` 全绿（exit 0）后再写笔记**
- [ ] **Step 2: 在 `docs/ITERATION_NOTES.md` 顶部按 2026-11-21 积分接入条目的体例写 2026-11-22 记录（Asia/Shanghai，模块，验收，完成，验证）。15s 口型试片写明本夜试片另跑、结果待结束后再记，不编造费用或钱包数字。**
- [ ] **Step 3: Commit + push 分支（不开 PR）**

```bash
git add docs/ITERATION_NOTES.md
git commit -m "docs(mv): record RH cost calibration work for 2026-11-22"
git push -u origin feature/mv-rh-cost-calibrate
```

Compare: https://github.com/nanihaikeyidai/directorMaster/compare/feature/mv-rh-points-billing...feature/mv-rh-cost-calibrate
