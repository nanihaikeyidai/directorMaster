# 项目管理（Superpowers + 三模块）

## 模块

1. **视频生成** — 导演台 / 剧集成片，RunningHub 云端
2. **MV** — MV 工作室与云端工作流
3. **视频后期配字幕** — ASR（Confucius4-R2T2 / RH 帖）→ 双语字幕，见 `SUBTITLE_BILINGUAL_PLAN.md`

## 方法

迭代遵循 Cursor 插件 **Superpowers**：brainstorming → writing-plans → TDD / subagent-driven-development → verification-before-completion → finishing-a-development-branch（commit / PR）。

每晚 0:00（Asia/Shanghai）由 directorMaster 定时任务按缺口在三模块中选一块（或跨模块修阻塞）实现、提交并汇报。

## 相关文档

- `ITERATION_PLAN.md`
- `RUNNINGHUB.md`
- `SUBTITLE_BILINGUAL_PLAN.md`
- `PRODUCTION_WORKFLOW.md`

## 定稿优先级（2026-10-25）

1. MV（审核状态 + 可恢复任务）
2. RunningHub 加固
3. 字幕 V1

详见 `ITERATION_PLAN.md` V0.6。
