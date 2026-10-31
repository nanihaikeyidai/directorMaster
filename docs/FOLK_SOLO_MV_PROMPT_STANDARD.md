# Director Master 民谣独唱 MV 提示词标准

模板版本：`folk-solo-ref2va-v1`

## 目标

把单人民谣弹唱的人物、木吉他、场景与音轨描述转换为 MiniMax H3 Ref2VA 六段式提示词。网页与 CLI `mv-cut --template folk-solo` 共用 `buildFolkSoloMvPrompt`。

## 与乐队模板的差异

- 默认 1 名成年独唱者 + 木吉他 + 场景；禁止双人构图人设表。
- **禁止在一句歌词中间切镜**；切点只落在乐句/呼吸/人声空白。
- **无人声**：只排场地远景或琴弦/演奏镜头，不对歌手脸。
- **有人声**：优先歌手面部/半身特写以跟 `<Audio 1>` 口型。

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
