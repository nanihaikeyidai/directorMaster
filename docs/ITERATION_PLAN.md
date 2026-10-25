# 迭代计划

## V0.1 基础接线

- [x] 识别 MiniMaxH3Director UI/API 工作流
- [x] 当前 ComfyUI 端口发现，不启动新实例
- [x] 红绳素材与片段 8 测试数据核验

## V0.2 核心工作台

- [x] 暗色扁平化四页面信息架构
- [x] 无限网格时间线与分段审核器
- [x] 素材数量、选择、描述与自动索引
- [x] 六段式提示词与连续性/冲突审核

## V0.3 生成闭环

- [x] 本地文件桥、素材上传、API 工作流补丁
- [x] 队列、进度、节点错误和输出展示
- [x] Agent CLI 与示例项目规范

## V0.4 验收

- [x] lint/build/核心逻辑测试
- [ ] EP02 首采真实生成（旧二采测试已按用户要求中断）
- [ ] 使用文档和问题排查文档

## V0.5 双语字幕

- [x] V0：cue 归一化 + 双语 SRT/ASS 导出 + 离线 CLI（无 RH 调用）
- [x] V0：`detectSubtitleWorkflowKind` adapter 骨架（启发式，不提交云端）
- [ ] 接入 RunningHub Confucius4-R2T2 语音转录（参考帖 https://www.runninghub.cn/post/2104649076645130241）
- [ ] 成片 → ASR cues → 双语 SRT/ASS → 可选烧录
- [ ] 详见 docs/SUBTITLE_BILINGUAL_PLAN.md

## V0.6 产品迭代路线（2026-10-25 定稿 · MV 优先）

用户确认顺序：**Sprint 1 MV → Sprint 2 RunningHub 加固 → Sprint 3 字幕 V1**。

### Sprint 0 — 文档与基线

- [x] 合入字幕 V0 + Superpowers 文档（PR #3）；关闭重叠的 #1/#2
- [x] 本路线写入本文件与 `docs/superpowers/plans/`

### Sprint 1 — MV 生产正确性（审核+续跑+音画对齐 lib/CLI 已落地）

- [x] 分段审核状态：`pending` / `approved` / `submitted` / `failed`；批量与一键云端默认只提交 `approved`
- [x] 可恢复任务：段级 `jobId`、错误摘要、取消、失败重试、刷新后断点续跑
- [x] 音画对齐检查：`lib/mv-av-alignment.mjs` + CLI `mv-align-check`（导出前报告；UI 硬门禁仍可选）
- 实现计划：`docs/superpowers/plans/2026-10-25-mv-review-and-resume.md`、`docs/superpowers/plans/2026-10-26-mv-av-alignment.md`

### Sprint 2 — RunningHub 加固

- [ ] 非导演多段：禁止静默 `segments[0]`（显式 400 或按段串行）
- [ ] 可移植密钥/根目录（优先 `RUNNINGHUB_API_KEY`）
- [ ] 工作流选择可测 + 任务可观测 + `RUNNINGHUB.md` 对齐

### Sprint 3 — 双语字幕 V1

- [ ] RH Confucius4-R2T2 → `normalizeCues`；成片入口；可选 burn；cue 可编辑再导出

### 每晚轮转

阻塞主路径 bug 当夜修；否则按 Sprint 1→2→3 取下一块。结果汇报到本聊天。

## 管理方式

- Superpowers 驱动迭代；见 docs/PROJECT_MANAGEMENT.md
