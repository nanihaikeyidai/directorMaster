# MV 模板推荐设计（2026-11-07 nightly）

最终诉求：输入一首音乐 → 各类 MV。模板库已有 band / folk-solo / folk-duo / piano-ballad / rock-solo / dance-edm / rap-hiphop。本晚落地 **音乐信号 → 自动推荐提示词模板**（纯启发式，无 RH / 无 ML）。

## 交付
1. `recommendMvPromptTemplate(signals)`（`lib/mv-prompt.mjs` + `.d.ts`）
2. CLI `mv-recommend`（人类可读中文摘要 + `--json`）
3. 测试 `scripts/test-mv-template-recommend.mjs` 接入 `npm test`

## signals（全可选）
- `bpm` number
- `vocalDensity`：`sparse` | `medium` | `dense`，或音节/秒数字（`<2.5` sparse，`<4` medium，否则 dense）
- `energy`：`low` | `medium` | `high`
- `instruments` string[]（小写归一化匹配）
- `performers` number（1 或 2+）
- `hints` string（中英关键词）

## 返回
`{ templateId, label, version, confidence (0..1), reasons: string[], alternatives: [{templateId,label,confidence}]×≤2 }`  
`templateId` 必须是 `MV_PROMPT_TEMPLATES` 的键。空/未知信号 → `band`，低置信度 + 明确中文原因。

## 评分要点（确定性）
1. **hints 关键词优先硬加分**：说唱|rap|hip.?hop → rap-hiphop；edm|电子舞|club|disco → dance-edm；摇滚|rock|电吉他 → rock-solo；钢琴|piano|ballad → piano-ballad；民谣双人|duo|二人 → folk-duo；民谣|folk|木吉他|acoustic → folk-solo；乐队|band live → band
2. **信号组合**：bpm≥128 + high + synth → dance-edm；bpm≤90 + sparse + piano → piano-ballad；dense → 偏向 rap-hiphop；performers≥2 → folk-duo；electric-guitar + high → rock-solo；acoustic-guitar → folk-solo
3. 按分数排序；置信度 = 归一化到 0..1；alternatives 取次名最多 2 个

## 验收
- 空 → band 低置信；hints 说唱 → rap-hiphop；bpm130+synth+high → dance-edm；piano+sparse+bpm72 → piano-ballad；performers2+acoustic → folk-duo；dense+urban → rap-hiphop；electric-guitar+high → rock-solo；templateId 始终合法
- `npm test` 全绿；`mv-recommend --hints 说唱 --json` 输出完整对象
