# MV 口型试片提交前预检（钱包 + 每日配额 + 不连环烧币）设计

日期：2026-11-18 · 模块：MV / 口型试片流程

## 问题
`mv-lipsync-prep` 只校验人声段与近脸参考；`mv-lipsync-finalize` 只管封装原曲。中间「提交 RunningHub」之前没有任何可测试的预检：
- 11/14–11/18 连续多晚钱包为 0 币，全靠人工查 `accountStatus` 决定是否跳过；
- 用户规则「每晚最多 1 次成功试片 + 至多 1 次技术重试；选段/参考图错误导致不合格当晚不再重跑」只存在于 routine 文字里，代码不管。

## 方案
新增纯函数库 `lib/mv-lipsync-preflight.mjs`（无 node: 依赖、无网络）：
- `normalizeRhAccount(raw)`：兼容 `accountStatus` 原始响应 `{code,data:{remainCoins,remainMoney,apiType}}` 或已解包 `data`；字符串转数字。
- `checkLipsyncBudget({ account, minCoins })`：默认 `minCoins = 400`（实测 15s 试片 312 / 356 币）。无账户 → `NO_ACCOUNT`；币不足 → `INSUFFICIENT_COINS`（中文 reason 含余额与门槛）。
- `checkLipsyncDailyQuota({ ledger, date, maxSuccess=1, maxTechRetries=1 })`：
  - 当日已有成功 → `DAILY_SUCCESS_REACHED`
  - 当日失败中含 `selection` / `reference` 类 → `NON_TECH_FAILURE`（不连环烧币，修流程到下一晚）
  - 当日技术失败次数 > maxTechRetries（即已用完 1 次首跑 + 1 次重试）→ `RETRY_EXHAUSTED`
  - 否则 ok，返回 `attemptKind: 'first' | 'retry'`
- `recordLipsyncAttempt(ledger, entry)`：不可变追加；校验 `status ∈ success|failed`，failed 必须带 `failureKind ∈ technical|selection|reference`。
- `planLipsyncPreflight({ trialPlan, account, ledger, date, minCoins })` → `{ go, mode: 'go'|'skip', checks:{trial,budget,quota}, codes[], reason }`；任一失败即 skip，reason 合并全部失败原因（中文），便于汇报。

CLI `mv-lipsync-preflight`：参数同 `mv-lipsync-prep`，另加 `--account-json <file>`（离线）或环境变量 `RUNNINGHUB_API_KEY` 时只读调用 `/uc/openapi/accountStatus`；`--ledger <json>`、`--date YYYY-MM-DD`（默认 Asia/Shanghai 今日）、`--min-coins`、`--json`。skip → exit 1。CLI `mv-lipsync-ledger --ledger <json> --status success|failed [--failure-kind ...] [--task-id] [--date]` 写入台账。

## 验收标准
1. 账户字符串余额解析正确；`remainCoins="0"` → `INSUFFICIENT_COINS`，reason 含「0」与「400」
2. 余额 ≥ 门槛 → budget ok；自定义 `minCoins` 生效
3. 配额：空台账 → ok/first；1 次技术失败 → ok/retry；2 次技术失败 → `RETRY_EXHAUSTED`；1 成功 → `DAILY_SUCCESS_REACHED`；1 次 selection 失败 → `NON_TECH_FAILURE`；其他日期条目不计
4. `recordLipsyncAttempt` 不改原数组；非法 status / 缺 failureKind 抛错
5. `planLipsyncPreflight`：trial 未通过 + 钱包 0 → skip 且 reason 同时包含两者；全部通过 → go
6. CLI：`--account-json` 0 币 → exit 1 并输出 `INSUFFICIENT_COINS`；足额 → exit 0；无账户信息且无 key → skip `NO_ACCOUNT`（不联网）
7. 库无 `node:` 导入；`npm test` 全绿；无密钥/大媒体入库
