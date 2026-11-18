# MV 云端生成提交前预检（mv-generate --watch 硬门禁）

日期：2026-11-19 · 模块：MV / 流程优化（RH 加固，口型试片同一提交通道）

## 问题
- `runMvGenerate --watch` 先查一次 `accountStatus` 但不使用，直接逐段上传 + create；钱包不足要等第 1 段 create 返回 605 才知道，素材已上传。
- 每段的 prompt 缺失只在循环内检查：第 3 段缺 prompt 时，第 1–2 段已经扣币生成，整片作废（连环烧币）。
- 音频/参考图路径不存在、单段 >15s 同样只在上传时暴露。
- 11/18 的 `mv-lipsync-preflight` 只管 15s 试片，整片生成入口没有任何预算门禁。

## 方案
新增纯函数库 `lib/mv-generate-preflight.mjs`（无 `node:` 依赖、无网络；文件存在性由调用方注入 `exists`）：
- `estimateMvGenerateCoins(segments, { coinsPerSec })`：默认 24 币/秒（实测 15s 试片 312/356 币 ≈ 23.7/s）；每段 `ceil(duration × cps)`；时长缺失/非法按 15s 保守估。
- `validateMvGenerateInputs(manifest, { exists, maxSegmentSec = 15 })`：`NO_SEGMENTS` / `NO_PICTURES` / `MISSING_PROMPT` / `MISSING_AUDIO` / `MISSING_PICTURE` / `SEGMENT_TOO_LONG`。
- `planMvGeneratePreflight({ manifest, account, exists, coinsPerSec, reserveCoins })`：合并输入校验 + 预算（复用 `normalizeRhAccount`）；`account` 缺省 → `NO_ACCOUNT`；余额 < 估算 + 预留 → `INSUFFICIENT_COINS`。输出 `go` / `codes` / `estimate` / 中文 `reason`。
- `runMvGenerate`：**任何上传之前**跑预检；dry-run 只写 `generate-preflight.json`（有账户就带预算）；`--watch` 时预检不通过直接抛中文错误，不上传、不 create。
- CLI `mv-generate` 新增 `--coins-per-sec`、`--reserve-coins`、`--account-json`；dry-run 有 key 时只读查余额。

## 验收标准
1. 估算：2 段 15s + 7.5s，默认 → 360 + 180 = 540；时长缺失按 15s。
2. 输入：缺 prompt / 缺音频 / 缺图 / 超 15s / 无段 / 无图 → 对应 code，`go:false`，reason 含段号。
3. 预算：0 币 → `INSUFFICIENT_COINS`；余额 = 估算 → go；无账户 → `NO_ACCOUNT`。
4. `runMvGenerate({watch:true})` 在 0 币或第 2 段缺 prompt 时 reject，且注入的上传/创建桩**零调用**。
5. dry-run 写出 `generate-preflight.json`；不联网。
6. 库无 `node:` 导入；`npm test` 含 `test-mv-generate-preflight`；无密钥 / 无大媒体 / 无 RH 付费。
