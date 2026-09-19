# Director Master 标准出品流程

## 1. 工作区边界

权威工作区为 `D:\HermesWorkspace\directorMaster`。剧本、素材、工作流快照、Skill 任务包、审核记录和输出不得写到工作区之外。

| 内容 | 路径 |
|---|---|
| 权威剧本 | `workspace/screenplays/EP02_雨幕余温.md` |
| screenwriter 优化草稿 | `workspace/screenplays/drafts/EP02_雨幕余温_screenwriter_draft.md` |
| 剧本历史版本 | `workspace/screenplays/history/` |
| 素材库 | `workspace/assets/` |
| Director 工作流 | `workspace/workflows/` |
| Agent 任务包 | `workspace/skill-jobs/` |
| 剧本输出 | `workspace/outputs/screenwriter/` |
| 分镜与提示词输出 | `workspace/outputs/shotlist-builder/` |

## 2. 强制流水线

### Gate A — `$screenwriter`

1. 读取权威剧本和人物/世界设定。
2. 只处理剧本因果、人物弧线、对白、节奏、时长和用户指定的点改。
3. 优化结果写入草稿，不覆盖权威剧本。
4. 用户在 AI 协作页审核草稿，可继续编辑或退回修改。

### Gate B — 用户审核

1. 用户点击“批准并覆盖权威剧本”。
2. 系统先把旧权威剧本备份到 `history/`。
3. 审核稿覆盖权威剧本，并记录 SHA-256 与批准时间。
4. 权威剧本发生任何后续变化，批准状态立即失效。

### Gate C — `$shotlist-builder`

1. 未通过 Gate B 时禁止创建 shotlist 任务。
2. 用户明确确认平台为 `MiniMax H3`，满足 Phase 0。
3. 从批准的权威剧本建立 source beats、片段单元、空间阻挡、素材角色、VOICE_BIBLE、连续性台账和校准片段。
4. 先完成一个校准单元并审核，再扩展剩余片段。
5. 最终产出双语 HTML 提示词并运行 Skill 自带 lint 与回归测试。

### Gate D — Director Master 引用校验

提交 ComfyUI 前必须保证：

- `<Picture N>` 与 `refs[index=N-1]` 文件名逐项一致；
- `<Audio N>` 与 `refAudios[index=N-1]` 文件名逐项一致；
- 索引连续、无重复、无越界；
- 每个引用文件位于当前工作区并且上传成功；
- 上传回执中的最终文件名与 Director `timeline_data` 一致；
- 每段 `timeline_data` 与对应 `batchWorkspaces` 镜像一致；
- 编译后重新解析内外层 JSON，通过后才允许排队。

## 3. 片段04校准出片

片段04是本轮校准单元。测试顺序：

1. 用户批准 screenwriter 优化稿。
2. 在 AI 协作页确认 MiniMax H3。
3. `$shotlist-builder` 只处理片段04，锁定人物、场景、声音和首帧角色。
4. 用户审核片段04的 blocking、素材映射和最终提示词。
5. Director Master 执行引用校验并复用当前运行中的 ComfyUI。
6. 使用当前默认参数：0.6 MP、1056×608、24 FPS、4 steps、Euler + Simple，不执行二采放大。
7. 生成完成后检查身份稳定、对白归属、首尾状态、画面连续性、声音与片段时长。

任何 Gate 未通过时，系统只允许保存草稿或任务包，不允许提交视频生成。

