# 口型试片按实际时长计门槛 + 写入 11/24 像素幻想观测

日期：2026-11-26（Asia/Shanghai）
状态：已实现（本夜 nightly）

## 背景

11/25 口型试片选的是已验证的卡米拉 176–186s 人声窗（约 10s，活跃比 0.425），但预检仍按 15s 门槛 146 积分拦截；当时钱包 remainPoint=132.36。库函数 `resolveLipsyncMinCost` / `checkLipsyncBudget` 已接受 `durationSec`，可是：

1. `planLipsyncPreflight` 与 CLI `mv-lipsync-preflight` 没有把试片计划里选出的窗口时长传进去，缺省恒为 15s。
2. 余额不足文案写死「单次 15s 试片门槛」。
3. 11/24 像素幻想 MiniMaxH3ReferenceToVideo（workflowId `2087128116820013058`，taskId `2124900188027047937`）10s 实扣 chargedPoint 82.28 尚未写入 `SEED_RH_COST_OBSERVATIONS`。该笔费率 8.228 积分/秒，高于 11/21 同工作流 15s / 116.28（7.752/秒），校准应取最高观测费率。

## 方案

在现有校准模块上补观测，并让预检默认使用试片窗口时长。不新建库、不加本地梅林回退（本夜范围外）。

## 验收标准

1. `SEED_RH_COST_OBSERVATIONS` 含 11/24 像素幻想 10s / 82.28 / task `2124900188027047937`；同 taskId 再次追加不重复。
2. 像素幻想积分费率取 `max(116.28/15, 82.28/10) = 8.228`，乘默认边际 1.25 后：15s 门槛 `ceil(154.275)=155`，10s 门槛 `ceil(102.85)=103`；两段 15s+7.5s 生成预估为 155+78=233。迅风观测与未知工作流回退不变。
3. `checkLipsyncBudget` / `planLipsyncPreflight` 在未显式传入 `durationSec` 时，使用 `trialPlan.durationSec` 或 `trialPlan.audio.durationSec`；都没有则仍为 15。
4. 余额不足与通过文案使用实际时长（例如「单次 10s 试片门槛」），不得在 10s 窗口下写死「15s」。
5. CLI `mv-lipsync-preflight` 在 `--duration 10` 且选出约 10s 窗口、像素幻想工作流、积分账户 132.36 时为 `go`；102 积分时 `skip` 并提到 10s 门槛。
6. 校准库与口型预检库仍无 `node:` 依赖。`npm test` 全绿。

## 非目标

- 不改每日 1 次成功 + 1 次技术重试配额。
- 不在本夜实现梅林本地回退。
- 不提交密钥、隐私路径或试片成片。
