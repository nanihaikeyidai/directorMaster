# 2026-11-24 MV 场景锁定（近脸裁切仍保住场地与道具）

## 背景

2026-11-23 口型试片为通过近脸门禁，从卡米拉海边泳装吉他全身图裁了 ref-crop 作人物主参考，全图作场景。迅风自动版没有提示词节点，成片保住了银发与泳衣，但把海边/吉他换成了室内灰幕舞台和麦克风。人物一致性包目前只写锁脸词，不写场景锁定；camilla-beach 这类海边文件名若未标 role 或 category，也不会被分成 scene；从原图裁近脸时，若调用方只传裁切图，原图场景会被丢掉。

本夜补场景锁定，让标准提示词路径（mv-cut、MV 页、像素幻想等可写 prompt 的工作流）在有场景参考时明确锁场地与道具。迅风自动版仍无 prompt 字段，库层锁词不会进入该应用；当晚口型试片改走可写 prompt 的像素幻想，用同一人声窗与近脸加原图场景验证。

## 目标

当人物包里有场景参考（含从近脸 sourcePath 或 croppedFrom 自动带上的原图）时，生成双语场景锁定词，并随现有身份锁定词插入提示词中 overall_soundscape 之前。

## 行为

1. 分类：文件名含 beach / 海滩 / 海边 且不是近脸或胸像启发式（含 letter B）时，分类为 scene。newface-beach B.jpg 仍是 face_closeup；newface-beach A.jpg 与 camilla-beach-swimsuit-guitar-2026-11-22.png 为 scene。显式 role 仍优先。
2. 原图回挂：参考输入可带 sourcePath 或 croppedFrom。若该路径尚未在包中，按分类加入；分类为 unknown 时记为 scene。不重复。
3. sceneLockText：有场景参考时生成；无则空字符串。内容必须中英双语，并点名对应 Picture N 与场景文件名；要求地点、环境、光线、服装场域与道具与该参考一致；禁止改换成室内灰幕舞台或无关道具；若场景里是吉他等乐器，禁止无依据地换成手持麦克风。
4. 警告：主锁脸路径像 ref-crop 且包中没有场景参考时，警告「近脸是裁切图，但缺少原图场景参考，画面容易丢掉场地与道具。」有场景参考则不因裁切本身告警。
5. 插入提示词：扩展 appendIdentityLockToPrompt(prompt, identityLockText, sceneLockText?)。身份词与场景词依次插在 overall_soundscape 之前；已有对应标记则不重复。mv-cut、MV 页 buildPackedPrompt、planMvCharacterPackUi 透传 sceneLockText。
6. 报告：formatCharacterPackReport 在有场景锁定词时输出「场景锁定词」。
7. 库约束：lib/mv-character-consistency.mjs 与 lib/mv-character-pack-ui.mjs 仍不得使用 node:，以便进浏览器。

## 非目标

- 不修改迅风自动版（无 prompt 节点）的提交字段。
- 不新增曲风模板，不改切镜句界规则。
- 不把「一键完整 MV」成功提示里误写的「币」作为本规格的阻塞项（可同夜另修）。

## 验收

见对应 plan 中的测试断言；npm test 全绿，含扩展后的 test-mv-character-consistency 与 test-mv-character-pack-ui。
