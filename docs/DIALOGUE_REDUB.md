# 台词重配 Dialogue Redub（P0）

画面默认不动；人声克隆 + 改词 + 新字幕。ComfyUI 须已在跑，本工具不 spawn。

## 依赖

- ComfyUI + `comfyui-confucius-r2t2-t8`（R2T2）
- IndexTTS 2.5 T8 节点
- `FL_Audio_Separation`（可选；失败则跳过分离）
- ffmpeg

原项目：https://github.com/netease-youdao/Confucius4-R2T2  
节点：https://github.com/T8mars/comfyui-confucius-r2t2-t8

## CLI

```bash
# 全流程（到听写后可 --stop-after transcribe 再改 script）
node cli/director-master.mjs redub --video "片.mp4" --consent true --name huaqiang --stop-after transcribe

# 应用改写本后继续
node cli/director-master.mjs redub --stage script --job <id> --script path/to/script.json
node cli/director-master.mjs redub --stage refs --job <id>
node cli/director-master.mjs redub --stage tts --job <id>
node cli/director-master.mjs redub --stage mix --job <id>
```

工作区：`workspace/dialogue-redub/<jobId>/`

## script.json

```json
{
  "version": 1,
  "segments": [
    {
      "id": "L001",
      "speaker": "A",
      "start": 1.2,
      "end": 3.5,
      "originalText": "这瓜保熟吗",
      "newText": "火星上的电梯还通车吗",
      "replace": true,
      "emotionMode": "speaker"
    }
  ]
}
```

`speaker` 用于切参考音色；同 speaker 共享一段 ref。

## 许可

声音克隆须 `--consent true`。R2T2 权重遵循网易有道 Model License。
