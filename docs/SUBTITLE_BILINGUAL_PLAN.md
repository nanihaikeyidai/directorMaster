# 双语字幕功能规划

状态：规划中（尚未实现）  
提出日期：2026-10-24  
参考工作流：[Confucius4-R2T2 语音转录（RunningHub）](https://www.runninghub.cn/post/2104649076645130241)（post / 候选 workflowId：`2104649076645130241`）  
模型背景：网易有道 [Confucius4-R2T2](https://huggingface.co/netease-youdao/Confucius4-R2T2) —— 低延迟流式 ASR，中英优化，可输出稳定文本；RH 帖用于云端反推/跑通，不必本机部署大模型。

## 目标

对成片（导演台 / MV 云端生成结果，或用户导入视频）自动：

1. 解析人声（ASR）
2. 生成带时间轴的字幕
3. 产出双语字幕（默认：原语种 + 另一语种，常见中英）
4. 导出软字幕（SRT/ASS）与可选烧录版视频

用户只点「配字幕」；工具负责上传、调 RunningHub、对齐时间轴、翻译与导出。

## 与现有产品的关系

| 现有能力 | 字幕功能如何接上 |
|---|---|
| RunningHub 任务桥 `vite-plugins/runninghub.ts` | 新增 adapter kind：`asr-r2t2`（或 `subtitle`），复用 upload / create / poll / archive |
| 成片轨道 / `workspace/runninghub/<jobId>/` | 字幕任务输入默认选最近成片；输出归档到同目录或 `workspace/subtitles/<jobId>/` |
| `app/voice` 音色克隆页 | 字幕是独立后处理，不混进 IndexTTS；可在任务中心并列展示 |
| 提示词助手 | 不负责 ASR；若对白已在 segment.shotPrompt 中，可作热词/上下文提示喂给 R2T2 |

## 推荐流水线（V1）

```
视频成片
  →（可选）ffmpeg 抽音轨 wav 16k mono，减小上传
  → RunningHub：Confucius4-R2T2 工作流（反推自帖 2104649076645130241）
  → 归一化为 cue 列表：{ startMs, endMs, text }
  → 翻译层：原语 → 第二语（本地 LLM / 已有 Agent / 轻量 API，V1 可先规则+人工校对入口）
  → 写出 bilingual.srt / .ass（上原语、下译语）
  →（可选）ffmpeg burn-in → *.subtitled.mp4
```

### RunningHub 接入要点

- 密钥与现有一致：`RUNNINGHUB_API_KEY`（勿入库）。
- 首次实机前：从帖页导出/保存 API 工作流 JSON 到 `workspace/workflows/subtitle/cloud/`，并在设置里可改 `workflowId`（默认候选 `2104649076645130241`，以账号侧实际 ID 为准）。
- Adapter：识别主节点类型后绑定「视频或音频输入」「语言」「是否时间戳」等槽位；输出解析文本或带时间戳的 JSON/文本文件。
- 若 RH 工作流只出纯文本无时间戳：V1 用均分/能量切分作弱对齐，并在 UI 标「需人工校对」；V1.1 再换带时间戳节点或本地强制对齐。

### 双语策略

- 默认：`sourceLang=auto`，`targetLang=en`（片源为中）或 `zh`（片源为英）。
- 输出格式：ASS 双行（主字幕大、译文字号略小）+ 同步 SRT 两套（`*.zh.srt` / `*.en.srt`）便于剪辑软件。
- 人工校对：任务结果页可编辑 cue 再重新导出，不重跑 ASR。

## UI 草图（V1）

- 入口：成片车厢右键 / 任务中心「配字幕」；设置页「字幕」：workflowId、语言对、是否烧录。
- 任务阶段：上传 → 转录中 → 翻译中 → 可预览 → 导出。
- 预览：简易时间轴 + 双行字幕列表，可改文案与起止。

## CLI（与现有 director CLI 对齐）

```sh
npm run director -- subtitle --video path/to/clip.mp4 --provider runninghub --watch
npm run director -- subtitle --job <runninghub-local-job-id> --langs zh,en --burn
```

## 验收标准

1. 给定一段含人声的 8–15s 成片，一键得到可播放的软字幕文件，双语行时间轴不严重错位（肉眼可跟口型 ±0.5s 内，或明确标需校对）。
2. 密钥未配置时只提示，不提交云端。
3. 产物落在工作区可复现路径；任务记录可刷新恢复。
4. 不把 RH 密钥、原始上传缓存提交进 git。

## 分期

| 版本 | 内容 |
|---|---|
| V0 契约 | 导出 RH API 工作流 JSON；adapter 骨架；文档与设置项 |
| V1 MVP | 云端 ASR → cue → 双语 SRT/ASS → 可选 burn-in；成片入口 |
| V1.1 | 时间戳强化、热词（角色名/对白）、批量整集 |
| V2 | 说话人分离、样式模板、与 MV 音画时间线联动 |

## 风险与依赖

- RH 帖工作流节点/输出格式需实机反推后固化；文档中的 workflowId 可能随作者更新而变。
- 无时间戳时对齐质量差 → 必须有人工校对入口。
- 翻译质量影响观感 → V1 允许只导出单语 ASR，双语作可选开关。
- 需用户提供可用的 `RUNNINGHUB_API_KEY` 才能冒烟。

## 实现时优先改动文件（预估）

- `docs/SUBTITLE_BILINGUAL_PLAN.md`（本文）
- `docs/ITERATION_PLAN.md` / `docs/RUNNINGHUB.md` 增补字幕条目
- `vite-plugins/runninghub-workflow-adapters.ts` + `runninghub.ts`
- `app/` 成片/任务中心入口；可选 `app/subtitle/page.tsx`
- `cli/director-master.mjs` 子命令 `subtitle`
- `workspace/workflows/subtitle/cloud/*.json`（实机导出后入库，勿含密钥）
