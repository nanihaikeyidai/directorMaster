# 电子舞曲 MV 提示词标准（dance-edm-ref2va-v1）

- 入口：`buildDanceEdmMvPrompt` / `buildMvPromptForTemplate('dance-edm', input)` / CLI `mv-cut --template dance-edm`
- 素材：≥1 张单人定妆（成人歌手/表演者，舞台或俱乐部）+ ≥1 张场景；人设表/双人构图参考图直接报错
- 输出：MiniMax H3 Ref2VA 六段（subject_definitions → non_diegetic_music），`<Audio 1>` fully_copy，成片后封装原曲
- 切镜：只在乐句/呼吸/人声空白处硬切，禁止句中切
- 无人声段：俱乐部/LED/舞台远景 / DJ deck·controller 手部 / 雾与激光剪影，不对歌手脸
- 人声段：优先歌手面部特写对口型，半身唱跳与 deck 手部只做句间点缀
- 人声进入段（vocal_enters）：起点前远景/deck/雾激光，起点处切到面部特写
- 查看所有模板：`npm run director -- mv-templates`
