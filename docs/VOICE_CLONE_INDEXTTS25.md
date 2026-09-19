# Director Master · IndexTTS 2.5 声音克隆

## 集成方式

Director Master 复用当前已启动的 ComfyUI，不启动第二个服务。网页 `/voice` 与 CLI 都提交相同的 T8star-Aix IndexTTS 2.5 API 工作流，生成结果保存在：

`D:\HermesWorkspace\directorMaster\workspace\voice-clone\generated`

参考音频、任务参数和授权确认分别保存在 `assets` 与 `jobs` 目录中。

## 环境要求

- ComfyUI 中已安装 `comfyui-indextts25-T8`，并重启或刷新节点。
- 完整 IndexTTS 2.5 模型位于 ComfyUI 的 `models/TTS/IndexTTS-2.5`。
- 用户自行阅读并接受模型许可证；Director Master 不会自动勾选许可证，也不会自动下载约 7.7 GiB 模型。
- 建议 NVIDIA GPU 至少约 6 GiB 显存。
- 参考音色建议为 3–10 秒、单人、清晰、无背景音乐、无明显混响。

页面会检查当前 ComfyUI 是否包含以下节点：

- `T8_IndexTTS25_ModelLoader`
- `T8_IndexTTS25_ReferenceQuality`
- `T8_IndexTTS25_EmotionControl`
- `T8_IndexTTS25_Generate`

## 情绪模式

- `speaker`：跟随音色参考的情绪，最稳定、显存占用最低。
- `text`：使用自然语言导演情绪，例如“紧张但克制，语速略快，句尾发虚”。
- `vector`：八维控制，高兴、愤怒、悲伤、恐惧、厌恶、低落、惊讶、自然，单项范围 0–1。
- `audio`：使用另一段录音提供情绪和表达方式，音色身份仍来自主参考音频。

默认情绪强度为 0.65。随机情感原型固定关闭，以减少音色漂移。

## 页面工作流

1. 上传或选择音色参考。
2. 输入角色名和单句台词。
3. 选择语言、情绪模式、情绪强度与时长倍率。
4. 确认已获得声音克隆与使用授权。
5. 生成并在“生成记录”中逐句试听、审核和下载。

参考音频进入模型前会经过质量节点，自动检查并整理首尾静音。生成输出固定为 IndexTTS 2.5 的 22.05 kHz 音频。

## CLI 单句

```powershell
npm run director -- voice-generate `
  --ref "D:\voices\principal.wav" `
  --character "校长" `
  --text "这件事，先不要告诉任何人。" `
  --emotion-mode text `
  --emotion "紧张但克制，压低声音，句尾略微发虚" `
  --strength 0.65 `
  --duration 1.0 `
  --consent true `
  --watch
```

## CLI 批量台词

```json
[
  {
    "character": "校长",
    "text": "这件事，先不要告诉任何人。",
    "language": "ZH",
    "emotionMode": "text",
    "emotionText": "紧张但克制，压低声音",
    "emotionStrength": 0.65,
    "durationFactor": 1.0
  },
  {
    "character": "校长",
    "text": "我明白了。",
    "language": "ZH",
    "emotionMode": "vector",
    "emotionVector": { "afraid": 0.3, "calm": 0.5 },
    "emotionStrength": 0.6
  }
]
```

```powershell
npm run director -- voice-generate `
  --ref "D:\voices\principal.wav" `
  --batch "D:\voices\dialogue.json" `
  --consent true `
  --watch
```

批量任务按台词顺序串行提交，避免同时加载多个任务造成显存竞争。

## 后续导演台联动

任务数据已经保留 `character`、`text`、情绪参数、音频路径和生成状态。后续可从 SEG 台词解析出逐句任务，按角色关联已保存音色，生成后回写为 SEG 的声音素材，并根据台词时间轴做混音与对齐。
