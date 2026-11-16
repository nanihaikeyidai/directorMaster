# Design: MV 页切点句界预检（UI 接入 planMvCutGate）

Date: 2026-11-17
Module: MV / 流程优化 — 页面切点也只落在句尾、换气或人声空白
Status: Approved for nightly automation（用户 2026-10-31 锁定切镜规则；2026-11-16 CLI `mv-cut` 已硬门禁，页面未接）

## Problem

1. `app/mv/page.tsx` 的「智能建议切点」只找低能量点，不跑句界门禁；手动/拖动切点可以落在一句歌词中间，照样生成提示词、提交云端。
2. `lib/mv-cut-gate.mjs` 依赖 `mv-lipsync-prep.mjs`（`node:fs` / `child_process`），不能打进浏览器包。
3. 顺带发现：11/14 接入页面的 `mv-compose-gate` → `mv-compose-validate.mjs` 引入 `node:path`，Vite/vinext 在客户端会把它换成抛错桩，`normalizeVideoPath` 一调就崩（预览/导出/云端成片三条合成路径都经过它）。

## Goals

- `lib/mv-energy-hops.mjs`（无 node: 依赖）：`isVocalActiveHop`、`computeEnergyHops(samples, { sampleRate, hopSec, scale })`、`mixToMono(buffer)`。非 16 kHz 输入先重采样到 16 kHz，阈值与 CLI 一致。
- `probeEnergyHops` 改为调用 `computeEnergyHops`，输出与改前逐字节一致；`mv-lipsync-prep` 继续导出 `isVocalActiveHop`（同一函数）。
- `mv-cut-gate` 改从 `mv-energy-hops` 取分类器。
- `lib/mv-cut-precheck.mjs`：`planMvCutPrecheck` 包装 `planMvCutGate`；`autoSnap` 吸附后按 trim 区间重算段长，超出 [MIN, 15s] → block。
- 页面：`runCutPrecheck`（按 AudioBuffer 缓存 hops）接入 `autoSplit`（自动吸附）、`generatePrompts`（手动切点不吸附，失败只提示）、`generateFullMv`（自动切点吸附、已有手动切点按原样校验）。
- `mv-compose-validate` 去掉 `node:path`，用等价的 posix normalize。
- 测试 `test-mv-cut-ui-precheck` 接入 `npm test`，并检查页面 lib 导入图无 `node:` 内置模块。

## Non-goals

- 不新增 UI 控件 / 不改切点编辑交互；不改 15 秒规则；不加跳过门禁开关。
- 页面暂不读歌词时间码（页面无逐句时间码），只用能量 hops。
- 不调 RunningHub。
