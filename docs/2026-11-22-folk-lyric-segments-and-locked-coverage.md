# 2026-11-22 民谣模板与按歌词语句分段

日期：2026-11-22（Asia/Shanghai）  
分支：`feature/mv-folk-singing-coverage`（base：`feature/mv-rh-cost-calibrate`）

## 为什么改

口型试片证明对口型已经能对上，但唱歌时镜头会晃、构图偏中景。用户要求：

- 人物唱歌时镜头固定，不要晃动
- 多增加人脸近景特写，同时合理搭配景别（不要一味怼脸）
- 没有唱歌词时可以用远景
- 工具能根据歌曲划分好语句，再根据语句选择合适镜头模板

## 改了什么

### 1. 民谣提示词模板（folk-solo / folk-duo）升级到 v2

版本：

- `folk-solo-ref2va-v2`
- `folk-duo-ref2va-v2`

有人声（正在唱歌词）时：

- 镜头完全锁定在三脚架上，整镜不能推、拉、摇、移、变焦或手持晃动，只允许表演者动
- 优先使用「歌手/主唱面部特写」和「半身弹唱特写」的合理搭配，保证口型可读
- 唱词期间不再排「场地远景」

无人声（前奏、间奏、句间长空档）时：

- 只排场地远景或琴弦/演奏镜头，不对歌手脸

若分段笔记里带有 `phraseEndsSec`（相对本段起点的句尾秒数），切镜会尽量落在这些句界上，而不是按固定比例硬切。

### 2. 按歌词语句自动分段

新增 `lib/mv-lyric-segments.mjs`：

- `planLyricPhraseSegments({ lyrics, durationSec })`：根据带时间轴的歌词句子划分生成段
- 相邻短间隙的唱词句会打包进同一段，单段不超过 15 秒，且不会从一句歌词中间切开
- 句与句之间、歌头歌尾里 ≥ 2 秒的无人声空档，单独分成远景段
- 每段自动带上 `kind`、`lyrics`、`shotType`（唱词=`lead`，无人声=`wide`）、`coverage` 和对应导演说明
- `notesFromLyricSegments(points, lyrics)`：已有切点时，按与歌词句的重叠情况回填笔记

### 3. CLI

`mv-cut` 现在可以不手动给 `--cuts`：

```bash
npm run director -- mv-cut \
  --audio ./song.wav \
  --project CamillaBeachFolkSolo \
  --template folk-solo \
  --lyrics ./cues.json \
  --people ./people \
  --scenes ./scenes
```

行为：

- 省略 `--cuts` 且提供 `--lyrics`：按语句自动分段，并按有无人声选择近景/远景模板
- 提供了 `--cuts` 但没给 `--notes`、同时有 `--lyrics`：按各段与歌词句的重叠回填 `kind` / 歌词 / 镜头类型
- 仍可用 `--notes` 覆盖自动结果
- 既有「切点必须落在句界」的门禁不变

歌词 JSON 示例（也可用 `{ "cues": [...] }`）：

```json
{
  "lyrics": [
    { "startSec": 2.0, "endSec": 6.0, "text": "第一句" },
    { "startSec": 10.0, "endSec": 14.0, "text": "第二句" }
  ]
}
```

## 怎么验收

```bash
npm test
```

相关测试：`scripts/test-folk-mv-prompt.mjs`、`scripts/test-folk-duo-mv-prompt.mjs`、`scripts/test-mv-lyric-segments.mjs`、`scripts/test-mv-cut-apply.mjs`。

## 还没做的

- MV 页面尚未提供「导入歌词时间轴 → 一键按语句分段」的按钮；页面后续可直接调用同一个 `planLyricPhraseSegments`
- 其他曲风模板（钢琴、摇滚、电音、说唱）尚未改到同样的「唱词锁机位 + 近脸」规则
- 单句歌词超过 15 秒时会拒绝自动分段，需要先把时间轴拆成不超过 15 秒的句子
