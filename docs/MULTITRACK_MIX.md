# 台词重配多轨时间轴与混音

阶段一只实现后端数据模型与混音引擎，不改前端，也不改变已有的听写、参考音色和 TTS 阶段。

## 文件位置

新 job 的时间轴位于：

```text
workspace/dialogue-redub/<jobId>/timeline.json
```

`timeline.json` 不存在时，混音器会读取旧的 `script.json` 和 `tts/manifest.json`，在内存中生成兼容时间轴。这样已有 31 段 job 仍可直接重跑，并且不会自动覆盖用户后来编辑过的脚本。

## 数据模型

```json
{
  "version": 1,
  "name": "台词重配时间轴",
  "duration": 119,
  "tracks": [
    {
      "id": "dialogue-01",
      "name": "华强",
      "kind": "dialogue",
      "volume": 1,
      "muted": false,
      "solo": false,
      "pan": 0,
      "clips": [
        {
          "id": "L001",
          "source": "华强",
          "trackId": "dialogue-01",
          "start": 0.6,
          "duration": 1.225,
          "offset": 0,
          "gain": 1,
          "fadeIn": 0.05,
          "fadeOut": 0.05,
          "mute": false,
          "audioPath": "D:\\HermesWorkspace\\directorMaster\\workspace\\dialogue-redub\\<jobId>\\tts\\L001.wav",
          "sourceDuration": 3.111474,
          "text": "这瓜保熟吗"
        }
      ]
    }
  ]
}
```

## 字段与默认值

`timeline.duration` 是整条时间轴的总时长，单位为秒。所有片段都必须落在 `0..duration` 内。

轨道字段：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `id` | 无 | 轨道唯一标识 |
| `name` | `id` | 显示名称 |
| `kind` | `dialogue` | `dialogue`、`vocal`、`bed`、`sfx` |
| `volume` | `1.0` | 整轨线性音量，必须大于等于 0 |
| `muted` | `false` | 整轨静音 |
| `solo` | `false` | 独奏；任意轨道 solo 后，其余非 solo 轨道静音 |
| `pan` | `0` | 声像，范围 `-1`（左）到 `1`（右） |
| `clips` | `[]` | 轨道中的音频片段 |

片段字段：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `id` | 无 | 片段唯一标识，旧台词继续使用 `L001` 编号 |
| `source` | 无 | 声源或素材标签；迁移时取 `speaker` |
| `trackId` | 所在轨道 `id` | 引用所属轨道 |
| `start` | `0` | 在时间轴上的绝对起点，单位为秒；移动片段只改此值 |
| `duration` | 无 | 片段在时间轴上的播放长度，单位为秒 |
| `offset` | `0` | 从素材内部开始裁切的秒数 |
| `gain` | `1.0` | 片段线性增益 |
| `fadeIn` | `0` | 淡入时长，单位为秒 |
| `fadeOut` | `0` | 淡出时长，单位为秒 |
| `mute` | `false` | 单片段静音 |
| `audioPath` | 无 | 音频或带音轨视频的路径；相对路径按 job 根目录解析，混音时必须位于 Director Master 工作区内 |
| `sourceDuration` | 自动探测 | 素材完整时长；迁移时优先使用 manifest 的 `ttsDuration` |
| `text` | 无 | 字幕文本，仅 `dialogue` 轨道用于生成 SRT |

同一轨道内片段不能重叠；不同轨道可以自由叠放，这正是分层混音的基础。

## FFmpeg 滤镜映射

每个可发声片段先独立处理：

```text
aresample/aformat
  → atrim=start=<offset>
  → atempo（素材余量明显长于 duration 时自动加速）
  → apad + atrim（补齐或裁到 duration）
  → volume=<clip.gain>
  → afade（fadeIn / fadeOut）
  → adelay=<clip.start>
```

随后同一轨道的片段以 `amix=normalize=0` 合成，再应用整轨参数：

```text
volume=<track.volume>
pan=stereo|c0=<L>*c0|c1=<R>*c1
```

`pan=0` 时 `L=1`、`R=1`；`pan=-1` 时 `L=1`、`R=0`；`pan=1` 时 `L=0`、`R=1`。中间值线性过渡。
当前 FFmpeg 的表达式解析器要求系数写在声道名之前，因此实现使用上述等价写法。

最后将静音底轨与所有可发声轨道合成：

```text
amix=inputs=<底轨 + 可发声轨道数>:duration=first:dropout_transition=0:normalize=0
  → alimiter=limit=0.95:level=false:latency=true
```

`alimiter` 用于防止叠加后削波，并补偿限制器延迟。所有 `muted`、`solo` 和片段 `mute` 都在构建滤镜图前处理，避免无意义的解码输入。

## 旧 job 迁移

`migrateScriptToTimeline(script, manifest, options)` 是纯函数：

1. 按 `speaker` 建立 `dialogue` 轨道，保持首次出现的顺序。
2. 每条有 TTS 路径的 `script.segments[]` 转成一个 clip，保留 `Lxxx` 编号、`speaker`、`start` 和文本。
3. `duration` 默认取旧时间窗 `end - start`，`sourceDuration` 取 manifest 的 `ttsDuration`，从而保持旧的自动变速和截断行为。
4. 如果传入可用的分离伴奏，则增加一条 `bed` 轨道；`separation=skipped` 时不保留静音伴奏文件。
5. `options.preserveOriginalSlots=false` 可改用 TTS 实际时长迁移，面向后续希望的宽松时间轴。

文件读写、探测和保存仍由 `redub-pipeline.mjs` 等调用方完成，迁移与校验函数本身没有文件系统副作用。

## 校验

`validateTimeline()` 返回错误数组，不直接抛异常。错误包含稳定的 `code`、中文 `message`、字段 `location`，以及可用的 `trackId`、`clipId`。当前检查：

- 轨道与片段 ID 重复、轨道类型非法。
- `trackId` 引用不一致、缺失音频路径、缺失 source。
- 负起点、非正时长、负 offset/gain/fade、非法声像。
- 淡入淡出超过片段长度、offset 超过素材时长。
- 片段超出时间轴总时长。
- 同一轨道内时间重叠。
