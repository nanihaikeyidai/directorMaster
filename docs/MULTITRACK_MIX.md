# 台词重配多轨时间轴与混音

本页说明多轨时间轴的数据模型、FFmpeg 混音映射和 `/redub` 编辑界面；已有的听写、参考音色和 TTS 阶段保持不变。

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

## 多轨编辑界面

打开 `/redub` 后，页面会从 `workspace/dialogue-redub` 读取任务列表，并加载所选任务的 `timeline.json` 与 `tts/manifest.json`。旧任务没有 `timeline.json` 时，页面只显示由 `script.json` 和 manifest 迁移出的内存时间轴；只有点击保存或重新合成后才会写入新的时间轴文件。

轨道控制区从左到右显示轨道名称、类型、音量、声像、`M` 静音与 `S` 独奏。任意轨道开启独奏后，只有独奏轨参与浏览器试听和最终混音；轨道静音和片段静音会在调度音频前排除。时间轴区域按真实秒数比例绘制片段，音频峰值通过浏览器解码 TTS WAV 后绘制到每块 Canvas 波形中，并按 `devicePixelRatio` 缩放以保持清晰。

常用操作：

1. 点击空白位置或标尺跳转播放头；拖动白色播放头进行精确定位。
2. 拖动片段主体移动 `start`；拖动左右边缘修改 `duration`，拖左边缘时同步修改 `offset`，保证时间轴入点与素材内部入点一致。
3. 点击片段单选，`Ctrl`/`⌘` 点击增减选择；从轨道空白处拖动可框选。拖动任一已选片段会移动整组选择。
4. 使用工具栏滑块、按钮，或 `Ctrl`/`⌘` + 滚轮进行 100%–2400% 缩放。
5. `Space` 播放或暂停多轨浏览器试听；`Ctrl+Z` 撤销，`Ctrl+Shift+Z` 重做，历史最多保留 50 步。
6. 单选片段后可直接修改台词文本。“试听当前 TTS”只读取 manifest 中已有 WAV；“按文本重新合成”会先保存时间轴，再只重新合成该 clip，并把 manifest 路径写回当前片段。
7. 顶部“保存时间轴”调用严格校验。同轨重叠在编辑阶段只显示红色预警，不会阻止继续拖动；保存和导出阶段仍会拒绝重叠、越界、offset 超长等非法结构，并逐条显示后端返回的结构化错误。

页面顶部的“混音并导出”会调用阶段一的多轨混音器，生成 `audio/mixed.wav`、字幕 `subs/new.srt` 与最终 MP4。所有 API 请求都使用 `/api/local/redub/*`，只允许同源页面访问；片段音频路径不接受客户端任意值，后端只从当前任务的 TTS manifest 或服务端已有的受信时间轴恢复。
