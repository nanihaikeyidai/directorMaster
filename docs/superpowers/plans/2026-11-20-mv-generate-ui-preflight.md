# Plan: MV 页云端生成预算预估与硬门禁

1. 写失败测试 `scripts/test-mv-generate-ui-preflight.mjs`（估算 540、输入错误码、预算/NO_ACCOUNT、indexes 子集、mapUiAccount 解析、label、库无 node:、页面 import 与两道硬门禁接线），接入 `package.json` 的 `test`，确认红。
2. 实现 `lib/mv-generate-ui-preflight.mjs` + `.d.ts`：`mapUiAccount` / `buildMvGenerateUiManifest` / `planMvGenerateUiPreflight` / `formatMvGenerateEstimateLabel`，委托已有 `planMvGeneratePreflight`。
3. 页面接入：预估展示、`refreshRhAccount` 返回账户、`generateFullMv` notice 附带预估、`enqueueGeneration` 与 `generateCloud` 硬门禁；云端批量 footer 按选中段显示并在余额不足时禁用；本地批量不显示币门禁。
4. `npm test` 全绿 → 迭代笔记 → commit/push（不 `gh pr create`）。
