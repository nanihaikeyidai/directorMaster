# Design: 口型试片工作流默认 + 成片封装原曲

Date: 2026-11-13
Module: MV / 口型试片流程（工作流默认与参数、封装原曲）
Status: Approved for nightly automation（用户 2026-11-07 锁定流程优化 + 对口型；试片门禁与一致性包已落地，但工作流默认仍散落在 CLI 硬编码里，试片成片也没有可测试的「封装原曲」收口）

## Problem

`mv-lipsync-prep` 已能在提交 RunningHub 前拦住无人声段和远景参考，人物一致性包也会排序锁脸。缺口在后半段：

- 口型试片默认工作流只写在 CLI 字符串里（迅风幻影 `2089048490512052225`），`buildLipsyncTrialPlan` 在省略 `workflowId` 时留空；`mv-generate` 仍默认像素幻想 `2087128116820013058`。夜间试片容易选错工作流。
- 试片成片需要用原曲覆盖模型音轨后再评口型，但没有独立、可测试的 finalize 计划；容易把生成音轨当母带发出去。`muxOriginalAudio` 已存在，缺的是试片收口层。

## Goals

- 集中注册口型试片工作流（迅风幻影自动版为默认，像素幻想为备选），支持 id / 别名解析；非法 id 拒绝并列出可选项。
- `buildLipsyncTrialPlan` 在未传 `workflowId` 时填入默认迅风 id，并附带 `workflow` 元数据（id/name/label）。
- 纯函数 `planLipsyncFinalize`：在调用 ffmpeg 前规划「用原曲封装成片」。缺视频、缺原曲、或 `audioSource=generated` 时 `ok: false`；通过时给出 mux 参数，并附上 `checkMvCompose` 报告。
- CLI `mv-lipsync-finalize --video --audio [--start --end] [--out] [--workflow-id] [--dry-run] [--json]`。`--dry-run` 只打印计划；正式跑则调用已有 `muxOriginalAudio`（本地 ffmpeg，不提交 RH）。`!ok` 时 exit 1 且不跑 ffmpeg。
- 库内不跑 ffmpeg/ffprobe/RH。

## Non-goals (tonight)

- 不改 `mv-generate` / UI 的像素幻想生产默认（仓库成片默认仍以场景稳定为准）。
- 不在本模块提交 RunningHub 任务。
- 不做合成/导出的 UI 硬门禁（P0-4/P0-5 仍开放）。
- 不新增加曲风模板。

## API (`lib/mv-lipsync-finalize.mjs`)

```ts
export const DEFAULT_LIPSYNC_WORKFLOW_ID = '2089048490512052225'; // 迅风幻影自动版

type LipsyncWorkflow = {
  id: string;
  key: string;
  name: string;
  label: string;
  aliases: string[];
  isDefault?: boolean;
};

listLipsyncWorkflows(): LipsyncWorkflow[]

resolveLipsyncWorkflow(idOrAlias?: string): {
  ok: boolean;
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  isDefault?: boolean;
  custom?: boolean;
  reason: string;
}

planLipsyncFinalize(input: {
  videoPath?: string;
  videoPaths?: string[];
  audioPath?: string;
  audioSource?: 'original' | 'generated' | 'unknown';
  startSec?: number;
  endSec?: number;
  sourceAudioDuration?: number;
  videoDuration?: number;
  outPath?: string;
  workflowId?: string;
}): {
  ok: boolean;
  reason: string;
  workflow: ReturnType<typeof resolveLipsyncWorkflow>;
  compose: ComposeReport;
  mux: null | {
    videoPaths: string[];
    audioPath: string;
    outPath: string;
    audioSource: 'original';
    startSec?: number;
    endSec?: number;
  };
}
```

### Workflow registry

1. 迅风幻影自动版 `2089048490512052225`（默认；别名：`xunfeng` / `迅风` / `迅风幻影` / `迅风幻影自动版`）。口型优先的夜间试片默认。
2. 像素幻想 MiniMaxH3ReferenceToVideo `2087128116820013058`（别名：`pixel-fantasy` / `pixel` / `像素幻想`）。仓库 MV 云端默认模板，场景更稳，作为试片备选。

`resolveLipsyncWorkflow`：空值 → 默认迅风，`ok: true`。匹配 id 或别名（拉丁别名不区分大小写）→ 对应条目。否则若是 10–30 位数字 → `ok: true` 且 `custom: true`（允许临时工作流，不进注册表）。其他输入 → `ok: false`，中文理由列出已知选项。

### Finalize plan

- 视频取 `videoPaths`，若空则把 `videoPath` 收成单元素数组；仍空则失败，理由提及成片视频。
- 无 `audioPath` 则失败，理由提及原曲 / 封装。
- `audioSource === 'generated'` 即使有路径也失败，理由要求用原曲封装、不要保留生成音轨。
- 有路径且未标明 generated 时，按 `original` 交给 `checkMvCompose`（可带 start/end、时长）。
- `ok` 仅当工作流解析通过且 compose 报告 `ok`。
- 默认 `outPath`：第一段视频同目录、文件名为 `<stem>-original-audio.mp4`。
- 纯函数不访问文件系统、不调用 ffmpeg。

### Trial plan hook

`buildLipsyncTrialPlan`：未传或空白 `workflowId` 时用 `resolveLipsyncWorkflow()` 填默认；非法 id 则计划 `ok: false`。成功或失败都附带 `workflow` 对象；`workflowId` 为解析后的 id（失败时可保留原输入）。

## CLI

`mv-lipsync-finalize --video <file> --audio <file> [--start <sec>] [--end <sec>] [--out <file>] [--workflow-id ID|alias] [--dry-run] [--json]`

- 先 `planLipsyncFinalize`。`--json` 打印完整计划；否则中文摘要（是否通过、工作流名称与 id、封装路径、compose 摘要）。
- `!ok` → exit 1，不调用 ffmpeg。
- `--dry-run`：只打印计划。
- 正式模式：`muxOriginalAudio({ videoPaths, audioPath, outPath, segments, sourceAudioDuration })`，打印输出路径。缺文件在 mux 层报错。不消耗 RunningHub 币。

`mv-lipsync-prep` 的默认 `--workflow-id` 改为读取 `DEFAULT_LIPSYNC_WORKFLOW_ID`，不再在 CLI 里写死另一份数字。

## Acceptance

- 省略工作流 → 迅风 `2089048490512052225`；别名 `像素幻想` / `pixel-fantasy` → `2087128116820013058`；非法 id → `ok: false` 并列出可选项。
- `buildLipsyncTrialPlan` 不传 `workflowId` 时仍得到上述默认 id，并带 `workflow.name`。
- 缺视频 / 缺原曲 / `audioSource=generated` → `planLipsyncFinalize.ok === false` 且 `mux === null`。
- 成片 + 原曲路径 → `ok: true`，`mux.audioSource === 'original'`，默认输出名以 `-original-audio.mp4` 结尾，`compose.ok === true`。
- CLI `--dry-run --json` 在失败时 exit 1；help 列出 `mv-lipsync-finalize`。
- `npm test` 含新脚本；无密钥 / 无大媒体 / 无 RH 调用。

## Suggested next night

有人声源曲验证 15s 试片（prep → 默认工作流提交 → finalize 封装原曲）；或 open PR 合并卫生；或 P0-4/P0-5 的 UI 硬门禁。
