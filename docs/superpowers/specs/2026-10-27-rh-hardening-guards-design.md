# RunningHub 加固（Sprint 2 第一块）设计 — 2026-10-27

## 问题
1. `adaptRunningHubWorkflow` 对 `mv-reference` / `feihou-remix` 只取 `segments[0]`，多段请求会**静默丢段**还照常扣费。
2. 项目根写死 `D:/HermesWorkspace/directorMaster`，DPAPI 路径写死 `C:\Users\Administrator\...`，换机器/换用户即失效。
3. 任务记录无 `updatedAt` / 段数，失败信息可能夹带密钥，排查困难。

## 方案
纯函数 `lib/runninghub-guards.mjs`（无网络、不返回密钥）：
- `assertSegmentCountForKind(kind, n)`：单段工作流收到 >1 段 → `status 400`、`code RH_MULTI_SEGMENT_UNSUPPORTED`；0 段 → `RH_NO_SEGMENTS`。
- `resolveDirectorRoot(env, cwd)`：`DIRECTOR_MASTER_ROOT` > 启动目录。
- `resolveRunningHubKeySource(env, platform)`：`RUNNINGHUB_API_KEY` > Windows `RUNNINGHUB_DPAPI_FILE` > `%USERPROFILE%\.codex\secrets\runninghub-api-key.dpapi` > missing（中文指引）。
- `redactSecret` / `summarizeCloudJob`：可观测摘要（耗时、终态、脱敏错误）。

接线：adapter 入口调用守卫；`runninghub.ts` 用可移植根与密钥来源，`save()` 写 `updatedAt`，job 记 `segmentCount`，失败信息脱敏；`/config` 返回 `keySource`、`root`；本地路由按 `error.status`(4xx) 返回并带 `RH_*` code。

## 验收
- [x] 单段工作流多段请求 → 400 + `RH_MULTI_SEGMENT_UNSUPPORTED`，不上传、不提交
- [x] 无 `D:/` / `Administrator` 硬编码；env 优先
- [x] 密钥来源描述中不含明文；错误信息脱敏
- [x] `npm test` 全绿；改动文件 eslint 通过；tsc 无新增错误
- [ ] 前端展示 `summarizeCloudJob`（下一块）
