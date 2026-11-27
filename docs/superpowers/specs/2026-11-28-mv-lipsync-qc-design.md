# 2026-11-28 MV 口型试片成片近脸覆盖 QC

## 背景

口型试片的输入门禁已经完整：人声活跃比、近脸参考、按时长计的积分预检、身份/场景/话筒支架锁定词。但成片侧仍靠人工抽帧或视频模型目检。2026-11-22 迅风试片口型能对上，构图却是中景；2026-11-26 像素幻想试片约 7/10 秒是面部特写、中段半身可见吉他，视频模型 QC 又因 resource_exhausted 没跑成。下一夜一旦有积分或走梅林，需要一个可重复、不依赖云端视觉模型的成片近脸覆盖检查，避免把「中景也能开口」当成合格口型试片。

本夜补纯函数成片 QC，不新开曲风，不改切镜句界，不提交付费任务。

## 目标

封装原曲之后，用抽帧元数据判断这段**人声试片**里有没有足够多的近脸帧，用来评口型。检查必须看人脸几何信号（人脸框高度占比或中心肤色），**不能**因为文件名带 close-up / ref-crop / 近脸 就放行——那些路径规则只适用于参考图，不适用于生成帧。

## 行为

1. `assessOutputFrameCloseUp(frame)`：评估单帧是否适合评口型。只依据 `width` / `height` / `faceHeightRatio` / `centerSkinFraction`。忽略路径里的近脸或远景提示。判定与参考图门禁的几何规则对齐：`faceHeightRatio >= 0.25` 为近脸；或竖幅（`height >= width`）且 `centerSkinFraction >= 0.18` 为近脸。宽高无效则 `ok: false`。横幅成片（如 1280×736）若只有路径提示、没有几何信号，不得判为近脸。
2. `planLipsyncQc({ frames, purpose, minCloseUpRatio, minFrames })`：
   - `frames` 为抽帧列表（可含 `tSec` 与上述字段）。默认 `purpose` 为 `vocal`，默认 `minCloseUpRatio = 0.6`，默认 `minFrames = 3`。
   - 人声试片目的：缺帧或有效帧少于 `minFrames` 时 `ok: false`，code `MISSING_FRAMES`。
   - 人声试片：近脸帧占比 < 门槛时 `ok: false`，code `LOW_CLOSEUP_COVERAGE`（例如整段中景、脸太小评不了口型）。
   - 伴奏/无人声 `purpose: 'instrumental'`：不要求近脸覆盖（符合「无人声不对歌手脸」）；只要帧数足够即通过，并报告实际占比。
   - 返回每帧评估、`closeUpCount` / `frameCount` / `closeUpRatio`、中文 `reason`。
3. 库约束：`lib/mv-lipsync-qc.mjs` 不引入 `node:`，不跑 ffmpeg。调用方注入帧元数据（CLI 读 `--frames-json`）。
4. CLI `mv-lipsync-qc --frames-json <file> [--purpose vocal|instrumental] [--min-ratio 0.6] [--min-frames 3] [--json]`：stdout 为结果；不通过时 `exitCode = 1`。

## 非目标

- 不在本夜做自动抽帧、人脸检测或话筒支架视觉识别。
- 不改输入侧 prep / preflight / finalize 的门禁阈值。
- 不把 11/26 的 10s / 69.53 计费观测作为本规格的阻塞项。
- 不在积分不足时自动提交云端试片；不抢占已约在 01:00 的梅林分段整首任务。

## 验收

见对应 plan 中的测试断言；`npm test` 全绿，含新的 `test-mv-lipsync-qc`。
