# Director Master 民谣独唱 MV 提示词标准

模板版本：`folk-solo-ref2va-v4`

## 目标

把单人民谣弹唱的人物、木吉他、场景与音轨描述转换为 MiniMax H3 Ref2VA 六段式提示词。网页与 CLI `mv-cut --template folk-solo` 共用 `buildFolkSoloMvPrompt`。

## 与乐队模板的差异

- 默认 1 名成年独唱者 + 木吉他 + 场景；禁止双人构图人设表。
- **禁止在一句歌词中间切镜**；切点只落在乐句/呼吸/人声空白。
- **无人声**：只排场地远景或琴弦/演奏镜头，不对歌手脸。
- **有人声**：镜头完全固定（禁止推拉摇移、变焦和手持晃动），以歌手面部近景和半身弹唱特写合理搭配，跟 `<Audio 1>` 口型；唱词期间不用场地远景。面部特写与半身弹唱的背景仍须保留参考场景的地点、光线与道具（可虚化），禁止改成室内灰幕舞台、舞台灯或棚拍黑底。参考图中没有的麦克风、话筒支架、吊杆或其他话筒器材不要生成；只保留参考中已有的道具（如木吉他）。
- 可用带时间轴的歌词，经 `planLyricPhraseSegments` / `mv-cut --lyrics` 按语句自动分段，并按有无人声选择上述镜头模板。详见 `docs/2026-11-22-folk-lyric-segments-and-locked-coverage.md`。

## CLI

```bash
npm run director -- mv-cut \
  --template folk-solo \
  --audio ./song.wav \
  --project FolkSolo01 \
  --cuts 11.0,20.0 \
  --notes ./segments.json \
  --people ./people \
  --scenes ./scenes \
  --asset-meta ./meta.json
```
