# Dance-edm MV 提示词模板（2026-11-05）

## 背景
用户最终诉求：输入一首音乐 → 生成各类 MV。已有 `band` / `folk-solo` / `folk-duo` / `piano-ballad` / `rock-solo`，UI 模板下拉已读注册表。本晚新增第六类 **dance-edm（电子舞曲 · 舞台/俱乐部独唱表演）**，挂进既有 `MV_PROMPT_TEMPLATES` 注册表，CLI `mv-cut --template` 与 UI picker 自动可用。

## 范围
1. `buildDanceEdmMvPrompt`（MiniMax H3 Ref2VA 六段式，与 rock-solo / piano-ballad 同契约）
   - 资产：≥1 人物 + ≥1 场景；拒绝人设表/双人构图参考图（同 `DUAL_SHEET_RE`）
   - 无人声（instrumental / pre_vocal）：只用俱乐部/LED/舞台远景，或 deck/controller 手部，或雾/激光剪影，**不对歌手脸**
   - 人声：优先歌手面部特写对口型；舞蹈/deck 手部仅作句间点缀
   - vocal_enters：人声起点前只给远景/deck/雾激光，起点后切到脸部特写
   - 切镜只落在乐句/呼吸/人声空白，禁止句中切
   - 版本常量 `DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION = "dance-edm-ref2va-v1"`
2. 注册表追加 `dance-edm`（label：`电子舞曲（舞台/俱乐部）`）；`listMvPromptTemplates` / `buildMvPromptForTemplate` / UI picker 自动覆盖
3. CLI help 文案同步列出 dance-edm；`npm test` 接入新测试；软更新 UI picker 期望 id 列表

## 非目标
- 不付费跑 RunningHub
- 不合并既有 open PR 栈
- 不改 UI 交互本身（注册表驱动已足够）

## 验收
- `scripts/test-dance-edm-mv-prompt.mjs`：六段顺序、无人声不对脸且含 LED|club|deck|controller|fog|laser|stage、人声含特写与歌词 `<d>`、vocal_enters 第一镜不是面部特写、人设表与缺场景报错、注册表含 dance-edm 且版本一致（共 6 个模板）
- `npm test` 全绿；既有模板输出不变
- `node cli/director-master.mjs mv-templates` 列出 6 个模板含 dance-edm
- 无 RH / 无密钥 / 无大媒体
