# Design: 民谣独唱 MV 提示词模板 + CLI（Approach A）

Date: 2026-10-31  
Module: MV / folk-solo template + AI-callable CLI  
Status: Approved (user locked Approach A; Camilla beach rerun after implement)

## Problem

Camilla 海边试片只借用了 directorMaster 的 RH 工作流 ID，提示词是手写 H3，未走 `lib/mv-prompt.mjs` 标准模板。结果：间奏仍张嘴、双人定妆图复制出两个卡米拉、口型与切镜不合理。终局诉求是「一首音乐 → 可选多类 MV 模板出片」；V1 先做民谣独唱。

## Goals

- 在 `lib/mv-prompt.mjs` 增加 `buildFolkSoloMvPrompt` + `FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION`，与乐队模板共用六段式、`getSegmentVocalTiming`、Picture/Subject 编号。
- CLI：`mv-cut --template folk-solo|band`；`mv-generate --project [--watch]`（RH 提交，密钥门禁）；本地拼接 + 原音频封装 + `mv-align-check`。
- 网页与 CLI 共用同一 folk-solo 函数（后续 UI 接线可跟进；V1 以 CLI/库为准）。
- 切镜规则（硬约束写入提示词）：
  - **禁止在一句歌词中间切镜**；切点只落在乐句/句尾/呼吸/人声空白。
  - **无人声（instrumental / pre_vocal）**：只排场地远景或琴弦/演奏镜头，**不对着歌手脸**。
  - **有人声（vocal_active / vocal_enters）**：优先歌手特写（脸/口型跟 `<Audio 1>`）。
- folk-solo **禁止双人构图人设表**作参考（单人单镜）；提示词强制 single performer、禁止复制人物。
- Nightly：持续扩模板库（folk-solo → folk-duo → 其他曲风）；本设计只交付 folk-solo V1。

## Non-goals (V1)

- folk-duo 完整实现（仅预留模板名/backlog）。
- 自动歌词 ASR 对齐切句（可选手动 `--cuts` + notes；能量谷启发式可选）。
- 改乐队模板语义；band 默认行为不变。
- 合并 PR / 改 nightly routine（由父代理 UpdateRoutine；本交付给文案建议）。

## Template behavior

| Vocal mode | Shot vocabulary | Mouth |
| --- | --- | --- |
| instrumental | wide venue / guitar-hands / instrument detail only | closed; never face CU |
| pre_vocal | same as instrumental (+ optional distant silhouette without face CU) | closed |
| vocal_enters | closed until audible onset; then face CU | gate by Audio 1 |
| vocal_active | prefer singer face/upper-body CU; hands/wide as accents | lip-sync Audio 1 |

Output order unchanged: `subject_definitions` → `summary` → `retention_analysis` → `detailed_description` → `overall_soundscape` → `non_diegetic_music`.

Default cast: 1 adult soloist + acoustic guitar + 1 scene. Require ≥1 人物 + ≥1 场景. Reject performer descriptions matching dual character-sheet patterns.

## CLI / data flow

```
音频 → mv-cut(--template folk-solo|band) → 分段 wav + project.json(prompts)
     →（可选审核）→ mv-generate [--dry-run|--watch] → 分片 mp4
     → 本地 concat + mux 原曲 → mv-align-check
```

- `DIRECTOR_MASTER_ROOT` 或仓库根解析工作区（Linux/Windows 可移植）。
- `mv-generate`：读 `workspace/mv/<id>/project.json`；无 `RUNNINGHUB_API_KEY` 报错；默认 dry-run 写计划；`--watch` 调 RH 工作流 `2087128116820013058`（可覆盖）。
- 成片：视频段按序拼接，音轨用项目 `sourcePath` 原音频整段封装（不改速）。

## Testing

- `scripts/test-folk-mv-prompt.mjs`（或扩 `test-mv-prompt.mjs`）：六段式；instrumental 无 face CU 语言；vocal 含 close-up/lip；含「不在句中切」规则文案；导出版本常量。
- `npm test` 全绿。

## Camilla validation (post-implement)

- 素材：Still B + C only（不用双人 A）。
- 音频：`camilla-30s.mp3`；`vocalStartSec≈7`；切点尽量落在句界/能量谷。
- 经新 CLI/模板生成提示词再 RH 出片，交付路径与币耗。

## Nightly suggestion (for parent UpdateRoutine)

每轮至少推进或新增一类 MV 提示词模板（folk-solo 之后 folk-duo / 其他曲风），提交并汇报；禁止绕过 `lib/mv-prompt.mjs` 手写生产提示词。
