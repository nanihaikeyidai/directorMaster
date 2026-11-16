# Plan: MV 页切点句界预检

1. 写失败测试 `scripts/test-mv-cut-ui-precheck.mjs`（浏览器安全、16k/48k 一致、Int16 scale、precheck pass/block/snap/超长/skip/trim、页面三处接线、导入图无 node:）。
2. 抽出 `lib/mv-energy-hops.mjs`；`probeEnergyHops` 改用之；用 camilla-30s 对比改前 hops 逐字节一致。
3. `mv-cut-gate` 改依赖；新增 `lib/mv-cut-precheck.mjs` + d.ts。
4. 页面接入 `runCutPrecheck`。
5. `mv-compose-validate` 去 `node:path`。
6. `npm test` 全绿；esbuild 以 browser 平台打包 `app/mv/page.tsx` 通过；真实音频 44.1k 浏览器路径与 CLI 16k 路径人声判定一致。
