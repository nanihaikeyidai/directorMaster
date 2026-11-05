# Rap-hiphop MV 提示词模板设计（2026-11-06 nightly）

最终诉求：输入一首音乐 → 各类 MV。已有 band / folk-solo / folk-duo / piano-ballad / rock-solo / dance-edm，本晚新增第七类 **rap-hiphop（说唱嘻哈 · 街头/舞台独唱）**。

## 交付
1. `buildRapHiphopMvPrompt` + `RAP_HIPHOP_MV_PROMPT_TEMPLATE_VERSION = "rap-hiphop-ref2va-v1"`（六段式，复用 dance-edm 的切镜/人声门控骨架，换说唱词汇）
2. 注册表追加 `rap-hiphop`（label：说唱嘻哈（街头/舞台））；UI picker / `mv-templates` / `mv-cut --template` 自动覆盖
3. `.d.ts`、CLI help、`npm test` 同步

## 验收标准
- `scripts/test-rap-hiphop-mv-prompt.mjs`：六段顺序；无人声段含 graffiti/street/turntable/neon 且不出现面部特写；人声段含歌词 `<d>`、面部特写、lip/mouth、dense/rapid/syllable、microphone；vocal_enters 第一镜不是面部特写；双人人设表与缺场景报错；注册表 7 个模板
- `npm test` 全绿；`node cli/director-master.mjs mv-templates` 列出 7 个
