# 架构说明

## 组成

- React/Vinext 前端：时间线、素材库、审核器、任务中心和设置。
- Vite 本地桥：扫描授权工作区、读取本地媒体、发现 ComfyUI、代理上传与队列 API。桥不会启动 ComfyUI。
- director-core：前端和 CLI 共用的帧数、索引、提示词与 API 工作流补丁逻辑。
- CLI：Agent/终端入口。
- IndexedDB + localStorage：保存上传素材、描述、画布布局和项目草稿；本地项目索引由桥实时返回。
- 工作区节点图：`workspace/production/ep02/director-project.json` 保存素材节点、全局通用提示词节点和素材到 SEG 的连接，前端修改后防抖落盘。

## 安全边界

- 文件接口只扫描 D:\HermesWorkspace；模板读取额外允许用户明确指定的 ComfyUI workflows 目录。
- ComfyUI 目标必须由本机进程发现或为 loopback 地址。
- 不读取或输出凭据，不调用 RunningHub，不创建 ComfyUI 子进程。

## H3 数据规则

- 每个素材节点维护 9 个 imageSlots 和 3 个 audioSlots；按固定槽位顺序编译为 Picture/Audio 索引，槽位不可在已占用项之间留空。
- 连接表只保留 `reference`：同一 SEG 的新素材连接替换旧连接，上游素材节点可扇出到多个 SEG。旧版 `common` 连接在加载时迁移删除。
- 画布中的所有通用提示词节点按顺序合并成一个全局 CommonPrompt，自动编译进全部 SEG；剧本是全局制作上下文，不参与节点连线。
- 成片不属于无限画布节点，按片段顺序投影到固定 `output-rail`，不会写入连接表或画布布局。
- 未连接节点的旧项目仍回退到片段 pictureIds/audioIds 或已归档生产引用，保持兼容。
- 主提示词固定六段：subject_definitions、summary、retention_analysis、detailed_description、overall_soundscape、non_diegetic_music。
- negativePrompt 同步到时间线及任务类型 workspace 的对应片段。
- 第二段起默认 continuityFromPrev=true；首段必须为 false。
- 当前生产基线只含首采：0.6 MP、1056×608、4 steps、Euler/Simple、4 步加速 LoRA + TESpeed；不编译二采放大节点。
