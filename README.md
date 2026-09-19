# Director Master

MiniMax H3 Director 的本地多段视频工作台。它把素材库、每段引用索引、H3 提示词、连续性审核、ComfyUI 队列和 Agent CLI 放进一个干净的导演界面。

标准生产顺序固定为：`$screenwriter` 优化剧本 → 用户审核批准并覆盖权威剧本 → `$shotlist-builder` 生成分镜与 MiniMax H3 提示词 → Director Master 校验素材引用 → ComfyUI 出片。详见 [docs/PRODUCTION_WORKFLOW.md](docs/PRODUCTION_WORKFLOW.md)。

## 启动

在 D:\HermesWorkspace\directorMaster 执行 npm run dev，然后打开 http://localhost:3000。

应用只检测并复用已经运行的本机 ComfyUI；不会创建、重启或关闭 ComfyUI。当前端口会在右上角和任务中心显示。

## 页面

- 时间轴：无限网格画布、分段卡、时长/帧数、素材缩略图、连续性和提交前审核。
- 素材库：默认扫描 EP02 归档素材，可配置并持久化当前工作区；按人物/道具/场景/首帧/声音/视频统计，支持批量添加、单个删除、管理勾选和批量删除。所有文件操作限定在当前工作区内；点击卡片仍用于加入当前片段并自动生成引用索引。
- 任务中心：展示素材上传、工作流编译、排队、生成/拼接、保存或节点错误。
- 设置：项目根目录、默认工作流、分辨率档、FPS、steps、seed、CFG 和拼接参数；不包含二采放大。

用户只需要写镜头提示词。素材描述来自素材库，并自动生成该片段独立的 Picture/Audio 映射和 H3 六段式提示词。故事板默认只用于镜头规划，不自动选为生成参考。

## Agent CLI

- node cli/director-master.mjs discover
- node cli/director-master.mjs index --root "D:\HermesWorkspace\ai小说\红绳\05-workflow\ep02\归档素材"
- node cli/director-master.mjs prepare --spec examples/redstring-smoke.json --out redstring-smoke-api.json
- node cli/director-master.mjs run --spec examples/redstring-smoke.json --watch
- node cli/director-master.mjs status --id PROMPT_ID

项目 JSON 的每个 segment 包含 durationSec、shotPrompt、negativePrompt、continuityFromPrev 和 assets。每个 asset 传入 path、mediaType、description；也可直接提供 finalPrompt。

## 验证

依次执行 npm run lint、npm run build 和 CLI prepare。默认工作流为 F:\Work-Fisher纯净包2026.8.7\ComfyUI\user\default\workflows\minimax_h3_director_二采_加速_红绳.json。当前图内没有 Refine/Upscale 节点；工具默认 0.6 MP、1056×608、4 steps、Euler/Simple 和 4 步加速 LoRA。

真实冒烟测试必须先由用户启动 ComfyUI，再执行 run；未发现实例时 CLI 会明确失败且绝不启动新进程。

详细文档见 docs/PRODUCT_REQUIREMENTS.md、docs/ARCHITECTURE.md 和 docs/ITERATION_PLAN.md。
