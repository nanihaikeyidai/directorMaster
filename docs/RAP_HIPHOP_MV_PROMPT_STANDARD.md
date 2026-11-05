# 说唱嘻哈 MV 提示词标准（rap-hiphop-ref2va-v1）

- 入口：`buildRapHiphopMvPrompt` / `buildMvPromptForTemplate('rap-hiphop', input)` / CLI `mv-cut --template rap-hiphop`
- 场景：单人成年说唱歌手，手持麦克风，夜间街头 / 天台 / 地下舞台；涂鸦、霓虹、路灯、DJ 唱盘。
- 结构：MiniMax H3 Ref2VA 六段式（subject_definitions → summary → retention_analysis → detailed_description → overall_soundscape → non_diegetic_music），与 rock-solo / dance-edm 同契约。
- 口型：说唱字密，强调 dense / rapid syllables 逐字对口型、辅音闭合清晰、小节尾换气。
- 切镜：只在小节/乐句边界、换气或人声空白处切，禁止句中/小节中切。
- 无人声（前奏/间奏）：只用街头远景、搓碟手部、涂鸦霓虹细节、逆光剪影，不对脸。
- 人声段：首镜为面部特写（`歌手面部特写`），再接低机位半身手势、麦克风/手势点缀。
- 人物参考禁用双人人设表；必须至少 1 张人物 + 1 张场景素材。
