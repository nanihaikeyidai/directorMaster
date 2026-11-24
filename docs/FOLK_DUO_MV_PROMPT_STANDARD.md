# Director Master 民谣双人 MV 提示词标准

模板版本：`folk-duo-ref2va-v3`

## 目标

把民谣双人（主唱口型 + 吉他手演奏）的人物、木吉他、场景与音轨描述转换为 MiniMax H3 Ref2VA 六段式提示词。网页与 CLI `mv-cut --template folk-duo` 共用 `buildFolkDuoMvPrompt`。

## 与独唱 / 乐队模板的差异

- 默认 ≥2 名成年表演者（主唱 + 吉他手）+ ≥1 场景；**允许**两张不同人物定妆，**禁止**「两个一样 / identical twin」复制体描述。
- 角色启发式：`主唱|singer|vocal|lead` → singer；`吉他|guitar` → guitarist；否则 `performers[0]=singer`、`[1]=guitarist`。
- **禁止在一句歌词中间切镜**；切点只落在乐句/呼吸/人声空白。
- **无人声**：只排场地远景或吉他手琴弦/手部，不对主唱脸。
- **有人声**：镜头完全固定（禁止推拉摇移、变焦和手持晃动），以主唱面部近景和半身特写合理搭配，跟 `<Audio 1>` 口型；唱词期间不用场地远景。吉他手手部或双人中景只作句间点缀。面部特写与半身弹唱的背景仍须保留参考场景的地点、光线与道具（可虚化），禁止改成室内灰幕舞台、舞台灯或棚拍黑底。
- 可用带时间轴的歌词，经 `planLyricPhraseSegments` / `mv-cut --lyrics` 按语句自动分段，并按有无人声选择上述镜头模板。详见 `docs/2026-11-22-folk-lyric-segments-and-locked-coverage.md`。

## CLI

```bash
npm run director -- mv-cut \
  --template folk-duo \
  --audio ./song.wav \
  --project FolkDuo01 \
  --cuts 11.0,20.0 \
  --notes ./segments.json \
  --people ./people \
  --scenes ./scenes \
  --asset-meta ./meta.json
```
