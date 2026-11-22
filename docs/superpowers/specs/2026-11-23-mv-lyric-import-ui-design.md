# Design: MV 页导入歌词并按语句分段

Date: 2026-11-23
Module: MV / 切镜流程 — 把已有 planLyricPhraseSegments 接到 MV 页，提供「导入歌词一键分段」
Status: Approved for nightly automation（2026-11-22 笔记已点名该缺口；CLI mv-cut --lyrics 已能自动分段，页面仍只有能量建议切点）

## Problem

1. lib/mv-lyric-segments.mjs 与 mv-cut 已能按歌词时间轴自动分段，并给唱词段近景 / 无人声段远景笔记（含 phraseEndsSec，供民谣 v2 锁机位模板在句界切镜）。MV 页是日常主路径，目前只有「智能建议切点」（按低能量停顿），不能导入歌词 JSON，也不会写入这些笔记。
2. 若把分段库直接抄进页面，容易漏掉 trim 选区偏移，或把 node: 依赖带进浏览器。应做薄的浏览器安全封装，复用已有 planner。

## Goals

- 新增浏览器安全库 lib/mv-lyric-import-ui.mjs（+ d.ts），无 node:，只组合 parseLyricCues / planLyricPhraseSegments：
  - parseLyricImportText(text)：空文本或非法 JSON 返回 ok:false 与中文 reason；成功则给出可交给 planner 的 lyrics 对象。只接受 JSON（与 CLI 相同的 { lyrics: [...] } / { cues: [...] } / 数组），不做 LRC。
  - planMvLyricImportUi({ lyrics, durationSec, rangeStart?, rangeEnd?, maxSegmentSec?, minInstrumentalSec? })：
    - 无有效时长 → ok:false，reason 含「请先导入音乐」。
    - 有 trim 选区时，把歌词时间轴平移到选区内再规划，返回的 cuts 为音轨绝对时间。
    - 成功时 cuts / notes 与 planner 一致：notes 含 kind、lyrics、shotType（唱词 lead，无人声 wide）、coverage、direction、phraseEndsSec。
    - 失败时 cuts / notes 为空，reason 沿用 planner 中文说明（无时间轴、单句超过 15 秒等）。
- 页面接入：
  - 波形工具栏「智能建议切点」旁增加「导入歌词并按语句分段」，隐藏 accept=".json,application/json" 文件选择。
  - 解析失败或规划失败只 setNotice(reason)，不改切点或笔记。
  - 成功则走与「智能建议切点」相同的撤销快照，替换切点与笔记，清空已生成提示词/成片状态，notice 复用 plan.reason 并提示唱词近景、无人声远景。
  - SegmentNote 增加可选 coverage 与 phraseEndsSec，导入与项目恢复时保留，以便 buildMvPromptForTemplate（尤其 folk v2）按句界切镜。
- 不加跳过门禁；不改 CLI；不在本夜扩展 LRC / 其它曲风锁机位。

## Non-goals (tonight)

- 不做歌词编辑器，不接云端 ASR。
- 不合并已打开的 PR 栈；不调用需要机主批准的 createPullRequest。
- 代码改动本身不调 RunningHub 付费 API。口型试片按例程另跑，最多 1 次成功 + 1 次技术重试。

## Verification

- 先写失败测试 scripts/test-mv-lyric-import-ui.mjs，再写实现。
- 验收见测试：空时长 / 非法 JSON / 无时间轴失败；2–6s 与 10–14s 两句（16s 曲、≥2s 空档）切点与笔记；trim 30–46 时切点平移到绝对时间；单句超过 15s 失败且 cuts 为空；库无 node:；页面 import、按钮、文件选择、SegmentNote 保留 phraseEndsSec。
- npm test 全绿；无密钥、无大媒体。
