# RunningHub 云端生成

在「项目与生成设置 → 生成位置」选择 RunningHub 云端。默认 LitePlus、8 步、0.6 MP（1056×608）、24 FPS，关闭二采。云端参数独立于本地 ComfyUI；无需启动 ComfyUI。

从画布勾选 SEG 后点击生成，素材引用节点、公共提示词和分镜提示词沿用现有编译规则。服务器检查图片/音频编号，上传所选素材，按回执文件名重建每段引用，并同步 timeline 与 r2v workspace。支持连续段，首段关闭前段连续性。

工作流模板：普通导演台使用 `workspace/workflows/runninghub-director-api.json`；MV 使用 `workspace/workflows/runninghub-mv-ref2v-api.json`，对应 RunningHub 工作流 `2087128116820013058`。MV 模板核心节点为 `MiniMaxH3ReferenceToVideo`，服务端会动态绑定最多 9 个图片引用槽、1 个主参考音频、提示词、分辨率和步数，并保留模板内的音频时长到帧数计算链。

MV 云端提交前会写入任务目录的 `*.workflow.json` 快照，可用于核对实际提交的节点类型、图片/音频文件名和最终提示词；任务仍按片段串行提交，避免连续片段并发造成素材或额度混淆。

密钥只由本机服务读取 RUNNINGHUB_API_KEY，或当前 Windows 用户的 DPAPI 文件。浏览器与任务记录不保存密钥。任务与实际提交工作流在 `workspace/runninghub`，成片按任务 ID 分目录归档。

CLI（运行本地 directorMaster 服务后）：

```sh
npm run director -- run --provider runninghub --spec project.json --steps 8 --megapixels 0.6 --watch
npm run director -- status --provider runninghub --id <本地任务ID>
```

API：GET `/api/local/runninghub/config` 查询配置；POST `/api/local/runninghub/jobs` 提交 `{segments, sequenceNos, settings:{steps,megapixels}}`；GET `/api/local/runninghub/jobs?id=<本地任务ID>` 查询并归档成片。任务状态是真实云端状态；百分比仅表示上传/提交/完成阶段，不代表采样精确进度。刷新页面可恢复最近任务。

后续排查：显存不足时显示 RunningHub 返回原因，不自动改参数或付费重试；查询暂时失败可重试同一任务，避免重复提交。

## 2026-09-06 验证记录

- 使用新接入的 HTTP 接口提交导出工作流第一段（8 秒接电话镜头），两张图片、一条参考音频，音频标签由原样例 Audio 3 对齐至 Audio 1。
- RunningHub 任务 `2096427108934049794` 成功；8 步、0.6 MP、二采关闭，消耗 33 RH 币。
- 自动归档至 `workspace/runninghub/a3c3f8c3-f8b2-4d4b-8e0b-4f06db04179c/RunningHub_2096427108934049794_0.mp4`；ffprobe 确认 1056×608、24 FPS、8 秒、含音轨。
- 实际提交快照与引用编号一致，主 timeline 与 r2v workspace 一致。空片段请求被拦截，不提交云端。
- 构建及本次新增/修改功能文件 lint 通过。仓库完整 tsc 检查仍有既存类型问题（fetch JSON 的 unknown 类型、目录类型等），未将其描述为通过。
- 当前接口随现有 `npm run dev` 本地服务运行，沿用项目 Vite local-runtime 机制；本次没有部署站点。
