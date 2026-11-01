# Piano-ballad MV 提示词模板 + 模板注册表（2026-11-02）

## 背景
用户最终诉求：输入一首音乐 → 生成各类 MV。已有 `band` / `folk-solo` / `folk-duo`。本晚新增第四类 **piano-ballad（钢琴抒情独唱：歌手坐在钢琴前自弹自唱）**，并把 CLI 中散落的模板分支收敛为注册表，后续加曲风只需注册一项。

## 范围
1. `buildPianoBalladMvPrompt`（MiniMax H3 Ref2VA 六段式，与 folk-solo 同契约）
   - 资产：≥1 人物 + ≥1 场景；拒绝人设表/双人构图参考图
   - 无人声（instrumental / pre_vocal）：只用场地远景或钢琴手部/琴键/琴槌细节，**不对歌手脸**
   - 人声：优先歌手面部特写对口型；钢琴手部仅作句间点缀
   - vocal_enters：人声起点前只给远景/琴键，起点后切到脸部特写
   - 切镜只落在乐句/呼吸/人声空白，禁止句中切
   - 版本常量 `PIANO_BALLAD_MV_PROMPT_TEMPLATE_VERSION = "piano-ballad-ref2va-v1"`
2. 模板注册表 `MV_PROMPT_TEMPLATES`（id → { label, version, build }）、`listMvPromptTemplates()`、`buildMvPromptForTemplate(id, input)`；未知 id 抛错并列出可选项
3. CLI `mv-cut --template` 改走注册表（allowlist 自动包含 piano-ballad）

## 验收
- `scripts/test-piano-ballad-mv-prompt.mjs` 覆盖：六段顺序、无人声不对脸且含琴键/远景、人声含特写与歌词 `<d>`、vocal_enters 第一镜不是面部特写、人设表与缺场景报错、注册表包含 4 个模板且版本一致、未知模板报错
- `npm test` 全绿；既有 band/folk-solo/folk-duo 输出不变
- 无 RunningHub 调用、无密钥、无大媒体
