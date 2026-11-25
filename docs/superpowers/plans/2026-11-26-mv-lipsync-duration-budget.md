# 口型试片按时长计门槛 Implementation Plan

> **For agentic workers:** 本夜 nightly 已按 TDD 在本计划范围内实现。

**Goal:** 把 11/24 像素幻想 10s / 82.28 写入费用种子，并让口型预检按实际试片窗口时长计算积分门槛。

**Architecture:** 只改 `lib/mv-rh-cost-calibrate.mjs` 的种子观测，以及 `lib/mv-lipsync-preflight.mjs` 的时长解析与文案。CLI 已把 `buildLipsyncTrialPlan` 的结果交给 `planLipsyncPreflight`，因此只要预检从 `trialPlan.audio.durationSec` 取值，命令行即可获得正确门槛。

**Tech Stack:** 现有 Node ESM 纯函数库 + `scripts/test-mv-rh-cost-calibrate.mjs` / `scripts/test-mv-lipsync-preflight.mjs`。

## Global Constraints

- 库文件不得引入 `node:`，以便浏览器打包。
- 校准取同一工作流、同一计价单位下的最高观测费率，再乘 `DEFAULT_RH_COST_MARGIN=1.25`。
- 未校准时口型门槛仍为 400（币时代回退），不得把积分观测套到币账户。
- 不提交密钥与大生成物。

---

### Task 1: 种子观测与像素幻想费率

**Files:**
- Modify: `lib/mv-rh-cost-calibrate.mjs`（`SEED_RH_COST_OBSERVATIONS`）
- Test: `scripts/test-mv-rh-cost-calibrate.mjs`

- [x] 先改测试：种子长度 3；15s 门槛 155、10s 门槛 103；生成预估 233。
- [x] 确认旧断言失败。
- [x] 追加 11/24 观测后测试通过。

### Task 2: 预检继承试片窗口时长

**Files:**
- Modify: `lib/mv-lipsync-preflight.mjs`（`checkLipsyncBudget` 文案、`planLipsyncPreflight` 解析时长）
- Test: `scripts/test-mv-rh-cost-calibrate.mjs`、`scripts/test-mv-lipsync-preflight.mjs`（含 CLI）

- [x] 失败测试：`trialPlan.audio.durationSec=10` 且 132.36 积分应 go（103）；102 应 skip 且文案为 10s。
- [x] 实现时长解析与文案后测试通过。
- [x] `npm test` 全绿。
