# Design: 民谣双人 MV 提示词模板（folk-duo · Approach A）

Date: 2026-11-01  
Module: MV / folk-duo template + CLI  
Status: Approved by standing order (user 2026-10-31: 方案 A；folk-solo 后 folk-duo；参考 BV1dsxM6EEKn 吉他手+主唱)

## Problem

终局诉求「一首音乐 → 各类 MV」。folk-solo 已落地；下一类是民谣双人：吉他手演奏 + 主唱，共用 `lib/mv-prompt.mjs` 与 CLI，禁止手写生产提示词。

## Goals

- 新增 `buildFolkDuoMvPrompt` + `FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION`（`folk-duo-ref2va-v1`）。
- 复用六段式契约与 `getSegmentVocalTiming`。
- CLI：`mv-cut --template folk-duo`（与 band / folk-solo 并列）；`mv-generate` 不改语义。
- 切镜硬约束与 folk-solo 相同：句中不切；无人声不对主唱脸；人声优先主唱脸/口型。
- 双人角色：主唱（口型）+ 吉他手（演奏）；禁止把两人做成同一张脸的复制体。

## Non-goals

- 自动歌词 ASR；UI 模板下拉（可后续）；付费 RH 实拍；合入 folk-solo PR。

## Cast & assets

- 需要 ≥2 张「人物」+ ≥1 张「场景」。
- 角色启发式（description/name）：`主唱|singer|vocal|lead` → singer；`吉他|guitar` → guitarist；否则 `performers[0]=singer`、`performers[1]=guitarist`。
- 禁止「两个一样的人 / two identical copies」类描述；**允许**两张不同人物定妆（与 folk-solo 禁双人表不同）。

## Vocal → shot vocabulary

| Mode | Coverage |
| --- | --- |
| instrumental / pre_vocal | 场地远景，或吉他手琴弦/手部；不对主唱脸 |
| vocal_enters | 人声前同 instrumental；onset 后优先主唱脸 CU |
| vocal_active | 优先主唱脸/半身口型；吉他手手部或双人中景作句间点缀 |

## CLI

`--template` 支持 `band|folk-solo|folk-duo`。

## Testing

`scripts/test-folk-duo-mv-prompt.mjs`：六段式；instrumental 无主唱脸 CU；vocal 含主唱 lip/close-up 与两名 Subject；缺人物/场景 throw；版本常量。接入 `npm test`。

## Acceptance

1. `buildFolkDuoMvPrompt` 导出且 CLI `--template folk-duo` 写入 project.json。
2. `npm test` 全绿；既有 folk-solo/band 行为不变。
3. 设计/计划/ITERATION_NOTES 更新；PR 不含密钥与大生成物。
