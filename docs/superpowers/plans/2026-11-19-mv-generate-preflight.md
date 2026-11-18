# Plan: mv-generate 提交前预检

1. 写失败测试 `scripts/test-mv-generate-preflight.mjs`（估算 / 输入 / 预算 / runMvGenerate 零上传 / dry-run 产物 / 无 node: 导入），接入 `npm test`，确认红。
2. 实现 `lib/mv-generate-preflight.mjs` + `.d.ts`。
3. `lib/mv-cloud-generate.mjs`：`runMvGenerate` 上传前跑预检；可注入 `rh`（callRh/uploadRh 桩）便于测试；抛中文错误。
4. CLI `mv-generate` 参数 + help。
5. `npm test` 全绿 → 迭代笔记 → commit/push。
