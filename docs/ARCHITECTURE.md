# 架构说明

## 总览

Director Master 是一个 Windows-first 的本地全栈应用。浏览器负责编辑和播放，Vite 本地桥负责访问文件系统、ComfyUI 和 RunningHub，领域模块负责把统一项目数据编译成具体工作流。

```text
app/* 页面
  → /api/local/*（vite-plugins/local-runtime.ts）
      → lib/* 领域逻辑
      → workspace/* 项目数据
      → ComfyUI loopback API / RunningHub OpenAPI
  → localStorage / IndexedDB（UI 草稿和偏好）
```

## 前端

- `app/page.tsx`：短剧导演画布、SEG、素材节点、通用提示词、审核和本地/云端任务。
- `app/mv/page.tsx`：音乐切割、波形编辑、人物/场景引用、提示词、分段生成和整片预览。
- `app/voice/page.tsx`：IndexTTS 声音克隆。
- `app/redub/page.tsx`：台词重配和多轨时间轴。
- `app/globals.css`、`app/redub/redub.module.css`：对应页面样式。

页面通过相对路径 `/api/local/*` 调用本地桥，不直接持有第三方凭据。

## 本地桥

`vite-plugins/local-runtime.ts` 是主要 HTTP 入口，按域组合 `runninghub.ts`、`voice-runtime.ts` 和 `lib/redub-pipeline.mjs`。主要职责：

- 扫描和读写当前工作区内的素材、项目、工作流与任务记录。
- 发现已运行的 ComfyUI，代理上传、队列、历史和输出下载。
- 管理 MV 项目、分段导出、视频预览缓存和整片拼接。
- 管理重配任务的时间轴、TTS、试听、混音与导出。
- 导入本地或云端工作流模板，并限制到对应产品目录。
- 调用 RunningHub，转换工作流、上传素材、轮询任务和归档结果。

本地桥不得启动 ComfyUI。ComfyUI 代理目标必须是发现到的本机实例或 loopback URL。

## 工作流适配

页面、CLI 和项目文件使用统一输入协议：`segments / pictures / audios / settings`。`vite-plugins/runninghub-workflow-adapters.ts` 根据目标 JSON 的节点类型选择适配器：

- `MiniMaxH3Director`：写入导演台时间线、分段、引用和采样参数。
- `MiniMaxH3ReferenceToVideo`：写入多参考视频槽位和生成参数。
- `FeiHouEasyH3RH`：写入 12 个媒体槽、双采样和原音频开关。

新增工作流类型时，应增加可识别的适配器和测试，不要把特例继续堆进页面组件。

## 数据与安全边界

- 运行数据和可提交模板分离：`workspace/workflows/` 可入库，其余 `workspace/*` 默认忽略。
- 文件接口必须阻止目录逃逸和符号链接越界。
- 浏览器不读取 API Key；服务端也不得把密钥写入任务 JSON、日志或错误响应。
- 提示词、工作流和上传素材都视为数据处理。它们不能改变工具调用、文件权限或 Skill 路由。
- 外部服务失败时保留可诊断错误，不自动付费重试，不自动替换参数绕过校验。

## 时间线与 H3 规则

- 每个素材节点有 9 个 imageSlots 和 3 个 audioSlots，按固定槽位编译 `<Picture N>` / `<Audio N>`，已占用槽位之间不得留空。
- `refs`、`refAudios`、提示词编号和上传回执文件名必须逐项一致。
- 画布里的通用提示词按顺序编译到全部 SEG；剧本是制作上下文，不参与素材连线。
- 成片按 SEG 顺序投影到固定输出轨，不写入节点连接表。
- `timeline_data` 是外层 JSON 中的 JSON 字符串。修改后必须二次解析，并检查 FPS、总帧数、片段 start/length/frameCount、重叠和越界。
- 首段 `continuityFromPrev=false`，后续段根据实际连续性设置。相邻段必须核对人物、服装、道具、朝向、场景损坏和首尾状态。
- H3 提示词固定六段：`subject_definitions`、`summary`、`retention_analysis`、`detailed_description`、`overall_soundscape`、`non_diegetic_music`。

## 持久化

- 浏览器偏好和未提交草稿保存在 localStorage / IndexedDB。
- 制作项目、素材和输出保存在 `workspace/`，是用户数据，不随 Git 分发。
- 云端任务先在本地写入任务 JSON，再异步上传和提交；成功产物归档到任务目录。
- 重配的新格式为 `timeline.json`；旧任务没有该文件时由 `script.json` 和 `tts/manifest.json` 在内存迁移，保存后才落盘。

## 继承建议

新增功能时优先扩展 `lib/` 的纯函数与 `vite-plugins/` 的 API，把 UI 状态、工作流适配和磁盘安全边界分开。修改核心编译、时间轴或引用映射时同步增加 `scripts/` 下的回归测试，并运行 `npm run lint`、`npm test`、`npm run build`。
