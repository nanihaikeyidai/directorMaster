# Plan — RH 加固守卫（2026-10-27）

1. RED：`scripts/test-runninghub-guards.mjs`（模块不存在 → 失败）✅
2. GREEN：`lib/runninghub-guards.mjs` + `.d.ts` ✅
3. 接线 adapter / `runninghub.ts` / 本地路由 4xx ✅
4. 接入 `npm test`；eslint 改动文件；tsc 对比基线（仅既存 TS2769）✅
5. 文档：RUNNINGHUB.md、ITERATION_PLAN、ITERATION_NOTES ✅
6. 后续：任务中心展示摘要；工作流选择的 kind 预检接口（`/config` 列表带 kind）
