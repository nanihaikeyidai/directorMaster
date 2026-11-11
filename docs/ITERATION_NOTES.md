# Iteration Notes

## 2026-11-12 00:00 Asia/Shanghai — 最终合成校验（P0-5）

**模块**：MV / Sprint 1 遗留 P0-5（最终合成校验）。按 2026-11-07 用户优先级：流程优化与对口型/人物一致性优先于新曲风。`muxOriginalAudio` 已能拼接视频并用原曲覆盖音轨，但合成前没有可测试的报告：段顺序、缺段空洞、重复、时间轴缺口/重叠、总时长与原曲、以及误把生成音轨当母带都可能静默出片。本夜落地纯函数合成前校验，并接到 CLI 与 mux 预检。无新曲风、无 RH。

**验收标准**
- `checkMvCompose`：空/非法输入 → `NO_SEGMENTS`；重复段号 / 非连续 1..n / 输入顺序错乱 / 重复成片路径分别为 error
- 相邻段 start/end 超出 80ms 容差报 `TIMELINE_GAP` / `TIMELINE_OVERLAP`；8.00 与 8.05 首尾相接不报缺口
- 提供 `sourceAudioDuration` 且与期望总时长偏差 > 容差 → `TOTAL_DURATION_MISMATCH`（带 delta）
- 默认要求原曲母带：无路径/正时长且未标记 `original` → `MISSING_SOURCE_AUDIO`；`audioSource=generated` 即使有路径也是 error；`unknown` 有证据为 warning，无证据为 error
- 默认 `requireVideo`：既无 `videoPath` 也无正数 `videoDuration` → `MISSING_VIDEO`；关闭后不报该错
- CLI `mv-compose-check --manifest`；stdout 为报告 JSON；`!ok` 时 exit 1
- `muxOriginalAudio` 在 ffmpeg 前跑校验；重复路径或缺原曲在调用 ffmpeg 前被拦住
- `npm test` 含 `test-mv-compose-validate`；无密钥 / 无大媒体 / 无 RH 调用

**完成**
- `lib/mv-compose-validate.mjs` + typings：`checkMvCompose` / `formatComposeReport`（中文 message + suggestion）
- CLI `mv-compose-check`；夹具 `examples/mv-compose-fixture.json` / `examples/mv-compose-fixture-bad.json`
- `muxOriginalAudio` 合成前预检；`scripts/test-mv-compose-validate.mjs` 接入 `npm test`
- Design/plan：`docs/superpowers/{specs,plans}/2026-11-12-mv-compose-validate*.md`

**验证**：`npm test` 全绿（含 `test-mv-compose-validate`）。CLI 对 ok 夹具 exit 0 / `ok:true`，对 bad 夹具 exit 1。无 RH 付费。

**15s 口型试片**：今晚**跳过**，未烧 RunningHub 币。原因：电脑 meilin 离线，无法读取本机虚拟偶像有人声源曲；箱内已探测的 Camilla 片段（camilla-30s / yusu src·raw / vocal-seg / sing-20-30 / audio-segs / yz-jinyu segs）最高人声活跃比约 0.03–0.13，远低于 `mv-lipsync-prep` 门槛 0.35（最高为 yusu raw 约 0.125）；禁止用间奏/器乐或 Downloads 里的 TTS 口语、剧集对白评演唱口型。

**下一晚**：有人声源曲验证 15s 试片 / open PR 合并卫生。

## 2026-11-11 00:00 Asia/Shanghai — 把人物一致性包接入 mv-cut 与口型试片

**模块**：MV / 人物一致性（把一致性包接入 mv-cut 与口型试片）。按 2026-11-07 用户优先级：流程优化与对口型/人物一致性优先于新曲风。PR #22 已落地分类/组包/CLI `mv-character-pack`，但 `mv-cut` 与口型试片仍按文件系统顺序取图、中途 9 张截断，且不注入 `identityLockText`。本夜加 apply 层并接到裁切与试片计划。无新曲风、无 RH。

**验收标准**
- 场景分类素材（`category: 场景`）即使文件名通用也归为 `scene`
- 打包后顺序为近脸 → 三视图 → 换装 → 场景；换装排在脸后；满 9 张时保留锁脸、丢掉靠后的场景
- 无近脸锁脸 → `ok: false` 与提及近脸/锁脸的中文理由；`mv-cut` 抛出该理由
- `appendIdentityLockToPrompt` 在 `overall_soundscape:` 前插入锁定词，且幂等
- `buildLipsyncTrialPlan({ hops, refs })` 成功时附带 pack + identity lock；无锁脸失败；旧 `{ hops, person }` 且无 `refs` 行为不变
- CLI `mv-lipsync-prep` help 列出 `--ref` / `--dir`
- `npm test` 含扩展的 `test-mv-character-consistency` 与 `test-mv-lipsync-prep`；无密钥 / 无大媒体 / 无 RH 调用

**完成**
- `applyCharacterPackToAssets` / `appendIdentityLockToPrompt`（`lib/mv-character-consistency.mjs` + typings）
- `mv-cut`：先收齐人物+场景图再打包，满 9 张改为打包后截断，段提示词注入身份锁定词，manifest 写入 JSON-safe `characterPack` 快照
- `buildLipsyncTrialPlan` 可选 `refs`；CLI `mv-lipsync-prep` 增加可重复 `--ref` 与 `--dir`
- Design/plan：`docs/superpowers/{specs,plans}/2026-11-11-mv-character-pack-apply*.md`

**验证**：`npm test` 全绿（含 `test-mv-character-consistency` 与 `test-mv-lipsync-prep`）。无 RH 付费。

**15s 口型试片**：今晚**跳过**，未烧 RunningHub 币。原因：电脑 meilin 离线，无法读取本机虚拟偶像有人声源曲；箱内已探测的 Camilla 片段（camilla-30s / yusu src·raw / vocal-seg / sing-20-30）最高人声活跃比约 0.03–0.13，远低于 `mv-lipsync-prep` 门槛 0.35；禁止用间奏/器乐或 Downloads 里的 TTS 口语评演唱口型。

**下一晚**：有人声源曲验证 15s 试片 / open PR 合并卫生。

## 2026-11-10 00:00 Asia/Shanghai — MV 人物一致性包（三视图/近脸锁脸）

**模块**：MV / 人物一致性（流程优化）。按 2026-11-07 用户优先级：流程优化与对口型/人物一致性优先于新曲风。PR #20（口型试片门禁）与 PR #21（音频 hops → 推荐模板）之后，剩余缺口是 Ref2VA / 口型试片仍手工挑定妆与三视图，换装后容易丢脸。本夜落地纯函数人物一致性包：分类参考图、强制近脸锁脸、稳定排序并生成身份锁定提示词。无新曲风、无 RH。

**验收标准**
- `classifyCharacterRef`：still-B / ref-crop / face-front / close-up / bust / 胸像 / 近脸 → `face_closeup`；threeview-A / still-A / `*-A` / front → `threeview_front`；threeview-C / side → `threeview_side`；back / 背 → `threeview_back`；costume / outfit / 换装 / look- → `costume`；scene / 场景 / wide / `newface-beach A.jpg` → `scene`；meta.role 覆盖路径猜测
- `buildCharacterConsistencyPack`：无近脸锁脸 → `ok:false` 与中文理由；有锁脸则 `ok`，缺三视图仅警告；`orderedRefs` 为近脸 → 三视图 → 换装 → 场景；换装排在脸后
- `identityLockText` 含 face/identity 与中文锁脸约束，并指向 Picture N（主锁脸）
- CLI `mv-character-pack --ref/--dir/--json`；`!ok` 时 exit 1
- `npm test` 含 `test-mv-character-consistency`；无密钥 / 无大媒体

**完成**
- `lib/mv-character-consistency.mjs` + `.d.ts`：分类、组包、中文报告、目录扫描；复用 `assessFaceCloseUpRef`
- CLI `mv-character-pack`；`scripts/test-mv-character-consistency.mjs` 接入 `npm test`
- Design/plan：`docs/superpowers/{specs,plans}/2026-11-10-mv-character-consistency*.md`

**验证**：`npm test` 全绿（含 `test-mv-character-consistency`）；CLI 对路径名 `--ref still-B.jpg --ref look-summer.jpg --ref scene-wide.jpg` 通过并输出身份锁定词。无 RH 付费。

**15s 口型试片**：今晚**跳过**，未烧 RunningHub 币。原因：电脑 meilin 离线，无法读取本机虚拟偶像有人声源曲；箱内已探测的 Camilla 片段（sing-20-30 / seg20 / vocal-seg / audio-segs / yz-jinyu segs）人声活跃比约 0.03–0.12，远低于 `mv-lipsync-prep` 门槛 0.35；禁止用间奏/器乐或 Downloads 里的 TTS 口语评演唱口型。

**下一晚**：有人声演唱源曲再跑 15s 口型试片；open PR #4、#6–#22 合并卫生；或把人物一致性包接入 `mv-cut` / 口型试片提交流程。

## 2026-11-09 00:00 Asia/Shanghai — 音频能量 hops → 推荐模板

**模块**：MV / 流程优化。按 2026-11-07 用户优先级：流程优化与对口型/人物一致性优先于新曲风。PR #19（推荐）与 PR #20（口型试片门禁）之后，剩余缺口是 `mv-recommend` 仍需手填 BPM/能量/密度；本夜把已有 `probeEnergyHops` 信号喂进 `recommendMvPromptTemplate`。无新曲风、无 RH。

**验收标准**
- `extractMusicSignalsFromHops`：大声人声 hops → `energy=high` / `vocalDensity=dense`；安静低音器乐 → `low`/`sparse`；中段混合 → medium 映射；空 hops 不抛错，省略 energy/density/bpm，理由含「信号不足」
- extras 覆盖提取的 energy/hints；`recommendMvPromptTemplate(extract(...).signals)` 始终返回注册表 `templateId`（low+sparse+piano 偏向 piano-ballad）
- 规则 120 BPM 脉冲可给出 100–140 BPM（或明确省略）；噪声/平坦 hops 省略 bpm
- CLI `mv-recommend --audio` / `--hops-json`；`--json` 为 `{ ...recommendResult, extraction }`；无音频时旧手动信号路径不变
- `npm test` 含 `test-mv-music-signals`；无密钥 / 无大媒体

**完成**
- `lib/mv-music-signals.mjs` + `.d.ts`：纯函数提取 + 薄 IO `probeMusicSignals`
- CLI `mv-recommend --audio/--hops-json`；人类可读输出打印推断信号；`scripts/test-mv-music-signals.mjs` 接入 `npm test`
- Design/plan：`docs/superpowers/{specs,plans}/2026-11-09-mv-recommend-from-audio*.md`

**验证**：`npm test` 全绿（含 `test-mv-music-signals`）；`node cli/director-master.mjs mv-recommend --hints 说唱 --json` → rap-hiphop（无 extraction）；临时 hops-json 大声人声序列 → `extraction.signals.energy=high` / `vocalDensity=dense`。无 RH 付费。

**下一晚**：有人声源曲验证 15s 试片 / open PR 合并卫生 / character-consistency pipeline。

## 2026-11-08 00:00 Asia/Shanghai — MV 口型试片门禁（人声段 + 近脸）

**模块**：MV / 口型流程优化（人物近脸门禁一并落地）。按 2026-11-07 用户优先级：流程优化与对口型/人物一致性优先于新曲风。

**验收标准**
- `isVocalActiveHop` / `selectVocalSegment`：器乐主导 hops → `ok:false`；人声活跃比 ≥0.35 的窗口可选出 ≥10s（优先 15s）
- `assessFaceCloseUpRef`：`ref-crop`/人脸框/竖幅+肤色通过；场景/远景路径拒绝
- `buildLipsyncTrialPlan` 双门禁；CLI `mv-lipsync-prep`；`npm test` 含新用例
- 实机：`camilla-30s.mp3` 最高人声活跃比约 0.10 → **拒绝试片**（不烧 RH 币）

**完成**
- `lib/mv-lipsync-prep.mjs` + `.d.ts`：纯函数门禁 + `probeEnergyHops`（ffmpeg）
- CLI `mv-lipsync-prep`；`scripts/test-mv-lipsync-prep.mjs`；design/plan 文档
- 今晚 15s 口型试片：**跳过**（音频门禁未通过；人物 `ref-crop.jpg` 近脸门禁通过）

**验证**：`npm test` 全绿；CLI 对 Camilla 返回 exit 1 + 中文拒绝理由。无 RH 付费。

**下一晚**：换真正有人声演唱的源曲再跑 15s 试片；或 ffprobe 信号喂 `mv-recommend`；open PR #4、#6–#20 合并卫生。

## 2026-11-07 00:00 Asia/Shanghai — MV 音乐信号 → 模板推荐

**模块**：MV / 模板推荐。最高优先级未完成项：按昨晚计划落地「音乐 → 自动推荐模板（BPM/人声密度/乐器/hints）」；无新曲风、无 RH。

**验收标准**
- `recommendMvPromptTemplate(signals)`：空 → band 低置信；hints 说唱 → rap-hiphop；bpm130+synth+high → dance-edm；piano+sparse+bpm72 → piano-ballad；performers2+acoustic → folk-duo；dense+urban → rap-hiphop；electric-guitar+high → rock-solo；templateId 始终在 `MV_PROMPT_TEMPLATES`
- CLI `mv-recommend` 人类可读中文 + `--json`；help 已更新
- `npm test` 全绿（含 `test-mv-template-recommend`）

**完成**
- `lib/mv-prompt.mjs` + `.d.ts`：`recommendMvPromptTemplate`（hints 硬加分 + BPM/能量/密度/乐器/人数组合）
- CLI `mv-recommend`；`package.json` `test` / `test:mv-template-recommend`
- Design/plan：`docs/superpowers/{specs,plans}/2026-11-07-mv-template-recommend*.md`；`.gitignore` 忽略 `.worktrees/`

**验证**：`npm test` 全绿；`node cli/director-master.mjs mv-recommend --hints 说唱 --json` → rap-hiphop。无 RH 付费。

**下一晚**：open PR #4、#6–#19 合并卫生；或音乐→自动抽信号（ffprobe/BPM 估）喂 recommend；或下一曲风（jazz-solo / vocal-duo）模板。

## 2026-11-06 00:00 Asia/Shanghai — MV rap-hiphop 模板（第七类）

**模块**：MV / 模板库扩展。最高优先级未完成项判断：主路径无阻塞 bug，UI picker 已读注册表，按 nightly 计划扩展下一曲风 **rap-hiphop（说唱嘻哈 · 街头/舞台独唱）**。

**验收标准**
- 注册表含 7 个模板，`buildMvPromptForTemplate('rap-hiphop')` 可用；UI picker / `mv-templates` / `mv-cut --template rap-hiphop` 自动可用
- 无人声段不对脸（街头远景/搓碟/涂鸦霓虹/逆光剪影）；人声段首镜面部特写并要求 dense-syllable 逐字口型；切点只在小节/乐句边界

**完成**
- `buildRapHiphopMvPrompt` + `RAP_HIPHOP_MV_PROMPT_TEMPLATE_VERSION=rap-hiphop-ref2va-v1`，`.d.ts`、CLI help、`npm test` 接入
- 文档 `docs/RAP_HIPHOP_MV_PROMPT_STANDARD.md`；spec/plan `docs/superpowers/{specs,plans}/2026-11-06-rap-hiphop-mv-prompt*.md`

**验证**：`npm test` 全绿；`mv-templates` 输出 7 个。代码侧无 RH 付费（每晚 15s 口型试片另计）。

**下一晚**：MV 一键「音乐 → 自动推荐模板」（按 BPM/人声密度建议曲风）或 open PR #4、#6–#18 合并卫生。

## 2026-11-05 00:00 Asia/Shanghai — MV dance-edm 模板（第六类）

### Module chosen
**MV / 模板库扩展**（每晚至少新增一类曲风模板）。UI picker 已落地，本晚加第六类 **dance-edm（电子舞曲 · 舞台/俱乐部独唱表演）**，挂进既有 `MV_PROMPT_TEMPLATES` 注册表。无 RH 付费。

### 验收标准
- 无人声段只出俱乐部/LED/舞台远景 / deck·controller 手部 / 雾与激光剪影，不出歌手面部特写；人声段首镜为面部特写；vocal_enters 起点前不对脸、起点后切脸
- 句中不切；人设表/缺场景报错；六段顺序正确
- 注册表含 band/folk-solo/folk-duo/piano-ballad/rock-solo/dance-edm，`buildMvPromptForTemplate('dance-edm')` 可用；未知模板报错并列出可选项
- `npm test` 全绿；`mv-templates` 输出 6 个模板

### Landed
- `buildDanceEdmMvPrompt` + `DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION=dance-edm-ref2va-v1`
- 注册表追加 `dance-edm`（label：电子舞曲（舞台/俱乐部））；`listMvPromptTemplates` / `buildMvPromptForTemplate` / UI picker 自动覆盖
- CLI：`mv-cut --template` help 列出 dance-edm（allowlist 来自注册表）
- 测试 `scripts/test-dance-edm-mv-prompt.mjs` 接入 `npm test`；软更新 UI picker 期望 id；文档 `docs/DANCE_EDM_MV_PROMPT_STANDARD.md`
- Design/plan：`docs/superpowers/specs/2026-11-05-dance-edm-mv-prompt-design.md`、`docs/superpowers/plans/2026-11-05-dance-edm-mv-prompt.md`

### Verification
- `npm test` 全绿（含 dance-edm + mv-ui-template-picker）
- `node cli/director-master.mjs mv-templates` 输出 6 个模板
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- 下一曲风：说唱（rap-hiphop）或其他变体，或 vocal-duo / live-band 变体
- open PR 合并卫生：#4、#6–#16 仍可能 open；本 PR 堆叠在 mv-ui-template-picker (#16) 之上

## 2026-11-04 00:00 Asia/Shanghai — MV UI 模板下拉读注册表

### Module chosen
**MV / UI 模板 picker**（CLI 注册表已有 band/folk-solo/folk-duo/piano-ballad/rock-solo，本晚把 `app/mv/page.tsx` 从硬编码 band 接到 `listMvPromptTemplates` / `buildMvPromptForTemplate`）。无 RH 付费。

### 验收标准
- `normalizeMvPromptTemplateId`：空/未知 → `band`；已注册 id 原样返回
- `GET /api/local/mv/templates` → `{ templates: listMvPromptTemplates() }`
- 项目持久化 `promptTemplateId`（create/PUT 规范化）；恢复项目时 soft-normalize
- MV 页工具栏 `<select aria-label="MV 提示词模板">`；生成走 `buildMvPromptForTemplate`；signature 含 templateId+version
- `npm test` 全绿；无 RH / 无密钥 / 无大媒体

### Landed
- `normalizeMvPromptTemplateId` + d.ts
- local-runtime：GET templates；create/PUT 写 `promptTemplateId`
- `app/mv/page.tsx`：模板下拉、生成路径、signature、save/restore
- 测试 `scripts/test-mv-ui-template-picker.mjs` 接入 `npm test`
- Design/plan：`docs/superpowers/specs/2026-11-04-mv-ui-template-picker-design.md`、`docs/superpowers/plans/2026-11-04-mv-ui-template-picker.md`

### Verification
- `npm test` 全绿（含 mv-ui-template-picker）
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- 下一曲风：dance-edm（电子舞曲）或其他变体
- open PR 合并卫生：#4、#6–#15 仍可能 open；本 PR 堆叠在 mv-master-rebrand (#15) 之上

## 2026-11-03 00:00 Asia/Shanghai — MV rock-solo 模板（第五类）

### Module chosen
**MV / 模板库扩展**（每晚至少新增一类曲风模板）。piano-ballad 已落地，本晚加第五类 **rock-solo（摇滚独唱 · 电吉他舞台弹唱）**，挂进既有 `MV_PROMPT_TEMPLATES` 注册表。无 RH 付费。

### 验收标准
- 无人声段只出舞台远景 / 电吉他手部·琴颈 / 音箱踏板细节，不出歌手面部特写；人声段首镜为面部特写；vocal_enters 起点前不对脸、起点后切脸
- 句中不切；人设表/缺场景报错；六段顺序正确
- 注册表含 band/folk-solo/folk-duo/piano-ballad/rock-solo，`buildMvPromptForTemplate('rock-solo')` 可用；未知模板报错并列出可选项
- `npm test` 全绿；`mv-templates` 输出 5 个模板

### Landed
- `buildRockSoloMvPrompt` + `ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION=rock-solo-ref2va-v1`
- 注册表追加 `rock-solo`（label：摇滚独唱（电吉他舞台））；`listMvPromptTemplates` / `buildMvPromptForTemplate` 自动覆盖
- CLI：`mv-cut --template` help 列出 rock-solo（allowlist 来自注册表）
- 测试 `scripts/test-rock-solo-mv-prompt.mjs` 接入 `npm test`；文档 `docs/ROCK_SOLO_MV_PROMPT_STANDARD.md`

### Verification
- `npm test` 全绿（band / folk-solo / folk-duo / piano-ballad / rock-solo / redub / subtitle / review / resume / align）
- `node cli/director-master.mjs mv-templates` 输出 5 个模板
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- UI 模板下拉直接读 `listMvPromptTemplates()`
- 下一曲风：电子舞曲（dance-edm）或其他变体
- open PR 合并卫生：#4、#6–#13 仍 open，本 PR 堆叠在 piano-ballad #13 之上

## 2026-11-02 00:00 Asia/Shanghai — MV piano-ballad 模板 + 模板注册表

### Module chosen
**MV / 模板库扩展**（每晚至少新增一类曲风模板）。folk-duo 已落地，本晚加第四类 **piano-ballad（钢琴自弹自唱）**，并把 CLI 的模板 if/else 收敛为注册表，后续加曲风只需注册一项。无 RH 付费。

### 验收标准
- 无人声段只出场地远景/琴键手部/琴槌细节，不出歌手面部特写；人声段首镜为面部特写；vocal_enters 起点前不对脸、起点后切脸
- 句中不切；人设表/缺场景报错；六段顺序正确
- 注册表含 band/folk-solo/folk-duo/piano-ballad，`buildMvPromptForTemplate('folk-solo')` 与原函数输出一致；未知模板报错并列出可选项
- `npm test` 全绿

### Landed
- `buildPianoBalladMvPrompt` + `PIANO_BALLAD_MV_PROMPT_TEMPLATE_VERSION=piano-ballad-ref2va-v1`
- `MV_PROMPT_TEMPLATES` / `listMvPromptTemplates()` / `buildMvPromptForTemplate()`（+ d.ts）
- CLI：`mv-cut --template piano-ballad`（allowlist 来自注册表）；新增 `mv-templates` 列出模板，方便 AI 调用
- 测试 `scripts/test-piano-ballad-mv-prompt.mjs` 接入 `npm test`；文档 `docs/PIANO_BALLAD_MV_PROMPT_STANDARD.md`

### Verification
- `npm test` 全绿（band / folk-solo / folk-duo / piano-ballad / redub / subtitle / review / resume / align）
- `node cli/director-master.mjs mv-templates` 输出 4 个模板
- 无 RunningHub / 无密钥 / 无大媒体

### Remaining / next night
- UI 模板下拉直接读 `listMvPromptTemplates()`
- 下一曲风：电子/舞曲（dance-performance）或 摇滚独唱 / 说唱
- open PR 合并卫生：#4、#6–#12 仍 open，本 PR 堆叠在 #12 之上

## 2026-11-01 00:00 Asia/Shanghai — MV folk-duo 提示词模板 + CLI

### Module chosen
**MV / folk-duo 模板库扩展**（用户定稿方案 A：扩展 `lib/mv-prompt.mjs` + CLI；folk-solo 之后落地 folk-duo；参考 BV1dsxM6EEKn 吉他手+主唱）。无 RH 付费。

### Landed
- `buildFolkDuoMvPrompt` + `FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION=folk-duo-ref2va-v1`
- 角色启发式（主唱/singer vs 吉他/guitar）；≥2 人物 + ≥1 场景；禁 identical-twin/copy，允许两张不同定妆
- 切镜：句中不切；无人声=场地远景或吉他手手部（不对主唱脸）；人声优先主唱脸 CU + 吉他手点缀；`vocal_enters` 混成
- CLI：`mv-cut --template folk-duo`（allowlist `band|folk-solo|folk-duo`）
- 测试：`scripts/test-folk-duo-mv-prompt.mjs` 接入 `npm test`
- Docs：design/plan + `docs/FOLK_DUO_MV_PROMPT_STANDARD.md`

### Verification
- `node scripts/test-folk-duo-mv-prompt.mjs` → ok
- `npm test` 全绿（含 band / folk-solo / folk-duo）
- 无 RunningHub / 无密钥 / 无大媒体提交

### Remaining / next night
- 下一曲风模板变体 **或** UI 模板下拉选择器 **或** Sprint 2 open PR 合并卫生（#4 / #6–#11 仍 open）
- folk-solo PR #11 与本 folk-duo 分支为堆叠关系，合入时注意 base

### Paths
- Design: `docs/superpowers/specs/2026-11-01-folk-duo-mv-prompt-design.md`
- Plan: `docs/superpowers/plans/2026-11-01-folk-duo-mv-prompt.md`

## 2026-10-26 会话 — Sprint 1 余项：MV 音画对齐检查（P0-4）

### Module chosen
**MV 音画对齐检查**（Sprint 1 剩余 P0-4）：导出/合成前纯函数报告，默认容差 80ms。

### Landed
- `lib/mv-av-alignment.mjs` (+ `.d.ts`)：`checkAvAlignment` / `formatAlignmentReport`
  - codes：AUDIO/VIDEO_DURATION_MISMATCH、AV_MISMATCH、TAIL_TRUNCATION、LEAD_SILENCE_MISMATCH、MISSING_AUDIO/VIDEO、INVALID_DURATION
  - 每条 issue 含中文 `message` + `suggestion`；`ok === false` 仅当存在 `severity: error`
- CLI：`mv-align-check --manifest <json> [--tolerance 0.08] [--require-video] [--require-audio|--no-require-audio]`
  - 字段别名：`duration`/`expectedDuration`、`exportedDuration`/`audioDuration`、顶层 lead silence
  - stdout JSON；`!ok` → `process.exitCode = 1`
- 示例：`examples/mv-align-fixture.json`（ok）、`examples/mv-align-fixture-bad.json`（多错误）
- 测试：`scripts/test-mv-av-alignment.mjs` 已接入 `npm test`

### Verification
- `npm test` → 既有套件 + mv-av-alignment 全绿
- CLI ok fixture → exit 0 / `ok:true`；bad fixture → exit 1 + issues
- 无 RH/网络/密钥；未合 main

### Remaining / next
- UI 导出前硬门禁（可选 soft report）未做
- P0-5 最终合成校验（顺序/空洞/重复）仍未做
- Sprint 2：RunningHub 多段显式化 / 可移植密钥 / 可观测

### Paths
- Design: `docs/superpowers/specs/2026-10-26-mv-av-alignment-design.md`
- Plan: `docs/superpowers/plans/2026-10-26-mv-av-alignment.md`

## 2026-10-25 会话 — Sprint 1 MV 审核状态 + 可恢复任务

### Module chosen
**MV 生产正确性**（定稿优先）：分段审核门禁 + 生成队列持久化 / jobId 续跑 / 失败重试。

### Landed
- `lib/mv-segment-review.mjs`：`pending|approved|submitted|failed` 纯函数 + 批量过滤
- `app/mv/page.tsx`：
  - 每段「通过审核」+ 状态标签（待审核/已审核/已提交/失败）
  - `enqueueGeneration` / 批量弹窗只接受 `approved`；无一 approved 则提示不入队
  - 「一键云端出完整 MV」自动切段+提示词后**停在 pending**，不再自动入队
  - 项目保存：`segmentReviews` / `generationQueue`（queued）/ `generationActive`
  - 恢复项目：按 jobId 续 `waitCloud`；恢复排队项并 `drain`；失败段「重试」
- `lib/mv-generation-resume.mjs`：resume 索引、队列规范化、active 序列化/恢复
- 测试：`test-mv-segment-review` + `test-mv-generation-resume` 已接入 `npm test`

### Verification
- `npm test` → mv-prompt + redub + subtitle + segment-review + generation-resume 全绿
- 未合 main；推送 `feature/mv-review-and-resume` → PR #4

### Manual checklist（需本机导演台）
1. 生成提示词 → 未点「通过审核」时本地/云端/批量均不可提交
2. 审核 2 段 → 批量默认只勾已审核；未审核 checkbox 禁用
3. 一键完整 MV → 只出提示词并提示去审核，不入队
4. 提交云端后刷新：有 jobId 的 running 段应继续轮询（需本地 RH 服务）
5. 人为失败段出现「重试」→ 可再次入队

### Remaining / next
- 音画对齐检查（Sprint 1 余力）→ 已在 2026-10-26 落地 lib+CLI
- Sprint 2：RunningHub 多段显式化 / 可移植密钥 / 可观测
- 实机 RH 续跑未在本环境验证（无本机 Comfy/RH）

### Paths
- Design: `docs/superpowers/specs/2026-10-25-mv-review-and-resume-design.md`
- Plan: `docs/superpowers/plans/2026-10-25-mv-review-and-resume.md`

## 2026-10-25 00:00 Asia/Shanghai — Subtitle V0 offline cues

### Module chosen
**视频后期配字幕** — highest gap (plan-only, zero code). Video gen / MV already wired. Standing rule: no RH paid retries → ship offline cue normalize + SRT/ASS exporters first.

### Landed
- `lib/subtitle-cues.mjs` (+ `.d.ts`): `normalizeCues`, `formatSrtTimestamp`, `cuesToSrt`, `cuesToAssBilingual`, `writeBilingualSubtitles`, `detectSubtitleWorkflowKind`
- CLI: `npm run director -- subtitle --cues <json> --out <dir> [--langs zh,en]`
- Missing-key path: `--video` without cues and without `RUNNINGHUB_API_KEY` → clear error, exit 1, no network
- Adapter stub: `detectSubtitleWorkflowKind` in `vite-plugins/runninghub-workflow-adapters.ts` (heuristic)
- Tests: `scripts/test-subtitle-cues.mjs` wired into `npm test`
- Docs: cherry-picked bilingual plan + Superpowers PM; design/plan under `docs/superpowers/`; V0.5 checkboxes updated

### Verification
- `node scripts/test-subtitle-cues.mjs` → ok
- `npm test` → mv-prompt + redub + subtitle ok
- CLI fixture dry-run wrote `.zh.srt` / `.en.srt` / `.bilingual.ass`
- No RH calls; no secrets committed

### New product asks (for backlog)
1. **V1 ASR adapter**: load RH API workflow JSON for Confucius4-R2T2; map upload + poll + parse to cues. Acceptance: with key, `--video` produces cues JSON under `workspace/subtitles/<jobId>/` without crashing on missing nodes.
2. **Cue editor API**: PATCH cues then re-export SRT/ASS without re-ASR. Acceptance: edit one cue text/times → exporters reflect change; invalid times rejected.
3. **Optional burn-in**: `ffmpeg` soft→hard sub when `--burn`. Acceptance: output mp4 plays with visible dual-line subs; skip cleanly if ffmpeg missing.

### Remaining gaps / blockers
- No live RH ASR until workflow JSON exported and key available (no paid retries tonight)
- Translation still caller-supplied (`translation` field); no LLM/API layer
- No UI entry on成片车厢 yet
- Open docs PRs #1 / #2 may overlap; this PR consolidates those docs + V0 code

### Suggested next-night plan
1. Export/save subtitle RH workflow JSON to `workspace/workflows/subtitle/cloud/` (account-side ID)
2. Wire `asr-r2t2` create/poll path behind key gate (single dry validate if free, else stub parse of fixture ASR output)
3. Map RH text/JSON outputs → `normalizeCues`
4. Minimal成片「配字幕」entry or task-center stub pointing at offline CLI for now

### Paths
- Design: `docs/superpowers/specs/2026-10-25-subtitle-v0-cues-design.md`
- Plan: `docs/superpowers/plans/2026-10-25-subtitle-v0-cues.md`
- Product plan: `docs/SUBTITLE_BILINGUAL_PLAN.md`
