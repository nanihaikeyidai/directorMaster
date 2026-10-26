# RunningHub 云端生成

在「项目与生成设置 → 生成位置」选择 RunningHub 云端。云端参数独立于本地 ComfyUI；无需启动 ComfyUI。默认使用 Plus 实例、8 步、0.6 MP（1056×608）、24 FPS，关闭二采。

从画布勾选 SEG 后点击生成。服务端检查图片/音频编号，上传所选素材，按回执文件名重建每段引用，并同步 timeline 与工作流输入。支持连续段，首段关闭前段连续性。

## 工作流目录

短剧与 MV 使用各自独立的工作流目录，提交请求必须带 `productType`：

| 产品 | 模板目录 | 默认模板 | 默认 RunningHub ID |
| --- | --- | --- | --- |
| 短剧 | `workspace/workflows/short-drama/cloud/` | `minimax_h3_director_api_920.json` | `2090979599860719618` |
| MV | `workspace/workflows/mv/cloud/` | `minimax_h3_multiref_pixel_fantasy_api.json` | `2087128116820013058` |

目录内可保存多个已验证模板。页面导入工作流时只允许写入当前产品目录，选择结果保存在浏览器本地设置中。

`vite-plugins/runninghub-workflow-adapters.ts` 按节点类型适配：

- 导演台 `MiniMaxH3Director`：时间线、分段提示词和参考媒体。
- 像素幻想 `MiniMaxH3ReferenceToVideo`：最多 9 张图片、3 条音频、提示词、采样与尺寸。
- 肥猴 Remix `FeiHouEasyH3RH`：12 个媒体槽、双采样和原音频开关。

云端提交前会把实际工作流写入任务目录的 `*.workflow.json`，用于核对节点、媒体文件名和最终提示词。片段按顺序串行提交，避免连续片段并发造成状态或额度混淆。

## 凭据与文件

密钥只由本机服务读取，优先级：`RUNNINGHUB_API_KEY` > Windows `RUNNINGHUB_DPAPI_FILE` > `%USERPROFILE%\.codex\secrets\runninghub-api-key.dpapi`；都没有时返回中文指引。项目根为 `DIRECTOR_MASTER_ROOT`，未设置则取启动 `npm run dev` 的目录（不再写死 `D:/`）。`/config` 返回 `keySource`（`env`/`dpapi`/`missing`，不含密钥）与 `root`。

像素幻想（`mv-reference`）与肥猴 Remix（`feihou-remix`）一次只吃一段：多段请求返回 HTTP 400 `RH_MULTI_SEGMENT_UNSUPPORTED`，不再静默只取第 1 段；请逐段提交。任务记录带 `updatedAt`、`segmentCount`，失败信息会脱敏。浏览器、任务记录、日志和 Git 中不得出现明文密钥。任务与实际提交工作流位于 `workspace/runninghub`，成片按任务 ID 分目录归档；该目录默认不提交到 Git。

CLI（需要先运行本地 Director Master 服务）：

```powershell
npm run director -- run --provider runninghub --spec project.json --steps 8 --megapixels 0.6 --watch
npm run director -- status --provider runninghub --id <本地任务ID>
```

主要 API：

- `GET /api/local/runninghub/config`：工作流目录、模板和本地配置状态。
- `GET /api/local/runninghub/account`：查询当前账户的 RunningHub 币、钱包余额和运行中任务数。
- `POST /api/local/runninghub/jobs`：提交 `{productType, workflowPath, workflowId, episode, segments, sequenceNos, settings}`。
- `GET /api/local/runninghub/jobs?id=<本地任务ID>`：查询并归档成片。
- `DELETE /api/local/runninghub/jobs?id=<本地任务ID>`：取消当前任务。

任务状态来自云端；百分比只表示上传、提交和完成阶段，不代表采样精确进度。刷新页面可恢复最近任务。显存不足时显示服务端原因，不自动改参数或付费重试；临时查询失败应查询同一任务，不要重新提交。

## 2026-09-06 验证记录

- 使用新接入的 HTTP 接口提交导出工作流第一段（8 秒接电话镜头），两张图片、一条参考音频，音频标签由原样例 Audio 3 对齐至 Audio 1。
- RunningHub 任务 `2096427108934049794` 成功；8 步、0.6 MP、二采关闭，消耗 33 RH 币。
- 自动归档至 `workspace/runninghub/a3c3f8c3-f8b2-4d4b-8e0b-4f06db04179c/RunningHub_2096427108934049794_0.mp4`；ffprobe 确认 1056×608、24 FPS、8 秒、含音轨。
- 实际提交快照与引用编号一致，主 timeline 与 r2v workspace 一致。空片段请求被拦截，不提交云端。
- 构建及本次新增/修改功能文件 lint 通过。仓库完整 tsc 检查仍有既存类型问题（fetch JSON 的 unknown 类型、目录类型等），未将其描述为通过。
- 当前接口随现有 `npm run dev` 本地服务运行，沿用项目 Vite local-runtime 机制；本次没有部署站点。
