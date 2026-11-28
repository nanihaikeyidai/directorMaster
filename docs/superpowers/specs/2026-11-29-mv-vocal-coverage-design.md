# 2026-11-29 MV 人声/伴奏覆盖切段

## 背景

用户对 2026-11-28 梅林 SelfLift 三段成片的质检指出：切点按显存而不是人声/伴奏划分，口型对不上原曲，而且**没有人声时嘴巴还在动**。仓库已有按歌词时间轴分段的 `planLyricPhraseSegments`（≥2 秒空档走远景），以及口型试片的人声能量 hops。缺的是：在没有完整歌词、只有人声活跃图时，同样按「人声特写对口型 / 伴奏远景或演奏且闭口不对脸」排出切点，并避免把短呼吸空档切成独立无人声段，也避免把前奏/尾奏和长伴奏并进人声段。

本夜补这一小块可验证规划器，不新开曲风，不提交付费任务，不抢占已约在 01:00 的梅林整首重跑。

## 目标

根据人声/伴奏区域（vocal map 或由能量 hops 推导）规划切段与镜头覆盖笔记，供 `mv-cut` 与本地/云端生成使用。无人声段的 direction 必须明确：**不对歌手脸，嘴巴自然闭合，不要做演唱口型**。

## 行为

1. `planVocalCoverageSegments({ regions, durationSec, maxSegmentSec, minInstrumentalSec })`：
   - `regions` 为 `{ start, end, vocal }` 列表（也接受 `vocal-map` JSON：`{ duration, regions: [{ start, end, vocal, ... }] }`）。
   - 默认 `maxSegmentSec = 15`，`minInstrumentalSec = 2`（与歌词分段一致）。
   - 无效时长或没有可用区域 → `ok: false`，中文 `reason`，`cuts` / `segments` 为空。
   - **≥ minInstrumentalSec 的无人声区**成为 `instrumental` 段：`shotType: "wide"`，`coverage: "instrumental-wide"`，direction 含远景或演奏镜头、不对歌手脸、嘴巴自然闭合、不要演唱口型。超过 `maxSegmentSec` 时按上限切开。
   - **短于 minInstrumentalSec 的无人声空隙**视为句间呼吸，并入相邻人声段，不单独出远景段，也不在句中硬切。
   - 人声段：`shotType: "lead"`，`coverage: "singing-closeup"`，direction 要求固定机位、脸部近景/半身弹唱、对口型。连续人声超过 `maxSegmentSec` 且中间没有可切的呼吸空隙时，才按上限切开，并标记 `cutReason: "max-duration"`。
   - 返回形状与歌词规划器对齐：`ok`, `reason`, `cuts`, `notes`, `segments`, `durationSec`。
2. `regionsFromEnergyHops(hops, opts)`：把已有能量 hops 收成上述 `regions`（用 `isVocalActiveHop`，可选覆盖阈值）。供没有现成 vocal-map 时使用。核心库不引入 `node:`。
3. 共用 `instrumentalCoverageNote()` 的无人声 direction 补上闭口/禁止演唱口型，歌词分段与人声图分段走同一套笔记。
4. CLI `mv-vocal-plan (--map <file>|--hops-json <file>) [--duration SEC] [--max-segment 15] [--min-instrumental 2] [--json]`：不通过时 exit 1。
5. `mv-cut` 省略 `--cuts` 且提供 `--vocal-map`（无 `--lyrics`）时，用本规划器自动分段并写入 notes；若同时有 `--lyrics`，仍优先歌词句界。

## 非目标

- 不在本夜做口型开合的视觉检测，也不自动抽帧。
- 不改口型试片 prep/preflight 门槛，不写入新的计费观测。
- 不把民谣模板升到 v5；提示词侧继续消费 segment notes / vocalTiming。
- 积分不足时不提交云端试片；不启动梅林 ComfyUI。

## 验收

见对应 plan 中的测试断言；`npm test` 全绿，含新的 `test-mv-vocal-coverage`。用 2026-11-28 卡米拉 vocal-map 夹具时：0–7.01s 与曲尾 214.92s 之后为伴奏远景段；181.9–185.12s（3.22s）为独立伴奏段；所有短于 2s 的空隙不得单独成段；无人声 direction 含闭口约束；每个人声段不超过 15s。
