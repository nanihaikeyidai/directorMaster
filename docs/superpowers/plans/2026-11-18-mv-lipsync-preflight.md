# Plan：MV 口型试片提交前预检

1. RED：`scripts/test-mv-lipsync-preflight.mjs` 覆盖验收 1–7，确认因模块缺失失败
2. GREEN：`lib/mv-lipsync-preflight.mjs` + `.d.ts`
3. GREEN：CLI `mv-lipsync-preflight` / `mv-lipsync-ledger` + help
4. 接入 `npm test`；全量 `npm test`
5. 文档：ITERATION_NOTES、ITERATION_PLAN、MV_STUDIO 试片流程（prep → preflight → 提交 → ledger → finalize）
6. commit / push / PR
