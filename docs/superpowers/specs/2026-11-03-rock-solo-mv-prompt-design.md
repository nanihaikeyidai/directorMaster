# Rock-solo MV 提示词模板（2026-11-03）

## 背景
用户最终诉求：输入一首音乐 → 生成各类 MV。已有 `band` / `folk-solo` / `folk-duo` / `piano-ballad`。本晚新增第五类 **rock-solo（摇滚独唱：单人电吉他舞台弹唱）**，挂进既有 `MV_PROMPT_TEMPLATES` 注册表，CLI `mv-cut --template` 自动可用。

## 范围
1. `buildRockSoloMvPrompt`（MiniMax H3 Ref2VA 六段式，与 folk-solo / piano-ballad 同契约）
   - 资产：≥1 人物 + ≥1 场景；拒绝人设表/双人构图参考图
   - 无人声（instrumental / pre_vocal）：只用舞台远景或电吉他手部/琴颈/音箱踏板细节，**不对歌手脸**
   - 人声：优先歌手面部特写对口型；吉他手部仅作句间点缀
   - vocal_enters：人声起点前只给远景/吉他手部，起点后切到脸部特写
   - 切镜只落在乐句/呼吸/人声空白，禁止句中切
   - 版本常量 `ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION = "rock-solo-ref2va-v1"`
2. 注册表追加 `rock-solo`；`listMvPromptTemplates` / `buildMvPromptForTemplate` 自动覆盖
3. CLI help 文案同步列出 rock-solo；`npm test` 接入新测试

## 非目标
- 不改 UI 模板下拉（下一晚）
- 不付费跑 RunningHub
- 不合并既有 open PR 栈

## 验收
- `scripts/test-rock-solo-mv-prompt.mjs`：六段顺序、无人声不对脸且含 stage/guitar/amp、人声含特写与歌词 `<d>`、vocal_enters 第一镜不是面部特写、人设表与缺场景报错、注册表含 rock-solo 且版本一致
- `npm test` 全绿；既有模板输出不变
- 无 RH / 无密钥 / 无大媒体
