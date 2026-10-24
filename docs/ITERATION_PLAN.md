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

## 管理方式

- Superpowers 驱动迭代；见 docs/PROJECT_MANAGEMENT.md
