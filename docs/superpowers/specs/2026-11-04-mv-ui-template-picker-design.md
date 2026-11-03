# MV UI 模板下拉读注册表（2026-11-04）

## 背景
CLI 已有 `MV_PROMPT_TEMPLATES` / `listMvPromptTemplates` / `buildMvPromptForTemplate`（band、folk-solo、folk-duo、piano-ballad、rock-solo），但 `app/mv/page.tsx` 仍硬编码 `buildStandardBandMvPrompt` 与 `BAND_MV_PROMPT_TEMPLATE_VERSION`，用户在 MV Master 首页无法选用其他曲风模板。

## 目标
MV 制作页提示词工具栏增加模板下拉，选项直接来自 `listMvPromptTemplates()`；生成提示词走 `buildMvPromptForTemplate`；所选模板写入项目并参与 signature，切换模板会使已有提示词失效并需重新生成。

## 非目标
- 不新增曲风模板（dance-edm 等留给后续 nightly）
- 不改 RH 付费路径、不改切镜算法
- 不做 React 组件库级重构；最小改动接线

## 设计

### 1. 规范化助手（可单测）
- `normalizeMvPromptTemplateId(raw)`：空/未知 → `"band"`；已注册 id → 原样返回
- 供 UI 恢复旧项目与 PUT 持久化共用，避免脏数据炸页面

### 2. API
- `GET /api/local/mv/templates` → `{ templates: listMvPromptTemplates() }`（与 CLI `mv-templates` 同数据源，方便外部/调试）

### 3. 持久化
- 项目 `project.json` 增加 `promptTemplateId`（默认 `band`）
- `PUT /api/local/mv/projects` 写入规范化后的 id
- 新建项目默认 `band`

### 4. UI（`app/mv/page.tsx`）
- state：`promptTemplateId`，恢复项目时 `normalizeMvPromptTemplateId(data.promptTemplateId)`
- 工具栏：`<select>` 列出 `listMvPromptTemplates()` 的 label；旁注显示当前 version
- 所有原 `buildStandardBandMvPrompt(...)` 调用改为 `buildMvPromptForTemplate(promptTemplateId, ...)`
- `signatureFor` / 一键完整 MV signature 含 `templateId` + 对应 `version`（不再写死 band version）
- 切换模板：更新 state，并让 promptsReady 因 signature 变化变为 false（自然失效）
- `saveCurrentProject` body 带上 `promptTemplateId`

## 验收
- 单测覆盖 `normalizeMvPromptTemplateId` 与 API 列表形状；源码断言 UI/API 已接线
- `npm test` 全绿
- 无 RH 调用、无密钥、无大媒体
