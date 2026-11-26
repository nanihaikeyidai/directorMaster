# 2026-11-27 MV 禁止凭空生成话筒支架

## 背景

2026-11-26 像素幻想口型试片已注入身份锁定与特写场景锁定：全部抽帧保住了白天海边，中景可见木吉他，紧近脸没有再掉回室内暗舞台灯。但画面右侧仍出现了参考图里没有的话筒支架。现有 `sceneLockText` 只禁止在有吉他时「改成手持麦克风」，没有点名话筒支架、吊杆或其他话筒器材；民谣 v3 特写镜头也只写场景残留，没有禁止发明参考中没有的麦克风道具。模型仍会把「歌手」默认配上支架。

本夜收紧道具锁定，不新开曲风，不改切镜句界。

## 目标

有场景参考时，场景锁定词必须明确禁止凭空添加麦克风、话筒支架、吊杆或其他话筒器材（除非该器材在场景参考 Picture N 中可见）。民谣独唱/双人模板升至 v4：唱词特写镜头与全体 continuity 都写上同一禁令，避免支架出现在特写/半身画面边缘。

## 行为

1. `buildSceneLockText` / `pack.sceneLockText`：有场景参考时，在既有吉他-手持麦克风条款之外，追加中英双语道具条款：do not invent a microphone, microphone stand, boom arm, or other mic hardware unless it is visibly present in the scene reference Picture N；keep only props shown there。中文须含「话筒支架」，并写明除非场景参考中可见，否则禁止凭空添加麦克风、话筒支架、吊杆或其他话筒器材。无场景参考时仍为空字符串。
2. `appendIdentityLockToPrompt` 仍插入完整 `sceneLockText`（含新条款），幂等行为不变。
3. 民谣独唱/双人模板升至 `folk-solo-ref2va-v4` / `folk-duo-ref2va-v4`：唱词段面部特写与半身弹唱的 camera 行 / close-up hold 须禁止发明话筒支架；所有段（含无人声远景/琴弦）的 continuity 也须带上同一禁令，以免宽景边缘出现支架。无人声段仍不加「面部大特写也要留背景」那句。
4. 库约束：`lib/mv-character-consistency.mjs` 与 `lib/mv-prompt.mjs` 不为此引入 `node:`。不改钢琴/摇滚/电音/说唱模板（说唱模板本身需要麦克风）。

## 非目标

- 不强制取消面部特写。
- 不改迅风自动版（无 prompt 节点）的提交字段。
- 不把 11/26 的 10s / 69.53 计费观测作为本规格的阻塞项（可另做）。
- 不在积分不足时自动提交云端试片；不抢占已约在凌晨 2:00 的梅林整首任务。

## 验收

见对应 plan 中的测试断言；`npm test` 全绿，含扩展后的 `test-mv-character-consistency`、`test-folk-mv-prompt`、`test-folk-duo-mv-prompt`。
