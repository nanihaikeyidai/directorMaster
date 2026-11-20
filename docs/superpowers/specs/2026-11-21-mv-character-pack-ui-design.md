# Design: MV 页人物一致性包预检与应用

Date: 2026-11-21
Module: MV / 人物一致性 — 把已有 `buildCharacterConsistencyPack` / `applyCharacterPackToAssets` / `appendIdentityLockToPrompt` 接到 MV 页参考图栏与提示词/云端提交路径
Status: Approved for nightly automation（用户 2026-11-07 优先口型与人物一致性；CLI 已组包并接入 `mv-cut` / 口型试片，页面仍按上传顺序取图且不注入锁脸词）

## Problem

1. `mv-character-pack` 与 `mv-cut` 已强制近脸锁脸、按「近脸 → 三视图 → 换装 → 场景」排序，并在提示词中写入 `identityLockText`。MV 页是日常主路径，`visualAssets` 只分「人物 / 场景」，生成提示词与云端提交既不整理顺序，也不追加锁脸词，换装后容易丢脸。
2. `lib/mv-character-consistency.mjs` 顶层导入 `node:fs` / `node:path`，并导入带 `node:child_process` 的 `lib/mv-lipsync-prep.mjs`。若直接在 `app/mv/page.tsx` 引用，会重演 11/17 的浏览器 `node:` 崩溃。
3. 文件名不含 still-B / 近脸 / 胸像 等提示时，纯路径启发式无法识别锁脸；页面需要可覆盖的 `role`，否则用户无法把一张普通文件名的胸像标成近脸。

## Goals

- 抽出浏览器安全的近脸判定：`lib/mv-face-closeup.mjs` 导出 `assessFaceCloseUpRef`（行为与现实现一致）。`lib/mv-lipsync-prep.mjs` 再导出同一函数，既有测试不改调用点。
- `lib/mv-character-consistency.mjs` 改为无 `node:`、不导入 `mv-lipsync-prep.mjs`：改用 `mv-face-closeup.mjs`；`normalizeRefPath` 用纯字符串实现（至少将 `a/b/../c/still-B.jpg` 收成 `a/c/still-B.jpg`，反斜杠改斜杠）。`listCharacterRefPaths` 迁到 `lib/mv-character-consistency-fs.mjs`（允许 `node:`）；CLI 与既有测试改为从该文件导入。一致性核心库不得再导出或导入该 fs 辅助，以免污染页面依赖图。
- 薄封装 `lib/mv-character-pack-ui.mjs`（无 `node:`，不导入 `mv-lipsync-prep.mjs`）：
  - `CHARACTER_REF_ROLE_LABELS`：`face_closeup` 近脸锁脸、`threeview_front` 三视图正面、`threeview_side` 三视图侧面、`threeview_back` 三视图背面、`costume` 换装、`scene` 场景、`unknown` 自动识别。
  - `planMvCharacterPackUi({ visualAssets })`：把 `asset.role` 或 `category === '场景' → scene` 交给已有 `applyCharacterPackToAssets`，不重写组包规则。
    - 无素材 → `go:false`，`code:'NO_ASSETS'`，中文 reason。
    - 有素材但无近脸锁脸 → `go:false`，`code:'MISSING_FACE_LOCK'`，reason 提及近脸/锁脸。
    - 有锁脸 → `go:true`，`code:'OK'`，带 `orderedAssets`（近脸在前）、`identityLockText`、`warnings`（缺三视图时与核心库一致）、`roles`（每张图的角色）。
  - `formatMvCharacterPackLabel(plan)`：通过时「人物一致性：已锁脸 <主锁脸文件名>」；有三视图警告则追加「· 缺三视图」；失败时「人物一致性：缺少近脸锁脸参考」或对应中文 reason 短句。
- 页面接入：
  - `Asset` 增加可选 `role`；项目保存/恢复已序列化 `visualAssets`，因此 role 会随项目持久化。
  - 参考图栏展示一致性标签；每张图一个角色下拉（含「自动识别」）；「按一致性包整理顺序」在 `go` 时把 `visualAssets` 设为 `orderedAssets`。
  - `signatureFor` 纳入每张图的 `role`，改角色后提示词需重生成。
  - **硬门禁**：`generatePrompts`、`generateFullMv`，以及云端 `enqueueGeneration` / `generateCloud`，在 `!go` 时 `setNotice(plan.reason)`（或 throw 同一中文 reason），不生成提示词、不入队、不 POST jobs。
  - 生成提示词时用 `orderedAssets`（`go` 时）调用 `buildMvPromptForTemplate`，再用 `appendIdentityLockToPrompt` 写入锁脸词。单段重生成同样处理。
- 样式小改即可；不加跳过门禁开关；不新增 CLI。

## Non-goals (tonight)

- 不在浏览器里做像素级人脸检测 / 自动算 faceBox。
- 不改 CLI `mv-cut` 组包规则（只改 `listCharacterRefPaths` 的导入路径）。
- 不合并已打开的 PR 栈；不调用需要机主批准的 `createPullRequest`（以免半夜卡住例程）。
- 不调 RunningHub 付费 API。
- 15s 口型试片仍受钱包门槛约束，有币再跑，无币则跳过并记录。

## Verification

- 先写失败测试 `scripts/test-mv-character-pack-ui.mjs`，再写实现。
- 验收见测试：NO_ASSETS / MISSING_FACE_LOCK / still-B 通过且顺序与锁脸词 / `role` 覆盖普通文件名 / label 文案 / 一致性核心库与 UI 库无 `node:` 且不导入 `mv-lipsync-prep.mjs` / 页面 import 与门禁接线 / `a/b/../c/still-B.jpg` 归一化。
- 既有 `test-mv-character-consistency` 与 `test-mv-lipsync-prep` 全绿。
- `npm test` 全绿；无密钥、无大媒体、无 RH 付费。
