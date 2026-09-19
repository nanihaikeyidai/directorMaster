/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element, react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { AssetCategory, LibraryAsset } from "../lib/asset-db";
import {
  framesForDuration,
  patchDirectorProject,
  uiWorkflowToApi,
  validateDirectorReferences,
  type DirectorSettings,
} from "../lib/workflow";

type PageId = "timeline" | "library" | "assistant" | "jobs" | "settings";
type SegmentStatus =
  "draft" | "ready" | "queued" | "running" | "done" | "error";
type Segment = {
  id: string;
  sequenceNo: number;
  title: string;
  shotPrompt: string;
  finalPrompt?: string;
  negativePrompt: string;
  pictureIds: string[];
  audioIds: string[];
  durationSec: number;
  enabled: boolean;
  continuityFromPrev: boolean;
  status: SegmentStatus;
};
type ComfyState = {
  found: boolean;
  url?: string;
  port?: number;
  pid?: number;
  error?: string;
};
type JobState = {
  stage: string;
  percent: number;
  promptId?: string;
  error?: string;
  output?: string;
};
type SkillJobState = {
  stage: string;
  kind?: "screenplay" | "shotlist";
  skill?: string;
  command?: string;
  markdownPath?: string;
  error?: string;
};
type VideoResult = {
  sequenceNo: number;
  fileName: string;
  path?: string;
  size?: number;
  createdAt?: string;
  promptId?: string;
  parameters?: {
    width?: number;
    height?: number;
    fps?: number;
    durationSeconds?: number;
  };
  comfyOutput?: { filename: string; subfolder?: string; type?: string };
};
type StoryboardImage = { name: string; path: string; size?: number };
type ProductionReference = {
  path: string;
  name: string;
  fileName: string;
  mediaType: "image" | "audio" | "video";
  description?: string;
};
type ProductionPrompt = {
  finalPrompt: string;
  localizedPrompt?: string;
  summary?: string;
  shotPrompt?: string;
  references?: ProductionReference[];
};
type ReferenceNode = {
  id: string;
  title: string;
  imageSlots: Array<string | null>;
  audioSlots: Array<string | null>;
  enabled?: boolean;
};
type CommonPromptNode = {
  id: string;
  title: string;
  visualStyle: string;
  soundRules: string;
  globalRules: string;
  negativePrompt: string;
  enabled?: boolean;
};
type GraphConnection = {
  id: string;
  type: "reference" | "common";
  sourceId: string;
  targetId: string;
};
type ConnectionDraft = {
  sourceId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type SlotPickerState = {
  nodeId: string;
  kind: "image" | "audio";
  index: number;
} | null;
type CanvasNodeLayout = { x: number; y: number; width: number; height: number };
type CanvasView = { x: number; y: number; scale: number };
type PromptPartOverrides = Record<
  string,
  { material?: string; common?: string }
>;
type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type CanvasInteraction =
  | { kind: "pan"; startX: number; startY: number; origin: CanvasView }
  | {
      kind: "move";
      key: string;
      startX: number;
      startY: number;
      origin: CanvasNodeLayout;
      scale: number;
    }
  | {
      kind: "resize";
      key: string;
      direction: ResizeDirection;
      startX: number;
      startY: number;
      origin: CanvasNodeLayout;
      scale: number;
    };

const WORKSPACE_ROOT = "D:\\HermesWorkspace\\directorMaster";
const PROJECT_ROOT = WORKSPACE_ROOT + "\\workspace\\assets";
const LEGACY_PROJECT_ROOT =
  "D:\\HermesWorkspace\\ai小说\\红绳\\05-workflow\\ep02\\归档素材";
const TEMPLATE_PATH =
  WORKSPACE_ROOT + "\\workspace\\workflows\\minimax_h3_director_default.json";
const SCREENPLAY_PATH =
  WORKSPACE_ROOT + "\\ai小说\\红绳\\05-workflow\\ep02\\EP02_雨幕余温.md";
const PRODUCTION_ROOT = WORKSPACE_ROOT + "\\workspace\\production\\ep02";
const SCREENPLAY_STORAGE_KEY = "director-master-workspace-ep02-screenplay";
const SCRIPT_NODE_ID = "__episode-script";
const CANVAS_MIN_SCALE = 0.35;
const CANVAS_MAX_SCALE = 1.8;
const resizeDirections: ResizeDirection[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];
const NEGATIVE =
  "bad video, photorealistic, live action, 3D render, identity drift, face change, costume change, extra character, duplicated subject, malformed hands, duplicated limbs, teleportation, reset environment, readable text, subtitles, watermark, logo, UI, background music";
const settingsDefault: DirectorSettings = {
  taskType: "r2v",
  frameRate: 24,
  width: 1056,
  height: 608,
  megapixels: 0.6,
  refMaxSize: 1056,
  cfg: 1,
  seed: 666,
  steps: 4,
  sampler: "euler",
  scheduler: "simple",
  shiftVideo: 6,
  shiftAudio: 3,
  audioMode: "source",
  exportMode: "all",
  continuityEnabled: true,
  continuityOverlapFrames: 22,
  runSelectEnabled: false,
  clearVram: true,
  exportSourceImages: true,
};
const knownDescriptions: Record<string, string> = {
  陆沉_人设:
    "Lu Chen, an eighteen-year-old tall lean male student with short tousled black hair, a white school shirt and dark trousers; preserve his youthful face and stable anime identity, ignoring any readable label in the reference sheet.",
  林晓_人设:
    "Lin Xiao, a young female student with a dark-brown high ponytail, long red ribbon, white-and-navy school uniform and red cord bracelet; preserve her face, proportions and restrained expression.",
  黑翼怪兽:
    "An adult-sized black-winged humanoid creature with a charcoal body, broad black membrane wings, hooked claws, pointed ears and established dark-red eyes.",
  雨天教室:
    "The architectural and lighting reference for a rainy classroom: cold blue-grey light and wet windows; the target room is evacuated and damaged with a shattered window, overturned desks, paper, glass and rainwater.",
  陆沉: "Young male voice reference for Lu Chen; transfer timbre only, never source words, timing, emotion, noise or recording artifacts.",
};
const voiceDescriptions: Record<string, string> = {
  安娜: "Anna voice-timbre reference: a cool, restrained young female voice with clear diction. Transfer vocal identity only, never source words, timing, emotion, pauses, noise or recording artifacts.",
  李想: "Li Xiang voice-timbre reference: an energetic young male student voice with a natural conversational texture. Transfer vocal identity only, never source content or recording artifacts.",
  林晓: "Lin Xiao voice-timbre reference: a soft young female voice, emotionally restrained and capable of a slight tremble under stress. Transfer vocal identity only.",
  陆沉: "Lu Chen voice-timbre reference: a calm, low young male voice with clear diction and restrained emotion. Transfer vocal identity only.",
  旁白: "Narrator voice-timbre reference. Use only when narration is explicitly written in the shot prompt; never infer narration from descriptive prose.",
  苏婉: "Su Wan voice-timbre reference: a natural young female student voice, warm and conversational, with controlled tension when frightened. Transfer vocal identity only.",
  王老师:
    "Teacher Wang voice-timbre reference: a mature adult female voice, composed, clear and authoritative without sounding harsh. Transfer vocal identity only.",
  校长: "Principal voice-timbre reference: a mature adult voice with institutional authority, capable of restrained urgency. Transfer vocal identity only.",
};
const initialSegment: Segment = {
  id: "redstring-ep02-s04",
  sequenceNo: 4,
  title: "EP02 · 片段04",
  shotPrompt: "",
  negativePrompt: NEGATIVE,
  pictureIds: [],
  audioIds: [],
  durationSec: 15,
  enabled: true,
  continuityFromPrev: false,
  status: "draft",
};
const initialCanvasLayout: Record<string, CanvasNodeLayout> = {
  [SCRIPT_NODE_ID]: { x: 80, y: 90, width: 390, height: 440 },
  [initialSegment.id]: { x: 590, y: 170, width: 285, height: 280 },
};

function defaultSegmentLayout(index: number): CanvasNodeLayout {
  return { x: 590 + index * 380, y: 170, width: 285, height: 280 };
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function describe(asset: LibraryAsset) {
  if (asset.mediaType === "audio")
    return (
      asset.description ||
      voiceDescriptions[asset.name] ||
      "Voice-timbre reference; transfer vocal identity only and never copy source words, timing, emotion, background noise or recording artifacts."
    );
  const key = Object.keys(knownDescriptions).find((name) =>
    asset.name.includes(name),
  );
  return (
    asset.description ||
    (key
      ? knownDescriptions[key]
      : "Preserve the stable identity, appearance, environment or timbre shown by this reference.")
  );
}
function composePrompt(
  segment: Segment,
  pictures: LibraryAsset[],
  audios: LibraryAsset[],
  common?: CommonPromptNode,
  overrides?: { material?: string; common?: string },
) {
  const isKeyframe = (asset: LibraryAsset, index: number) =>
    index === 0 &&
    (asset.category === "首帧" || /首帧|first.?frame/i.test(asset.path || ""));
  const taskTypes = [
    ...(pictures.some(isKeyframe) ? ["keyframe completion"] : []),
    ...(pictures.length ? ["reference generation"] : []),
    ...(audios.length ? ["audio reference"] : []),
  ];
  const style =
    common?.visualStyle ||
    "Create a high-detail 2D anime cinematic sequence. Keep selected identities and spatial roles stable.";
  const sound =
    common?.soundRules ||
    "Use continuous diegetic ambience and action sounds appropriate to the shot. Keep dialogue intelligible and single-speaker; never copy source words or recording noise.";
  const rules =
    common?.globalRules ||
    "No subtitles, captions, speech bubbles, UI, logo or watermark.";
  const generatedMaterial = [
    "subject_definitions:",
    ...pictures.map(
      (asset, index) =>
        "<Picture " +
        (index + 1) +
        "> (" +
        asset.category +
        ") is " +
        describe(asset),
    ),
    ...audios.map(
      (asset, index) => "<Audio " + (index + 1) + "> is " + describe(asset),
    ),
  ].join("\n");
  const materialPrompt = overrides?.material?.trim() || generatedMaterial,
    commonPrompt = overrides?.common?.trim();
  return [
    materialPrompt,
    "",
    "summary:",
    "[" +
      (taskTypes.length ? taskTypes.join(" + ") : "text generation") +
      "] Create a " +
      segment.durationSec +
      "-second 16:9 sequence. The user-authored shot direction below is authoritative.",
    "",
    "retention_analysis:",
    ...pictures.map((asset, index) =>
      isKeyframe(asset, index)
        ? "<Picture " +
          (index + 1) +
          "> ([Shot 1] first frame): fully_preserved - begin exactly from this frame and preserve its composition, blocking, lighting and screen direction."
        : "<Picture " +
          (index + 1) +
          "> (" +
          asset.name +
          "): fully_preserved - preserve its described stable identity and use it only when required by the shot.",
    ),
    ...audios.map(
      (asset, index) =>
        "<Audio " +
        (index + 1) +
        "> (" +
        asset.name +
        "): reference - transfer timbre only for matching target dialogue.",
    ),
    "",
    "detailed_description:",
    commonPrompt || style,
    segment.shotPrompt,
    commonPrompt ? "" : rules,
    "",
    "overall_soundscape:",
    commonPrompt
      ? "Follow the sound and music rules in project_common_prompt above."
      : sound,
    "",
    "non_diegetic_music:",
    "N/A",
  ].join("\n");
}

function composeReferencePrompt(pictures: LibraryAsset[], audios: LibraryAsset[]) {
  return [
    "subject_definitions:",
    ...pictures.map((asset, index) =>
      `<Picture ${index + 1}> (${asset.category}) is ${describe(asset)}`,
    ),
    ...audios.map((asset, index) =>
      `<Audio ${index + 1}> is ${describe(asset)}`,
    ),
  ].join("\n");
}

function composeCommonPrompt(common?: CommonPromptNode) {
  if (!common) return "";
  return [
    "project_common_prompt:",
    "visual_style:",
    common.visualStyle,
    "",
    "sound_rules:",
    common.soundRules,
    "",
    "global_rules:",
    common.globalRules,
    "",
    "negative_prompt:",
    common.negativePrompt,
  ].join("\n");
}
function hasSlotGap(slots: Array<string | null>) {
  let reachedEmpty = false;
  for (const value of slots) {
    if (!value) reachedEmpty = true;
    else if (reachedEmpty) return true;
  }
  return false;
}
function promptFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
}
function proxyUrl(base: string, endpoint: string) {
  return (
    "/api/local/comfyui/proxy?base=" +
    encodeURIComponent(base) +
    "&endpoint=" +
    encodeURIComponent(endpoint)
  );
}
function migrateAssetId(id: string) {
  const prefix = "local:";
  const lower = id.toLowerCase();
  const legacy = (prefix + LEGACY_PROJECT_ROOT).toLowerCase();
  return lower.startsWith(legacy)
    ? prefix +
        (
          PROJECT_ROOT + id.slice((prefix + LEGACY_PROJECT_ROOT).length)
        ).toLowerCase()
    : id;
}

export default function Home() {
  const [episode,setEpisode]=useState<string|null>(null);
  useEffect(()=>{
    const queryEpisode=new URLSearchParams(location.search).get('episode');
    const recentEpisode=localStorage.getItem('director-master-last-episode');
    const selected=queryEpisode||recentEpisode||'ep03';
    const normalized=/^ep\d{2}$/.test(selected)?selected:'ep03';
    localStorage.setItem('director-master-last-episode',normalized);
    queueMicrotask(()=>setEpisode(normalized));
  },[]);
  return episode?<EpisodeCanvas key={episode} episode={episode}/>:<main>正在打开本集画布…</main>;
}
function EpisodeCanvas({episode}:{episode:string}) {
  const PRODUCTION_ROOT=WORKSPACE_ROOT+'\\workspace\\production\\'+episode;
  const PROJECT_ROOT=episode==='ep02'?WORKSPACE_ROOT+'\\workspace\\assets':PRODUCTION_ROOT+'\\assets';
  const SCREENPLAY_PATH=episode==='ep02'?WORKSPACE_ROOT+'\\workspace\\screenplays\\EP02_雨幕余温.md':PRODUCTION_ROOT+'\\剧本.md';
  const SCREENPLAY_STORAGE_KEY='director-master-workspace-'+episode+'-screenplay';
  const graphUrl='/api/local/project/graph?episode='+episode;
  const storageKey=episode==='ep02'?'director-master-v3':'director-master-v3-'+episode;
  useEffect(()=>{localStorage.setItem('director-master-last-episode',episode);},[episode]);
  const [provider, setProvider] = useState('local');
  const [cloudSteps, setCloudSteps] = useState(8);
  const [cloudMP, setCloudMP] = useState(0.6);
  useEffect(() => {
    const saved = localStorage.getItem('director-cloud-settings');
    if(saved) { try { const value=JSON.parse(saved);setProvider(value.provider||'local');setCloudSteps(value.steps||8);setCloudMP(value.megapixels||0.6); } catch {} }
    const id=localStorage.getItem('director-cloud-job-'+episode);
    if(id) void monitorCloud(id);
    else void fetch('/api/local/runninghub/jobs').then(r=>r.json()).then((jobs:any)=>{const match=Array.isArray(jobs)&&jobs.find((j:any)=>(j.episode||'ep02')===episode);if(match)void monitorCloud(match.id);}).catch(()=>{});
  }, []);
  function saveCloud(provider: string, steps: number, megapixels: number) {
    setProvider(provider);setCloudSteps(steps);setCloudMP(megapixels);
    localStorage.setItem('director-cloud-settings',JSON.stringify({provider,steps,megapixels}));
  }
  async function monitorCloud(id: string) {
    for(let attempt=0;attempt<1440;attempt++) {
      try {
        const response=await fetch('/api/local/runninghub/jobs?id='+encodeURIComponent(id));
        const current:any=await response.json();
        if(!response.ok) throw new Error(current.error||'云端状态查询失败');
        setJob({stage:current.stage,percent:current.percent,promptId:current.taskId,error:current.error,output:current.outputs?.map((o:any)=>o.path).join('\n')});
        if(current.status==='SUCCESS') {
          const primary=current.outputs[0],sequenceNo=current.sequenceNos[0]||7;
          setVideoResults((old)=>({...old,[sequenceNo]:{...primary,sequenceNo,promptId:current.taskId,parameters:{width:current.settings.width,height:current.settings.height,fps:24}}}));
          setSegments((old)=>old.map(s=>current.sequenceNos.includes(s.sequenceNo)?{...s,status:'done'}:s));
          localStorage.removeItem('director-cloud-job-'+episode);setPage('timeline');return;
        }
        if(current.status==='FAILED') {setSegments(old=>old.map(s=>current.sequenceNos.includes(s.sequenceNo)?{...s,status:'error'}:s));localStorage.removeItem('director-cloud-job-'+episode);return;}
      } catch(error) { setJob(old=>({...old,stage:'连接暂时中断，将重试',error:String(error)})); }
      await new Promise(resolve=>window.setTimeout(resolve,5000));
    }
  }
  const [page, setPage] = useState<PageId>("timeline");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [segments, setSegments] = useState<Segment[]>([initialSegment]);
  const [activeId, setActiveId] = useState(initialSegment.id);
  const [filter, setFilter] = useState<"全部" | AssetCategory>("全部");
  const [search, setSearch] = useState("");
  const [comfy, setComfy] = useState<ComfyState>({ found: false });
  const [job, setJob] = useState<JobState>({ stage: "等待提交", percent: 0 });
  const [settings, setSettings] = useState(settingsDefault);
  const [projectRoot, setProjectRoot] = useState(PROJECT_ROOT);
  const [templatePath, setTemplatePath] = useState(TEMPLATE_PATH);
  const [notice, setNotice] = useState("");
  const [episodeScript, setEpisodeScript] = useState("");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [manageSelectedIds, setManageSelectedIds] = useState<string[]>([]);
  const [materialDetailId, setMaterialDetailId] = useState<string | null>(null);
  const [addCategory, setAddCategory] = useState<AssetCategory>("人物");
  const [libraryBusy, setLibraryBusy] = useState("");
  const [skillBrief, setSkillBrief] = useState("");
  const [platformConfirmed, setPlatformConfirmed] = useState(true);
  const [skillJob, setSkillJob] = useState<SkillJobState>({
    stage: "等待创建任务",
  });
  const [screenplayDraft, setScreenplayDraft] = useState("");
  const [screenplayApproved, setScreenplayApproved] = useState(false);
  const [screenplayReviewBusy, setScreenplayReviewBusy] = useState(false);
  const [videoResults, setVideoResults] = useState<Record<number, VideoResult>>(
    {},
  );
  const [storyboards, setStoryboards] = useState<
    Record<number, StoryboardImage[]>
  >({});
  const [productionPrompts, setProductionPrompts] = useState<
    Record<number, ProductionPrompt>
  >({});
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(
    null,
  );
  const [generationPickerOpen, setGenerationPickerOpen] = useState(false);
  const [generationSelection, setGenerationSelection] = useState<string[]>([]);
  const [referenceNodes, setReferenceNodes] = useState<ReferenceNode[]>([]);
  const [commonPromptNodes, setCommonPromptNodes] = useState<
    CommonPromptNode[]
  >([]);
  const [graphConnections, setGraphConnections] = useState<GraphConnection[]>(
    [],
  );
  const [pendingConnection, setPendingConnection] = useState<{
    type: "reference";
    sourceId: string;
  } | null>(null);
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [slotPicker, setSlotPicker] = useState<SlotPickerState>(null);
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [graphUpdatedAt, setGraphUpdatedAt] = useState("");
  const [promptPartOverrides, setPromptPartOverrides] =
    useState<PromptPartOverrides>({});
  const slotDragRef = useRef<{
    nodeId: string;
    kind: "image" | "audio";
    index: number;
  } | null>(null);
  const descriptionSaveTimersRef = useRef<Record<string, number>>({});
  const materialClickTimerRef = useRef<number | null>(null);
  const [canvasLayout, setCanvasLayout] =
    useState<Record<string, CanvasNodeLayout>>(initialCanvasLayout);
  const [canvasView, setCanvasView] = useState<CanvasView>({
    x: 20,
    y: 20,
    scale: 1,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasInteractionRef = useRef<CanvasInteraction | null>(null);
  const canvasViewRef = useRef(canvasView);
  const cardMovedRef = useRef(false);
  const active = segments.find((item) => item.id === activeId) || segments[0];
  const enabledCommonPromptNodes = commonPromptNodes.filter(
    (node) => node.enabled !== false,
  );
  const globalCommonPrompt: CommonPromptNode | undefined =
    enabledCommonPromptNodes.length
      ? {
          id: "__global-common",
          title:
            enabledCommonPromptNodes.length === 1
              ? enabledCommonPromptNodes[0].title
              : enabledCommonPromptNodes.length + " 个全局通用提示词",
          visualStyle: enabledCommonPromptNodes
            .map((node) => node.visualStyle.trim())
            .filter(Boolean)
            .join("\n"),
          soundRules: enabledCommonPromptNodes
            .map((node) => node.soundRules.trim())
            .filter(Boolean)
            .join("\n"),
          globalRules: enabledCommonPromptNodes
            .map((node) => node.globalRules.trim())
            .filter(Boolean)
            .join("\n"),
          negativePrompt: enabledCommonPromptNodes
            .map((node) => node.negativePrompt.trim())
            .filter(Boolean)
            .join(", "),
          enabled: true,
        }
      : undefined;
  const activeReferenceConnection = graphConnections.find(
    (connection) =>
      connection.type === "reference" && connection.targetId === active.id,
  );
  const activeReferenceNode = referenceNodes.find(
    (node) =>
      node.id === activeReferenceConnection?.sourceId && node.enabled !== false,
  );
  const activeCommonNode = globalCommonPrompt;
  const pictures = activeReferenceNode
    ? (activeReferenceNode.imageSlots
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[])
    : (active.pictureIds
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[]);
  const audios = activeReferenceNode
    ? (activeReferenceNode.audioSlots
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[])
    : (active.audioIds
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[]);
  const prompt =
    activeReferenceNode || activeCommonNode || promptPartOverrides[active.id]
      ? composePrompt(
          active,
          pictures,
          audios,
          activeCommonNode,
          promptPartOverrides[active.id],
        )
      : active.finalPrompt || composePrompt(active, pictures, audios);
  const promptVersion = promptFingerprint(prompt);
  const totalFrames = segments.reduce(
    (sum, item) =>
      sum + framesForDuration(item.durationSec, settings.frameRate),
    0,
  );

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    let initialRoot = PROJECT_ROOT;
    if (saved)
      try {
        const data = JSON.parse(saved);
        if (data.segments?.length) {
          const migrated = data.segments.map(
            (item: Segment, index: number) => ({
              ...item,
              sequenceNo: item.sequenceNo || index + 4,
              title:
                !item.sequenceNo && index === 0 ? "EP02 · 片段04" : item.title,
              pictureIds: (item.pictureIds || []).map(migrateAssetId),
              audioIds: (item.audioIds || []).map(migrateAssetId),
            }),
          );
          setSegments(migrated);
          setActiveId(data.activeId || migrated[0].id);
        }
        if (data.settings)
          setSettings({ ...settingsDefault, ...data.settings });
        if (episode==='ep02' && data.projectRoot?.startsWith(WORKSPACE_ROOT)) {
          initialRoot = data.projectRoot;
          setProjectRoot(data.projectRoot);
        }
        if (data.templatePath?.startsWith(WORKSPACE_ROOT))
          setTemplatePath(data.templatePath);
        if (data.canvasLayout) setCanvasLayout(data.canvasLayout);
        if (data.canvasView) setCanvasView(data.canvasView);
        if (data.referenceNodes) setReferenceNodes(data.referenceNodes);
        if (data.commonPromptNodes)
          setCommonPromptNodes(data.commonPromptNodes);
        if (data.graphConnections)
          setGraphConnections(
            data.graphConnections.filter(
              (connection: GraphConnection) => connection.type === "reference",
            ),
          );
        if (data.promptPartOverrides)
          setPromptPartOverrides(data.promptPartOverrides);
      } catch {}
    void refreshComfy();
    void indexProject(initialRoot);
    void loadScreenplay();
    if(episode==='ep02') void loadScreenplayStatus();
    void loadVideoResults();
    void loadStoryboards();
    void loadGraph();
    if (!saved) void loadWorkflowDefaults();
    setProjectLoaded(true);
  }, []);
  useEffect(() => {
    if (projectLoaded)
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          segments,
          activeId,
          settings,
          projectRoot,
          templatePath,
          canvasLayout,
          canvasView,
          referenceNodes,
          commonPromptNodes,
          graphConnections,
          promptPartOverrides,
        }),
      );
  }, [
    segments,
    activeId,
    settings,
    projectRoot,
    templatePath,
    canvasLayout,
    canvasView,
    referenceNodes,
    commonPromptNodes,
    graphConnections,
    promptPartOverrides,
    projectLoaded,
  ]);
  useEffect(() => {
    if (scriptLoaded)
      localStorage.setItem(SCREENPLAY_STORAGE_KEY, episodeScript);
  }, [episodeScript, scriptLoaded]);
  useEffect(() => {
    if (!graphLoaded) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch(graphUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            referenceNodes,
            commonPromptNodes,
            connections: graphConnections,
            promptPartOverrides,
            segments,
            canvasLayout,
            baseUpdatedAt: graphUpdatedAt,
          }),
        });
        const result = await response.json();
        if (response.status === 409) {
          setGraphLoaded(false);
          flash("工作区已由其他操作更新，正在重新载入最新画布");
          await loadGraph();
          return;
        }
        if (!response.ok) throw new Error(result.error || "画布保存失败");
        if (result.updatedAt) setGraphUpdatedAt(result.updatedAt);
      })().catch((error) =>
        console.warn(error instanceof Error ? error.message : error),
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    referenceNodes,
    commonPromptNodes,
    graphConnections,
    promptPartOverrides,
    segments,
    canvasLayout,
    graphLoaded,
  ]);
  useEffect(() => {
    if (!expandedSegmentId) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedSegmentId(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expandedSegmentId]);
  useEffect(() => {
    if (!generationPickerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGenerationPickerOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [generationPickerOpen]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (event.key === "Escape") {
        setPendingConnection(null);
        setConnectionDraft(null);
        setSelectedConnectionId(null);
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedConnectionId
      ) {
        event.preventDefault();
        setGraphConnections((current) =>
          current.filter(
            (connection) => connection.id !== selectedConnectionId,
          ),
        );
        setSelectedConnectionId(null);
        flash("素材连线已删除");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedConnectionId]);
  useEffect(() => {
    if (!pendingConnection) return;
    const finish = (event: PointerEvent) => finishConnectionDrag(event);
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [pendingConnection, segments, canvasLayout]);
  useEffect(() => {
    canvasViewRef.current = canvasView;
  }, [canvasView]);
  useEffect(() => {
    setCanvasLayout((current) => {
      let changed = !current[SCRIPT_NODE_ID];
      const next = { ...current };
      if (!next[SCRIPT_NODE_ID])
        next[SCRIPT_NODE_ID] = initialCanvasLayout[SCRIPT_NODE_ID];
      segments.forEach((segment, index) => {
        if (!next[segment.id]) {
          next[segment.id] = defaultSegmentLayout(index);
          changed = true;
        }
      });
      referenceNodes.forEach((node, index) => {
        if (!next[node.id]) {
          next[node.id] = {
            x: 80,
            y: 610 + index * 500,
            width: 500,
            height: 430,
          };
          changed = true;
        }
      });
      commonPromptNodes.forEach((node, index) => {
        if (!next[node.id]) {
          next[node.id] = {
            x: 620 + index * 410,
            y: 610,
            width: 370,
            height: 330,
          };
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [segments, referenceNodes, commonPromptNodes]);
  useEffect(() => {
    function move(event: PointerEvent) {
      const interaction = canvasInteractionRef.current;
      if (!interaction) return;
      if (
        Math.abs(event.clientX - interaction.startX) > 2 ||
        Math.abs(event.clientY - interaction.startY) > 2
      )
        cardMovedRef.current = true;
      if (interaction.kind === "pan") {
        setCanvasView({
          ...interaction.origin,
          x: interaction.origin.x + event.clientX - interaction.startX,
          y: interaction.origin.y + event.clientY - interaction.startY,
        });
        return;
      }
      const dx = (event.clientX - interaction.startX) / interaction.scale,
        dy = (event.clientY - interaction.startY) / interaction.scale;
      if (interaction.kind === "move") {
        setCanvasLayout((current) => ({
          ...current,
          [interaction.key]: {
            ...interaction.origin,
            x: interaction.origin.x + dx,
            y: interaction.origin.y + dy,
          },
        }));
        return;
      }
      const direction = interaction.direction,
        origin = interaction.origin,
        minWidth = interaction.key === SCRIPT_NODE_ID ? 320 : 260,
        minHeight = interaction.key === SCRIPT_NODE_ID ? 300 : 230;
      let x = origin.x,
        y = origin.y,
        width = origin.width,
        height = origin.height;
      if (direction.includes("e"))
        width = Math.max(minWidth, origin.width + dx);
      if (direction.includes("s"))
        height = Math.max(minHeight, origin.height + dy);
      if (direction.includes("w")) {
        width = Math.max(minWidth, origin.width - dx);
        x = origin.x + origin.width - width;
      }
      if (direction.includes("n")) {
        height = Math.max(minHeight, origin.height - dy);
        y = origin.y + origin.height - height;
      }
      setCanvasLayout((current) => ({
        ...current,
        [interaction.key]: { x, y, width, height },
      }));
    }
    function finish() {
      if (!canvasInteractionRef.current) return;
      canvasInteractionRef.current = null;
      document.body.classList.remove("canvas-interacting");
      window.setTimeout(() => {
        cardMovedRef.current = false;
      }, 0);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);
  function startMove(event: ReactPointerEvent, key: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cardMovedRef.current = false;
    const origin = canvasLayout[key] || fallbackCanvasLayout(key);
    canvasInteractionRef.current = {
      kind: "move",
      key,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      scale: canvasViewRef.current.scale,
    };
    document.body.classList.add("canvas-interacting");
  }
  function startResize(
    event: ReactPointerEvent,
    key: string,
    direction: ResizeDirection,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cardMovedRef.current = false;
    const origin = canvasLayout[key] || fallbackCanvasLayout(key);
    canvasInteractionRef.current = {
      kind: "resize",
      key,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      scale: canvasViewRef.current.scale,
    };
    document.body.classList.add("canvas-interacting");
  }
  function startCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".node-output-port.reference")) {
      const point = canvasPoint(event.clientX, event.clientY),
        source = referenceNodes.find((node) => {
          const layout = canvasLayout[node.id] || fallbackCanvasLayout(node.id);
          return (
            point.x >= layout.x &&
            point.x <= layout.x + layout.width &&
            point.y >= layout.y &&
            point.y <= layout.y + layout.height
          );
        });
      if (source) startConnection(event, source.id);
      return;
    }
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(".canvas-node,.canvas-foot")
    )
      return;
    event.preventDefault();
    cardMovedRef.current = false;
    canvasInteractionRef.current = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      origin: canvasViewRef.current,
    };
    document.body.classList.add("canvas-interacting");
  }
  function setZoom(nextScale: number, clientX?: number, clientY?: number) {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect(),
      view = canvasViewRef.current;
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left,
      py = (clientY ?? rect.top + rect.height / 2) - rect.top,
      next = clamp(nextScale, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
    const worldX = (px - view.x) / view.scale,
      worldY = (py - view.y) / view.scale;
    setCanvasView({
      scale: next,
      x: px - worldX * next,
      y: py - worldY * next,
    });
  }
  function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom(
      canvasViewRef.current.scale * Math.exp(-event.deltaY * 0.0012),
      event.clientX,
      event.clientY,
    );
  }
  function fitCanvas(layoutOverride?: Record<string, CanvasNodeLayout>) {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const source = layoutOverride || canvasLayout,
      keys = [
        SCRIPT_NODE_ID,
        ...segments.map((segment) => segment.id),
        ...referenceNodes.map((node) => node.id),
        ...commonPromptNodes.map((node) => node.id),
      ],
      nodes = keys.map((key) => source[key] || fallbackCanvasLayout(key));
    const minX = Math.min(...nodes.map((node) => node.x)),
      minY = Math.min(...nodes.map((node) => node.y)),
      maxX = Math.max(...nodes.map((node) => node.x + node.width)),
      maxY = Math.max(...nodes.map((node) => node.y + node.height)),
      rect = viewport.getBoundingClientRect();
    const scale = clamp(
      Math.min(
        (rect.width - 90) / (maxX - minX),
        (rect.height - 90) / (maxY - minY),
      ),
      CANVAS_MIN_SCALE,
      1.25,
    );
    setCanvasView({
      scale,
      x: (rect.width - (maxX - minX) * scale) / 2 - minX * scale,
      y: (rect.height - (maxY - minY) * scale) / 2 - minY * scale,
    });
  }
  function resetCanvasLayout() {
    const next: Record<string, CanvasNodeLayout> = {
      [SCRIPT_NODE_ID]: initialCanvasLayout[SCRIPT_NODE_ID],
    };
    segments.forEach((segment, index) => {
      next[segment.id] = defaultSegmentLayout(index);
    });
    referenceNodes.forEach((node, index) => {
      next[node.id] = { x: 80, y: 610 + index * 500, width: 500, height: 430 };
    });
    commonPromptNodes.forEach((node, index) => {
      next[node.id] = { x: 620 + index * 410, y: 610, width: 370, height: 360 };
    });
    setCanvasLayout(next);
    window.setTimeout(() => fitCanvas(next), 0);
    flash("画布布局已重排");
  }
  function fallbackCanvasLayout(key: string): CanvasNodeLayout {
    if (key === SCRIPT_NODE_ID) return initialCanvasLayout[SCRIPT_NODE_ID];
    if (key.startsWith("ref-"))
      return {
        x: 80,
        y:
          610 +
          Math.max(
            0,
            referenceNodes.findIndex((node) => node.id === key),
          ) *
            500,
        width: 500,
        height: 430,
      };
    if (key.startsWith("common-"))
      return {
        x:
          620 +
          Math.max(
            0,
            commonPromptNodes.findIndex((node) => node.id === key),
          ) *
            410,
        y: 610,
        width: 370,
        height: 330,
      };
    return defaultSegmentLayout(
      Math.max(
        0,
        segments.findIndex((item) => item.id === key),
      ),
    );
  }
  function visibleNodeLayout(
    width: number,
    height: number,
    offset = 0,
  ): CanvasNodeLayout {
    const rect = canvasViewportRef.current?.getBoundingClientRect(),
      view = canvasViewRef.current;
    if (!rect) return { x: 80 + offset, y: 610, width, height };
    return {
      x: (rect.width / 2 - view.x) / view.scale - width / 2 + offset,
      y: (rect.height / 2 - view.y) / view.scale - height / 2 + offset,
      width,
      height,
    };
  }
  function addReferenceNode() {
    const id = "ref-" + crypto.randomUUID(),
      layout = visibleNodeLayout(500, 430, referenceNodes.length * 22);
    setCanvasLayout((current) => ({ ...current, [id]: layout }));
    setReferenceNodes((current) => [
      ...current,
      {
        id,
        title: "素材引用 " + String(current.length + 1).padStart(2, "0"),
        imageSlots: Array(9).fill(null),
        audioSlots: Array(3).fill(null),
        enabled: true,
      },
    ]);
    setPendingConnection(null);
    flash("素材节点已添加到当前视野：点击格子选择素材");
  }
  function addCommonPromptNode() {
    const id = "common-" + crypto.randomUUID(),
      layout = visibleNodeLayout(370, 360, commonPromptNodes.length * 22);
    setCanvasLayout((current) => ({ ...current, [id]: layout }));
    setCommonPromptNodes((current) => [
      ...current,
      {
        id,
        title: "项目通用提示词",
        visualStyle:
          "Delicate high-detail 2D Japanese anime, stable cel shading, clean linework, consistent identities, restrained cinematic lighting and no style drift.",
        soundRules:
          "Use continuous diegetic ambience and synchronized action sounds. Keep dialogue intelligible. Do not generate background music.",
        globalRules:
          "No subtitles, captions, speech bubbles, readable text, UI, logo or watermark.",
        negativePrompt:
          "background music, subtitles, captions, speech bubbles, readable text, UI, logo, watermark, identity drift, style drift",
        enabled: true,
      },
    ]);
    setPendingConnection(null);
    flash("通用提示词节点已添加到当前视野");
  }
  function selectSlotAsset(asset: LibraryAsset) {
    if (!slotPicker) return;
    // First-frame images are storyboard/keyframe material, not Director reference
    // material. Keeping them out of the 9-grid prevents an accidental I2V/keyframe
    // constraint from changing a Ref2VA segment's opening composition.
    if (
      slotPicker.kind === "image" &&
      (asset.category === "首帧" || /首帧|first.?frame/i.test(asset.path || ""))
    ) {
      flash("首帧图仅用于故事板预览，不能加入素材引用节点");
      return;
    }
    const field = slotPicker.kind === "image" ? "imageSlots" : "audioSlots";
    setReferenceNodes((current) =>
      current.map((node) =>
        node.id === slotPicker.nodeId
          ? {
              ...node,
              [field]: node[field].map((value, index) =>
                index === slotPicker.index ? asset.id : value,
              ),
            }
          : node,
      ),
    );
    setSlotPicker(null);
  }
  function clearSlot(nodeId: string, kind: "image" | "audio", index: number) {
    const field = kind === "image" ? "imageSlots" : "audioSlots";
    setReferenceNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              [field]: node[field].map((value, slot) =>
                slot === index ? null : value,
              ),
            }
          : node,
      ),
    );
  }
  function dropSlot(nodeId: string, kind: "image" | "audio", index: number) {
    const source = slotDragRef.current;
    if (!source || source.nodeId !== nodeId || source.kind !== kind) return;
    const field = kind === "image" ? "imageSlots" : "audioSlots";
    setReferenceNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        const next = [...node[field]],
          value = next[source.index];
        next[source.index] = next[index];
        next[index] = value;
        return { ...node, [field]: next };
      }),
    );
    slotDragRef.current = null;
  }
  function referenceNodePrompt(node: ReferenceNode) {
    return [
      "subject_definitions:",
      ...node.imageSlots.flatMap((assetId, index) => {
        const asset = assets.find((item) => item.id === assetId);
        return asset
          ? [
              "<Picture " +
                (index + 1) +
                "> (" +
                asset.category +
                ") is " +
                describe(asset),
            ]
          : [];
      }),
      ...node.audioSlots.flatMap((assetId, index) => {
        const asset = assets.find((item) => item.id === assetId);
        return asset
          ? ["<Audio " + (index + 1) + "> is " + describe(asset)]
          : [];
      }),
    ].join("\n");
  }
  function canvasPoint(clientX: number, clientY: number) {
    const rect = canvasViewportRef.current?.getBoundingClientRect(),
      view = canvasViewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }
  function startConnection(
    event: ReactPointerEvent | string,
    sourceId: string,
  ) {
    if (typeof event !== "string") event.stopPropagation();
    const layout = canvasLayout[sourceId] || fallbackCanvasLayout(sourceId),
      startX = layout.x + layout.width,
      startY = layout.y + layout.height - 22;
    setSelectedConnectionId(null);
    setPendingConnection({ type: "reference", sourceId });
    setConnectionDraft({
      sourceId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
    flash("拖动到 SEG 左侧“素材”端口后松开");
  }
  function moveConnection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!connectionDraft) return;
    const point = canvasPoint(event.clientX, event.clientY);
    setConnectionDraft((current) =>
      current ? { ...current, currentX: point.x, currentY: point.y } : null,
    );
  }
  function finishConnectionDrag(event: { clientX: number; clientY: number }) {
    if (!pendingConnection) return;
    const point = canvasPoint(event.clientX, event.clientY),
      target = segments.find((segment, index) => {
        const layout = canvasLayout[segment.id] || defaultSegmentLayout(index);
        return (
          point.x >= layout.x - 65 &&
          point.x <= layout.x + 12 &&
          point.y >= layout.y + 42 &&
          point.y <= layout.y + 112
        );
      });
    if (target) connectToSegment(target.id);
  }
  function connectToSegment(targetOrType: string, legacyTargetId?: string) {
    const targetId = legacyTargetId || targetOrType;
    if (!pendingConnection) return flash("请从素材节点的输出端拖出连线");
    const sourceId = pendingConnection.sourceId,
      target = segments.find((segment) => segment.id === targetId),
      sourceTitle = referenceNodes.find((node) => node.id === sourceId)?.title;
    setGraphConnections((current) => [
      ...current.filter((connection) => connection.targetId !== targetId),
      { id: crypto.randomUUID(), type: "reference", sourceId, targetId },
    ]);
    setSegments((current) =>
      current.map((segment) =>
        segment.id === targetId
          ? { ...segment, finalPrompt: undefined, status: "ready" }
          : segment,
      ),
    );
    setActiveId(targetId);
    setPendingConnection(null);
    setConnectionDraft(null);
    setSelectedConnectionId(null);
    flash(
      (sourceTitle || "素材节点") +
        " → " +
        (target?.title || "SEG") +
        "，最终提示词已实时重编译",
    );
  }
  function confirmNodeDeletion(label: string) {
    return (
      window.confirm(
        "第一次确认：确定要删除“" + label + "”吗？\n节点配置将被移除。",
      ) &&
      window.confirm(
        "第二次确认：再次确认永久删除“" + label + "”？\n此操作无法撤销。",
      )
    );
  }
  function removeSourceNode(type: "reference" | "common", id: string) {
    const node =
      type === "reference"
        ? referenceNodes.find((item) => item.id === id)
        : commonPromptNodes.find((item) => item.id === id);
    if (!confirmNodeDeletion(node?.title || "节点")) return;
    if (type === "reference")
      setReferenceNodes((current) => current.filter((item) => item.id !== id));
    else
      setCommonPromptNodes((current) =>
        current.filter((item) => item.id !== id),
      );
    setGraphConnections((current) =>
      current.filter((connection) => connection.sourceId !== id),
    );
    setCanvasLayout((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (pendingConnection?.sourceId === id) setPendingConnection(null);
    flash("节点已删除");
  }
  function toggleSourceNode(type: "reference" | "common", id: string) {
    if (type === "reference")
      setReferenceNodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, enabled: node.enabled === false } : node,
        ),
      );
    else
      setCommonPromptNodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, enabled: node.enabled === false } : node,
        ),
      );
  }
  function toggleSegmentNode(id: string) {
    setSegments((current) =>
      current.map((segment) =>
        segment.id === id ? { ...segment, enabled: !segment.enabled } : segment,
      ),
    );
  }
  function removeSegmentNode(id: string) {
    const segment = segments.find((item) => item.id === id);
    if (!segment) return;
    if (segments.length === 1) return flash("至少保留一个 SEG 节点");
    if (!confirmNodeDeletion(segment.title)) return;
    const remaining = segments.filter((item) => item.id !== id);
    setSegments(remaining);
    setGraphConnections((current) =>
      current.filter((connection) => connection.targetId !== id),
    );
    setPromptPartOverrides((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setCanvasLayout((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (activeId === id) setActiveId(remaining[0].id);
    if (expandedSegmentId === id) setExpandedSegmentId(null);
    flash("SEG 节点已删除");
  }
  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }
  function handleMaterialPreviewClick(asset: LibraryAsset) {
    if (materialClickTimerRef.current)
      window.clearTimeout(materialClickTimerRef.current);
    materialClickTimerRef.current = window.setTimeout(() => {
      toggleAsset(asset);
      materialClickTimerRef.current = null;
    }, 220);
  }
  function openMaterialDetail(assetId: string) {
    if (materialClickTimerRef.current) {
      window.clearTimeout(materialClickTimerRef.current);
      materialClickTimerRef.current = null;
    }
    setMaterialDetailId(assetId);
  }
  function updateSegment(id: string, patch: Partial<Segment>) {
    setSegments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  function updatePromptPartOverride(
    segmentId: string,
    part: "material" | "common",
    value?: string,
  ) {
    setPromptPartOverrides((current) => {
      const next = { ...current },
        segment = { ...(next[segmentId] || {}) };
      if (value === undefined) delete segment[part];
      else segment[part] = value;
      if (segment.material === undefined && segment.common === undefined)
        delete next[segmentId];
      else next[segmentId] = segment;
      return next;
    });
  }
  async function refreshComfy() {
    try {
      const response = await fetch("/api/local/comfyui/discover");
      const data = await response.json();
      setComfy(data);
      if (!data.found)
        setJob({
          stage: "未发现运行中的 ComfyUI",
          percent: 0,
          error: "请先启动 ComfyUI；Director Master 不会启动新实例。",
        });
    } catch (error) {
      setComfy({
        found: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  async function indexProject(root = projectRoot) {
    try {
      const response = await fetch(
        "/api/local/project/assets?root=" + encodeURIComponent(root),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "项目索引失败");
      const saved = JSON.parse(
        localStorage.getItem("director-master-descriptions") || "{}",
      );
      setAssets(
        (data.assets as LibraryAsset[]).map((item) => ({
          ...item,
          description: item.description || saved[item.id] || describe(item),
        })),
      );
      setManageSelectedIds([]);
    } catch (error) {
      flash(error instanceof Error ? error.message : "项目索引失败");
    }
  }
  async function loadVideoResults() {
    try {
      const response = await fetch(
        "/api/local/project/videos?root=" + encodeURIComponent(PRODUCTION_ROOT),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "成片索引失败");
      setVideoResults(
        Object.fromEntries(
          (data.videos || []).map((video: VideoResult) => [
            video.sequenceNo,
            video,
          ]),
        ),
      );
    } catch (error) {
      console.warn(error instanceof Error ? error.message : "成片索引失败");
    }
  }
  async function loadGraph() {
    try {
      const response = await fetch(graphUrl),
        data = await response.json();
      if (response.ok) {
        setGraphUpdatedAt(String(data.updatedAt || ""));
        if (Array.isArray(data.referenceNodes))
          setReferenceNodes(data.referenceNodes);
        if (Array.isArray(data.commonPromptNodes))
          setCommonPromptNodes(data.commonPromptNodes);
        if (Array.isArray(data.connections))
          setGraphConnections(
            data.connections.filter(
              (connection: GraphConnection) => connection.type === "reference",
            ),
          );
        if (
          data.promptPartOverrides &&
          typeof data.promptPartOverrides === "object"
        )
          setPromptPartOverrides(data.promptPartOverrides);
        if (Array.isArray(data.segments) && data.segments.length)
          setSegments((current) => {
            if(episode!=='ep02') {setActiveId(data.segments[0].id);return data.segments;}
            const storedSequences = new Set(
              data.segments.map((segment: Segment) => segment.sequenceNo),
            );
            return [
              ...current.filter(
                (segment) => !storedSequences.has(segment.sequenceNo),
              ),
              ...data.segments,
            ].sort((a, b) => a.sequenceNo - b.sequenceNo);
          });
        if (data.canvasLayout && typeof data.canvasLayout === "object")
          setCanvasLayout((current) => ({ ...current, ...data.canvasLayout }));
        if(episode!=='ep02')setCanvasView({x:30,y:40,scale:0.55});
      }
    } catch (error) {
      console.warn(error);
    } finally {
      setGraphLoaded(true);
    }
  }
  async function loadStoryboards() {
    try {
      const response = await fetch(
        "/api/local/project/storyboards?root=" +
          encodeURIComponent(PRODUCTION_ROOT),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "故事板索引失败");
      const rows = (data.segments || []) as Array<{
          sequenceNo: number;
          images: StoryboardImage[];
          finalPrompt: string;
          localizedPrompt?: string;
          summary?: string;
          shotPrompt?: string;
          references?: ProductionReference[];
        }>,
        prompts = Object.fromEntries(
          rows
            .filter((segment) => segment.finalPrompt)
            .map((segment) => [
              segment.sequenceNo,
              {
                finalPrompt: segment.finalPrompt,
                localizedPrompt: segment.localizedPrompt,
                summary: segment.summary,
                shotPrompt: segment.shotPrompt,
                references: segment.references,
              },
            ]),
        );
      setStoryboards(
        Object.fromEntries(
          rows.map((segment) => [segment.sequenceNo, segment.images]),
        ),
      );
      setProductionPrompts(prompts);
      setSegments((current) =>
        current.map((segment) =>
          prompts[segment.sequenceNo]
            ? {
                ...segment,
                shotPrompt:
                  prompts[segment.sequenceNo].shotPrompt || segment.shotPrompt,
                finalPrompt: prompts[segment.sequenceNo].finalPrompt,
                status: "ready",
              }
            : segment,
        ),
      );
    } catch (error) {
      console.warn(error instanceof Error ? error.message : "故事板索引失败");
    }
  }
  function fileAsBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
      reader.readAsDataURL(file);
    });
  }
  async function addAssets(files: FileList | null) {
    if (!files?.length) return;
    const queue = Array.from(files);
    try {
      for (let index = 0; index < queue.length; index++) {
        const file = queue[index];
        setLibraryBusy(
          "正在添加 " + (index + 1) + "/" + queue.length + " · " + file.name,
        );
        const response = await fetch("/api/local/project/assets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            root: projectRoot,
            category: addCategory,
            fileName: file.name,
            dataBase64: await fileAsBase64(file),
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "添加失败：" + file.name);
      }
      await indexProject();
      flash("已添加 " + queue.length + " 个素材到“" + addCategory + "”");
    } catch (error) {
      flash(error instanceof Error ? error.message : "素材添加失败");
    } finally {
      setLibraryBusy("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  async function deleteAssets(targets: LibraryAsset[]) {
    const removable = targets.filter((asset) => asset.path);
    if (!removable.length) return flash("没有可删除的本地素材");
    const label =
      removable.length === 1
        ? "“" + removable[0].name + "”"
        : removable.length + " 个素材";
    if (
      !window.confirm(
        "确定永久删除" +
          label +
          "？\n文件会从 EP02 素材目录移除，此操作不可撤销。",
      )
    )
      return;
    try {
      setLibraryBusy("正在删除 " + removable.length + " 个素材");
      const ids = new Set(removable.map((asset) => asset.id));
      const response = await fetch("/api/local/project/assets", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: projectRoot,
          paths: removable.map((asset) => asset.path),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "素材删除失败");
      setSegments((current) =>
        current.map((segment) => ({
          ...segment,
          pictureIds: segment.pictureIds.filter((id) => !ids.has(id)),
          audioIds: segment.audioIds.filter((id) => !ids.has(id)),
          finalPrompt: undefined,
        })),
      );
      const descriptions = JSON.parse(
        localStorage.getItem("director-master-descriptions") || "{}",
      );
      ids.forEach((id) => delete descriptions[id]);
      localStorage.setItem(
        "director-master-descriptions",
        JSON.stringify(descriptions),
      );
      setManageSelectedIds((current) => current.filter((id) => !ids.has(id)));
      await indexProject();
      flash("已删除 " + removable.length + " 个素材");
    } catch (error) {
      flash(error instanceof Error ? error.message : "素材删除失败");
    } finally {
      setLibraryBusy("");
    }
  }
  function toggleManage(id: string) {
    setManageSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function loadScreenplay() {
    const draft = localStorage.getItem(SCREENPLAY_STORAGE_KEY);
    try {
      const response = await fetch(
        "/api/local/file?path=" + encodeURIComponent(SCREENPLAY_PATH),
      );
      if (!response.ok) throw new Error("剧本读取失败");
      setEpisodeScript(await response.text());
    } catch (error) {
      setEpisodeScript(draft ?? (error instanceof Error
        ? "# 剧本加载失败\n\n" + error.message
        : "# 剧本加载失败"));
    } finally {
      setScriptLoaded(true);
    }
  }
  async function loadScreenplayStatus() {
    try {
      const response = await fetch("/api/local/screenplay/status");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "剧本状态读取失败");
      setScreenplayDraft(result.draft || result.authoritative || "");
      setScreenplayApproved(!!result.approved);
    } catch (error) {
      flash(error instanceof Error ? error.message : "剧本状态读取失败");
    }
  }
  async function saveScreenplayDraft() {
    if (!screenplayDraft.trim()) return flash("优化稿不能为空");
    try {
      setScreenplayReviewBusy(true);
      const response = await fetch("/api/local/screenplay/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: screenplayDraft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "草稿保存失败");
      setScreenplayApproved(false);
      flash("优化稿已保存，等待审核批准");
    } catch (error) {
      flash(error instanceof Error ? error.message : "草稿保存失败");
    } finally {
      setScreenplayReviewBusy(false);
    }
  }
  async function approveScreenplayDraft() {
    if (!screenplayDraft.trim()) return flash("优化稿不能为空");
    if (
      !window.confirm(
        "确认审核通过并覆盖工作区权威剧本？\n系统会先自动备份当前版本。",
      )
    )
      return;
    try {
      setScreenplayReviewBusy(true);
      const response = await fetch("/api/local/screenplay/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: screenplayDraft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "剧本批准失败");
      setEpisodeScript(screenplayDraft);
      setScreenplayApproved(true);
      localStorage.setItem(SCREENPLAY_STORAGE_KEY, screenplayDraft);
      flash("审核通过：已备份并覆盖权威剧本");
    } catch (error) {
      flash(error instanceof Error ? error.message : "剧本批准失败");
    } finally {
      setScreenplayReviewBusy(false);
    }
  }
  async function loadWorkflowDefaults() {
    try {
      const response = await fetch(
        "/api/local/workflow?path=" + encodeURIComponent(templatePath),
      );
      const workflow = await response.json();
      if (!response.ok) return;
      const node = Array.isArray(workflow.nodes)
        ? workflow.nodes.find(
            (item: Record<string, unknown>) =>
              item.type === "MiniMaxH3Director",
          )
        : Object.values(workflow).find(
            (item: any) => item?.class_type === "MiniMaxH3Director",
          );
      if (!node) return;
      const value = node.widgets_values as unknown[] | undefined;
      const inputs = node.inputs as Record<string, unknown> | undefined;
      const timeline = JSON.parse(
        String(value ? value[11] : inputs?.timeline_data || "{}"),
      );
      setSettings((current) => ({
        ...current,
        cfg: Number(value ? value[3] : inputs?.cfg),
        seed: Number(value ? value[4] : inputs?.seed),
        frameRate: Number(value ? value[6] : inputs?.frame_rate),
        width: Number(value ? value[7] : inputs?.width),
        height: Number(value ? value[8] : inputs?.height),
        refMaxSize: Number(value ? value[9] : inputs?.ref_max_size),
        steps: Number(value ? value[13] : inputs?.steps),
        sampler: String(value ? value[14] : inputs?.sampler),
        scheduler: String(value ? value[15] : inputs?.scheduler),
        shiftVideo: Number(value ? value[16] : inputs?.shift_video),
        shiftAudio: Number(value ? value[17] : inputs?.shift_audio),
        megapixels: Number(timeline.output?.megapixels || 0.6),
      }));
    } catch {
      /* 使用经过验证的内置默认值 */
    }
  }
  function toggleAsset(asset: LibraryAsset) {
    if (asset.mediaType === "video")
      return flash("当前 Ref2VA 项目暂不引用视频素材");
    const field = asset.mediaType === "audio" ? "audioIds" : "pictureIds";
    const list = active[field];
    updateSegment(active.id, {
      [field]: list.includes(asset.id)
        ? list.filter((id) => id !== asset.id)
        : [...list, asset.id],
      finalPrompt: undefined,
      status: "ready",
    });
  }
  function updateDescription(asset: LibraryAsset, value: string) {
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id ? { ...item, description: value } : item,
      ),
    );
    const saved = JSON.parse(
      localStorage.getItem("director-master-descriptions") || "{}",
    );
    saved[asset.id] = value;
    localStorage.setItem("director-master-descriptions", JSON.stringify(saved));
    window.clearTimeout(descriptionSaveTimersRef.current[asset.id]);
    descriptionSaveTimersRef.current[asset.id] = window.setTimeout(() => {
      void fetch("/api/local/project/assets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: projectRoot,
          path: asset.path,
          description: value,
        }),
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              (await response.json()).error || "素材描述保存失败",
            );
        })
        .catch((error) =>
          flash(error instanceof Error ? error.message : "素材描述保存失败"),
        );
    }, 450);
  }
  function addSegment() {
    const id = crypto.randomUUID(),
      sequenceNo =
        Math.max(3, ...segments.map((item) => item.sequenceNo || 3)) + 1;
    setSegments((current) => [
      ...current,
      {
        ...initialSegment,
        id,
        sequenceNo,
        title: "EP02 · 片段" + String(sequenceNo).padStart(2, "0"),
        shotPrompt: "",
        pictureIds: [],
        audioIds: [],
        continuityFromPrev: true,
        status: "draft",
      },
    ]);
    setActiveId(id);
  }
  function duplicateSegment() {
    const id = crypto.randomUUID(),
      index = segments.findIndex((item) => item.id === active.id),
      sequenceNo =
        Math.max(3, ...segments.map((item) => item.sequenceNo || 3)) + 1;
    const copy = {
      ...active,
      id,
      sequenceNo,
      title: "EP02 · 片段" + String(sequenceNo).padStart(2, "0"),
      pictureIds: [...active.pictureIds],
      audioIds: [...active.audioIds],
      continuityFromPrev: true,
      status: "draft" as SegmentStatus,
    };
    const next = [...segments];
    next.splice(index + 1, 0, copy);
    setSegments(next);
    setActiveId(id);
  }
  async function createSkillTask(kind: "screenplay" | "shotlist") {
    if (kind === "shotlist" && !platformConfirmed)
      return flash("请先确认提示词平台为 MiniMax H3");
    if (kind === "shotlist" && !screenplayApproved)
      return flash("请先审核并批准 screenwriter 优化稿");
    try {
      setSkillJob({ stage: "正在整理工作区上下文", kind });
      const referencedIds = new Set(
        segments.flatMap((segment) => [
          ...segment.pictureIds,
          ...segment.audioIds,
        ]),
      );
      const referencedAssets = assets.filter((asset) =>
        referencedIds.has(asset.id),
      );
      const response = await fetch("/api/local/skills/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          brief: skillBrief,
          screenplay: episodeScript,
          segments: segments.map((segment) => ({
            id: segment.id,
            sequenceNo: segment.sequenceNo,
            title: segment.title,
            durationSec: segment.durationSec,
            shotPrompt: segment.shotPrompt,
            pictureIds: segment.pictureIds,
            audioIds: segment.audioIds,
            continuityFromPrev: segment.continuityFromPrev,
          })),
          assets: referencedAssets,
          platform: kind === "shotlist" ? "MiniMax H3" : null,
          platformConfirmed: kind === "shotlist" ? platformConfirmed : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Skill 任务创建失败");
      setSkillJob({
        stage: "任务包已创建并可交给 Agent",
        kind,
        skill: result.skill,
        command: result.command,
        markdownPath: result.markdownPath,
      });
      try {
        await navigator.clipboard.writeText(result.command);
        flash("已创建任务包并复制 Agent 指令");
      } catch {
        flash("任务包已创建，可手动复制指令");
      }
    } catch (error) {
      setSkillJob({
        stage: "任务创建失败",
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  function openGenerationPicker() {
    const enabledSegments = segments.filter((segment) => segment.enabled);
    if (!enabledSegments.length) return flash("画布上没有已启用的 SEG 节点");
    const currentSelection = generationSelection.filter((id) =>
      enabledSegments.some((segment) => segment.id === id),
    );
    setGenerationSelection(
      currentSelection.length
        ? currentSelection
        : [(active.enabled ? active : enabledSegments[0]).id],
    );
    setGenerationPickerOpen(true);
  }
  function toggleGenerationSegment(id: string) {
    setGenerationSelection((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function fillContinuousGenerationRange() {
    const selected = segments
      .filter(
        (segment) =>
          segment.enabled && generationSelection.includes(segment.id),
      )
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
    if (selected.length < 2) return flash("请先勾选连续区间的起点和终点");
    const start = selected[0].sequenceNo,
      end = selected[selected.length - 1].sequenceNo;
    setGenerationSelection(
      segments
        .filter(
          (segment) =>
            segment.enabled &&
            segment.sequenceNo >= start &&
            segment.sequenceNo <= end,
        )
        .map((segment) => segment.id),
    );
  }
  async function runProject(selectedIds: string[]) {
    if (provider === 'local' && (!comfy.found || !comfy.url)) return flash("没有可用的本机 ComfyUI");
    const selectedIdSet = new Set(selectedIds),
      requestedSegments = segments
        .filter((segment) => segment.enabled && selectedIdSet.has(segment.id))
        .sort((a, b) => a.sequenceNo - b.sequenceNo);
    if (!requestedSegments.length) return flash("请至少选择一个已启用的片段");
    const resolvedSegments = requestedSegments.map((segment) => {
      const referenceConnection = graphConnections.find(
          (connection) => connection.targetId === segment.id,
        ),
        referenceNode = referenceNodes.find(
          (node) =>
            node.id === referenceConnection?.sourceId && node.enabled !== false,
        ),
        commonNode = globalCommonPrompt,
        graphPictures = referenceNode?.imageSlots
          .map((id) => assets.find((asset) => asset.id === id))
          .filter(Boolean) as LibraryAsset[] | undefined,
        graphAudios = referenceNode?.audioSlots
          .map((id) => assets.find((asset) => asset.id === id))
          .filter(Boolean) as LibraryAsset[] | undefined,
        production = productionPrompts[segment.sequenceNo],
        productionAssets = (production?.references || []).map(
          (reference): LibraryAsset => ({
            id: "local:" + reference.path.toLowerCase(),
            name: reference.name,
            fileName: reference.fileName,
            path: reference.path,
            relativePath: reference.path,
            mediaType: reference.mediaType,
            category:
              reference.mediaType === "audio"
                ? "声音"
                : reference.mediaType === "video"
                  ? "视频"
                  : /首帧|tail/i.test(reference.name)
                    ? "首帧"
                    : "人物",
            description: reference.description || "",
          }),
        ),
        ps = referenceNode
          ? graphPictures || []
          : productionAssets.length
            ? productionAssets.filter((asset) => asset.mediaType === "image")
            : (segment.pictureIds
                .map((id) => assets.find((asset) => asset.id === id))
                .filter(Boolean) as LibraryAsset[]),
        as = referenceNode
          ? graphAudios || []
          : productionAssets.length
            ? productionAssets.filter((asset) => asset.mediaType === "audio")
            : (segment.audioIds
                .map((id) => assets.find((asset) => asset.id === id))
                .filter(Boolean) as LibraryAsset[]);
      const referencePrompt =
        promptPartOverrides[segment.id]?.material?.trim() ||
        (referenceNode ? referenceNodePrompt(referenceNode) : composeReferencePrompt(ps, as));
      const commonPrompt =
        promptPartOverrides[segment.id]?.common?.trim() || composeCommonPrompt(commonNode);
      const finalPrompt = composePrompt(
        segment,
        ps,
        as,
        commonNode,
        promptPartOverrides[segment.id],
      );
      return { segment, production, referenceNode, commonNode, ps, as, referencePrompt, commonPrompt, finalPrompt };
    });
    const gappedReference = resolvedSegments.find(
      ({ referenceNode }) =>
        referenceNode &&
        (hasSlotGap(referenceNode.imageSlots) ||
          hasSlotGap(referenceNode.audioSlots)),
    );
    if (gappedReference)
      return flash(
        gappedReference.referenceNode?.title +
          " 存在空槽，请让素材从 P1 / A1 起连续排列",
      );
    const invalidSegment = resolvedSegments.find(
      ({ segment, production, referenceNode, commonNode, ps }) =>
        !(
          (referenceNode || commonNode || promptPartOverrides[segment.id]
            ? segment.shotPrompt.trim()
            : production?.finalPrompt ||
              segment.finalPrompt ||
              segment.shotPrompt.trim()) && ps.length
        ),
    );
    if (invalidSegment)
      return flash(
        invalidSegment.segment.title + " 需要镜头提示词和至少一张参考图",
      );
    try {
      setGenerationPickerOpen(false);
      setPage("jobs");
      setJob({ stage: "读取导演台 API", percent: 4 });
      if(provider === 'runninghub') {
        const cloudSegments=resolvedSegments.map(({segment,production,referenceNode,commonNode,ps,as,referencePrompt,commonPrompt,finalPrompt},index)=>({
          id:segment.id,durationSec:segment.durationSec,enabled:true,
          continuityFromPrev:index>0&&segment.continuityFromPrev&&resolvedSegments[index-1].segment.sequenceNo+1===segment.sequenceNo,
          prompt:referenceNode||commonNode||promptPartOverrides[segment.id]?finalPrompt:production?.finalPrompt||segment.finalPrompt||finalPrompt,
          negativePrompt:segment.negativePrompt,definitions:referencePrompt,referencePrompt,commonPrompt,shotPrompt:segment.shotPrompt,pictures:ps,audios:as,
        }));
        const response=await fetch('/api/local/runninghub/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({episode,segments:cloudSegments,sequenceNos:requestedSegments.map(s=>s.sequenceNo),settings:{steps:cloudSteps,megapixels:cloudMP}})});
        const receipt:any=await response.json();if(!response.ok) throw new Error(receipt.error||'云端提交失败');
        localStorage.setItem('director-cloud-job-'+episode,receipt.id);
        void monitorCloud(receipt.id);return;
      }
      const templateResponse = await fetch(
        "/api/local/workflow?path=" + encodeURIComponent(templatePath),
      );
      const workflow = await templateResponse.json();
      if (!templateResponse.ok)
        throw new Error(workflow.error || "工作流读取失败");
      const sourceAssets = Array.from(
        new Map(
          resolvedSegments
            .flatMap((item) => [...item.ps, ...item.as])
            .map((asset) => [asset.path || asset.id, asset]),
        ).values(),
      );
      const uploadNames = new Map<string, string>();
      const sourcesByFileName = new Map<string, LibraryAsset[]>();
      sourceAssets.forEach((asset) => {
        const group = sourcesByFileName.get(asset.fileName) || [];
        group.push(asset);
        sourcesByFileName.set(asset.fileName, group);
      });
      sourcesByFileName.forEach((group, fileName) => {
        if (group.length === 1) {
          uploadNames.set(group[0].path || group[0].id, fileName);
          return;
        }
        const extension = fileName.match(/(\.[^.]+)$/)?.[1] || "";
        const stem = extension ? fileName.slice(0, -extension.length) : fileName;
        group.forEach((asset, index) =>
          uploadNames.set(
            asset.path || asset.id,
            stem + "__dm" + String(index + 1).padStart(2, "0") + extension,
          ),
        );
      });
      const selected = sourceAssets.map((asset) => ({
        ...asset,
        fileName: uploadNames.get(asset.path || asset.id) || asset.fileName,
      }));
      const withUploadName = (asset: LibraryAsset): LibraryAsset => ({
        ...asset,
        fileName: uploadNames.get(asset.path || asset.id) || asset.fileName,
      });
      for (let index = 0; index < selected.length; index++) {
        const asset = selected[index];
        if (!asset.path) continue;
        setJob((current) => ({
          ...current,
          stage:
            "上传素材 " +
            (index + 1) +
            "/" +
            selected.length +
            " · " +
            asset.name,
          percent: 8 + Math.round((index / Math.max(1, selected.length)) * 22),
        }));
        const response = await fetch("/api/local/comfyui/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: asset.path,
            fileName: asset.fileName,
            comfyUrl: comfy.url,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "上传失败：" + asset.name);
        if (result.name && result.name !== asset.fileName)
          throw new Error(
            "上传回执文件名不一致：" + asset.fileName + " → " + result.name,
          );
      }
      const inputs = resolvedSegments.map(
        (
          { segment, production, referenceNode, commonNode, ps, as, referencePrompt, commonPrompt, finalPrompt },
          index,
        ) => ({
          id: segment.id,
          durationSec: segment.durationSec,
          enabled: segment.enabled,
          continuityFromPrev:
            index > 0 &&
            segment.continuityFromPrev &&
            resolvedSegments[index - 1].segment.sequenceNo + 1 ===
              segment.sequenceNo,
          prompt:
            referenceNode || commonNode || promptPartOverrides[segment.id]
              ? finalPrompt
              : production?.finalPrompt ||
                segment.finalPrompt ||
                finalPrompt,
          negativePrompt: [segment.negativePrompt, commonNode?.negativePrompt]
            .filter(Boolean)
            .join(", "),
          definitions: referencePrompt,
          referencePrompt,
          commonPrompt,
          shotPrompt: segment.shotPrompt,
          pictures: ps.map(withUploadName),
          audios: as.map(withUploadName),
        }),
      );
      setJob((current) => ({
        ...current,
        stage: "编译并校验素材引用",
        percent: 34,
      }));
      const compiled = patchDirectorProject(workflow, inputs, settings);
      validateDirectorReferences(compiled, inputs);
      const patched = uiWorkflowToApi(compiled);
      validateDirectorReferences(patched, inputs);
      const response = await fetch(proxyUrl(comfy.url!, "/prompt"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: patched,
          client_id: crypto.randomUUID(),
        }),
      });
      const queued = await response.json();
      if (!response.ok || queued.error) {
        const nodeErrors = queued.node_errors || queued.error?.node_errors;
        throw new Error(
          [
            queued.error?.message || queued.error || "提交失败",
            nodeErrors ? JSON.stringify(nodeErrors) : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      setSegments((current) =>
        current.map((item) =>
          selectedIdSet.has(item.id) ? { ...item, status: "queued" } : item,
        ),
      );
      setJob({
        stage: "已进入 ComfyUI 队列",
        percent: 40,
        promptId: queued.prompt_id,
      });
      void monitor(
        queued.prompt_id,
        requestedSegments.map((segment) => segment.id),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJob((current) => ({ ...current, stage: "生成失败", error: message }));
      setSegments((current) =>
        current.map((item) =>
          selectedIdSet.has(item.id) ? { ...item, status: "error" } : item,
        ),
      );
    }
  }
  async function monitor(promptId: string, selectedIds: string[]) {
    if (!comfy.url) return;
    const monitoredSegments = segments
        .filter((segment) => selectedIds.includes(segment.id))
        .sort((a, b) => a.sequenceNo - b.sequenceNo),
      sequenceNos = monitoredSegments.map((segment) => segment.sequenceNo),
      sequenceNo = sequenceNos[0],
      sequenceLabel =
        sequenceNos.length > 1
          ? String(sequenceNos[0]).padStart(2, "0") +
            "-" +
            String(sequenceNos[sequenceNos.length - 1]).padStart(2, "0")
          : String(sequenceNo).padStart(2, "0"),
      selectedIdSet = new Set(selectedIds);
    for (let attempt = 0; attempt < 1800; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      try {
        const response = await fetch(
          proxyUrl(comfy.url, "/history/" + promptId),
        );
        const history = await response.json();
        const record = history[promptId];
        if (record) {
          if (record.status?.status_str === "error")
            throw new Error(
              JSON.stringify(record.status.messages || record.status),
            );
          const outputs = Object.values(record.outputs || {}).flatMap(
              (node: any) => [
                ...(node.videos || []),
                ...(node.gifs || []),
                ...(node.images || []),
              ],
            ),
            primary =
              outputs.find((output: any) =>
                /\.(mp4|webm|mov)$/i.test(output.filename || ""),
              ) || outputs[0];
          let archived: any = null;
          if (primary?.filename) {
            const outputDir =
                PRODUCTION_ROOT + "\\segment" + sequenceLabel + "\\output",
              extension = primary.filename.match(/\.[^.]+$/)?.[0] || ".mp4";
            const archiveResponse = await fetch("/api/local/comfyui/archive", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                comfyUrl: comfy.url,
                output: primary,
                outputDir,
                preferredName:
                  "EP02_SEG" + sequenceLabel + "_MiniMaxH3_latest" + extension,
              }),
            });
            archived = await archiveResponse.json();
            if (!archiveResponse.ok)
              throw new Error(archived.error || "成片归档失败");
            setVideoResults((current) => ({
              ...current,
              [sequenceNo]: {
                sequenceNo,
                fileName: archived.fileName,
                path: archived.path,
                size: archived.size,
                createdAt: archived.createdAt,
                promptId,
                parameters: {
                  width: settings.width,
                  height: settings.height,
                  fps: settings.frameRate,
                  durationSeconds: monitoredSegments.reduce(
                    (sum, item) => sum + item.durationSec,
                    0,
                  ),
                },
              },
            }));
          }
          setJob({
            stage: "生成完成",
            percent: 100,
            promptId,
            output:
              archived?.path ||
              (primary ? JSON.stringify(primary) : "ComfyUI 已完成"),
          });
          setSegments((current) =>
            current.map((item) =>
              selectedIdSet.has(item.id) ? { ...item, status: "done" } : item,
            ),
          );
          setPage("timeline");
          flash("生成完成，成片已显示在画布");
          return;
        }
        setJob((current) => ({
          ...current,
          stage: attempt < 3 ? "等待执行" : "Director 正在生成 / 拼接",
          percent: Math.min(94, 45 + Math.floor(attempt / 6)),
        }));
        setSegments((current) =>
          current.map((item) =>
            selectedIdSet.has(item.id) ? { ...item, status: "running" } : item,
          ),
        );
      } catch (error) {
        setJob((current) => ({
          ...current,
          stage: "生成失败",
          error: error instanceof Error ? error.message : String(error),
        }));
        setSegments((current) =>
          current.map((item) =>
            selectedIdSet.has(item.id) ? { ...item, status: "error" } : item,
          ),
        );
        return;
      }
    }
  }

  const visibleAssets = assets.filter(
    (item) =>
      (filter === "全部" || item.category === filter) &&
      (!search ||
        (item.name + (item.relativePath || ""))
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const counts = assets.reduce<Record<string, number>>(
    (acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + 1 }),
    {},
  );
  const projectReferenceIds = new Set(
    segments.flatMap((segment) => [...segment.pictureIds, ...segment.audioIds]),
  );
  const projectReferenceAssets = assets.filter((asset) =>
    projectReferenceIds.has(asset.id),
  );
  const projectReferenceCount = projectReferenceAssets.length;
  const audits = [
    { ok: !!active.shotPrompt.trim(), text: "镜头提示词已填写" },
    {
      ok: pictures.length > 0,
      text: pictures.length + " 张图片已映射准确索引",
    },
    { ok: active.negativePrompt.length > 20, text: "负面约束已同步" },
    {
      ok:
        segments.indexOf(active) === 0
          ? !active.continuityFromPrev
          : active.continuityFromPrev,
      text: "片段连续性入口正确",
    },
    {
      ok:
        prompt.includes("subject_definitions:") &&
        prompt.includes("non_diegetic_music:"),
      text: "H3 六段结构完整",
    },
    {
      ok:
        new Set([...pictures, ...audios].map((asset) => asset.fileName))
          .size ===
        pictures.length + audios.length,
      text: "素材文件名唯一，可安全上传并逐项校验",
    },
  ];
  const expandedSegment = segments.find(
    (segment) => segment.id === expandedSegmentId,
  );
  const expandedReferenceConnection =
      expandedSegment &&
      graphConnections.find(
        (connection) => connection.targetId === expandedSegment.id,
      ),
    expandedReferenceNode = referenceNodes.find(
      (node) =>
        node.id === expandedReferenceConnection?.sourceId &&
        node.enabled !== false,
    ),
    expandedCommonNode = globalCommonPrompt;
  const expandedPictures = expandedReferenceNode
    ? (expandedReferenceNode.imageSlots
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[])
    : (expandedSegment?.pictureIds
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[] | undefined);
  const expandedAudios = expandedReferenceNode
    ? (expandedReferenceNode.audioSlots
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[])
    : (expandedSegment?.audioIds
        .map((id) => assets.find((item) => item.id === id))
        .filter(Boolean) as LibraryAsset[] | undefined);
  const expandedOverrides = expandedSegment
    ? promptPartOverrides[expandedSegment.id]
    : undefined;
  const expandedPrompt = expandedSegment
    ? expandedReferenceNode || expandedCommonNode || expandedOverrides
      ? composePrompt(
          expandedSegment,
          expandedPictures || [],
          expandedAudios || [],
          expandedCommonNode,
          expandedOverrides,
        )
      : productionPrompts[expandedSegment.sequenceNo]?.finalPrompt ||
        expandedSegment.finalPrompt ||
        composePrompt(
          expandedSegment,
          expandedPictures || [],
          expandedAudios || [],
        )
    : "";
  const expandedPromptVersion = promptFingerprint(expandedPrompt);
  const expandedReferences: ProductionReference[] = expandedSegment
    ? expandedReferenceNode
      ? [...(expandedPictures || []), ...(expandedAudios || [])]
          .filter((asset) => asset.path)
          .map((asset) => ({
            path: asset.path!,
            name: asset.name,
            fileName: asset.fileName,
            mediaType: asset.mediaType,
            description: asset.description,
          }))
      : productionPrompts[expandedSegment.sequenceNo]?.references ||
        [...(expandedPictures || []), ...(expandedAudios || [])]
          .filter((asset) => asset.path)
          .map((asset) => ({
            path: asset.path!,
            name: asset.name,
            fileName: asset.fileName,
            mediaType: asset.mediaType,
            description: asset.description,
          }))
    : [];
  const expandedAutoMaterialPrompt = expandedReferenceNode
    ? referenceNodePrompt(expandedReferenceNode)
    : expandedReferences.length
      ? (() => {
          let pictureIndex = 0,
            audioIndex = 0;
          return [
            "subject_definitions:",
            ...expandedReferences.map((reference) =>
              reference.mediaType === "audio"
                ? "<Audio " +
                  ++audioIndex +
                  "> is " +
                  (reference.description || reference.name)
                : "<Picture " +
                  ++pictureIndex +
                  "> (" +
                  reference.name +
                  ") is " +
                  (reference.description || reference.name),
            ),
          ].join("\n");
        })()
      : "未连接素材节点，当前没有素材引用提示词。";
  const expandedAutoCommonPrompt = expandedCommonNode
    ? [
        "project_common_prompt:",
        "visual_style:",
        expandedCommonNode.visualStyle,
        "",
        "sound_rules:",
        expandedCommonNode.soundRules,
        "",
        "global_rules:",
        expandedCommonNode.globalRules,
        "",
        "negative_prompt:",
        expandedCommonNode.negativePrompt,
      ].join("\n")
    : "画布中未添加公共提示词节点。";
  const expandedMaterialPrompt =
    expandedOverrides?.material ?? expandedAutoMaterialPrompt;
  const expandedCommonPrompt =
    expandedOverrides?.common ?? expandedAutoCommonPrompt;
  const expandedShotPrompt = expandedSegment ? expandedSegment.shotPrompt : "";
  const generationCandidates = [...segments].sort(
      (a, b) => a.sequenceNo - b.sequenceNo,
    ),
    selectedGenerationSegments = generationCandidates.filter(
      (segment) => segment.enabled && generationSelection.includes(segment.id),
    ),
    generationIsContinuous = selectedGenerationSegments.every(
      (segment, index) =>
        index === 0 ||
        selectedGenerationSegments[index - 1].sequenceNo + 1 ===
          segment.sequenceNo,
    ),
    generationDuration = selectedGenerationSegments.reduce(
      (sum, segment) => sum + segment.durationSec,
      0,
    ),
    generationFrames = selectedGenerationSegments.reduce(
      (sum, segment) =>
        sum + framesForDuration(segment.durationSec, settings.frameRate),
      0,
    );

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-glyph">DM</span>
          <div>
            <b>DIRECTOR MASTER</b>
            <small>MiniMax H3 control surface</small>
          </div>
        </div>
        <nav>
          {(
            [
              ["timeline", "时间轴"],
              ["library", "素材库"],
              ["assistant", "AI 协作"],
              ["jobs", "任务中心"],
              ["settings", "设置"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              {label}
              {id === "library" && <i>{assets.length}</i>}
            </button>
          ))}
          <button className="topbar-link" onClick={() => { location.href = "/mv"; }}>MV 制作</button>
          <button className="topbar-link" onClick={() => { location.href = "/voice"; }}>声音克隆</button>
        </nav>
        <div className="connection">
          <span className={comfy.found ? "dot online" : "dot"} />
          {provider==='runninghub'?'RunningHub 云端':comfy.found ? "ComfyUI :" + comfy.port : "ComfyUI 未连接"}
          <small>{provider==='runninghub'?`${cloudSteps} 步 · ${cloudMP} MP · Plus 48GB`:comfy.pid ? "PID " + comfy.pid : "不会启动新实例"}</small>
        </div>
        <label className="episode-picker">红绳 · 画布<select value={episode} onChange={async e=>{const next=e.target.value; await fetch(graphUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({referenceNodes,commonPromptNodes,connections:graphConnections,promptPartOverrides,segments,canvasLayout,baseUpdatedAt:graphUpdatedAt})});localStorage.setItem('director-master-last-episode',next);location.href='/?episode='+next;}}>{['ep02','ep03'].map(id=><option key={id} value={id}>{id.toUpperCase()}</option>)}</select></label>
        <button className="primary top-run" onClick={()=>{setProvider('local');openGenerationPicker();}}>
          生成视频
        </button>
        <button className="primary top-run" onClick={()=>{setProvider('runninghub');openGenerationPicker();}}>云端生成</button>
      </header>

      {page === "timeline" && (
        <section className="timeline-layout">
          <div className="canvas">
            <div className="canvas-tools">
              <span>时间线画布</span>
              <b>
                {segments.length} 段 · {totalFrames} 帧 ·{" "}
                {segments.reduce((sum, item) => sum + item.durationSec, 0)} 秒
              </b>
              <div className="node-add-tools">
                <button
                  className="add-reference-node"
                  onClick={addReferenceNode}
                >
                  ＋ 素材节点
                </button>
                <button
                  className="add-common-node"
                  onClick={addCommonPromptNode}
                >
                  ＋ 通用提示词
                </button>
                <button className="add-segment" onClick={addSegment}>
                  ＋ SEG
                </button>
              </div>
              <div className="canvas-zoom" aria-label="画布缩放控制">
                <button
                  title="缩小画布"
                  onClick={() => setZoom(canvasView.scale - 0.1)}
                >
                  −
                </button>
                <button title="适应全部卡片" onClick={() => fitCanvas()}>
                  {Math.round(canvasView.scale * 100)}%
                </button>
                <button
                  title="放大画布"
                  onClick={() => setZoom(canvasView.scale + 0.1)}
                >
                  ＋
                </button>
                <button title="恢复自动排列" onClick={resetCanvasLayout}>
                  重排
                </button>
              </div>
            </div>
            <div
              ref={canvasViewportRef}
              className="canvas-viewport"
              onPointerDown={(event) => {
                setSelectedConnectionId(null);
                startCanvasPan(event);
              }}
              onPointerMove={moveConnection}
              onWheel={handleCanvasWheel}
              style={{
                backgroundPosition: canvasView.x + "px " + canvasView.y + "px",
                backgroundSize:
                  80 * canvasView.scale +
                  "px " +
                  80 * canvasView.scale +
                  "px, " +
                  80 * canvasView.scale +
                  "px " +
                  80 * canvasView.scale +
                  "px, " +
                  16 * canvasView.scale +
                  "px " +
                  16 * canvasView.scale +
                  "px, " +
                  16 * canvasView.scale +
                  "px " +
                  16 * canvasView.scale +
                  "px",
              }}
            >
              {pendingConnection && (
                <div
                  className="connection-guide"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <i />
                  <span>连线中：拖到目标 SEG 左侧“素材”端口后松开</span>
                  <button
                    onClick={() => {
                      setPendingConnection(null);
                      setConnectionDraft(null);
                    }}
                  >
                    取消
                  </button>
                </div>
              )}
              <div
                className="canvas-world"
                style={{
                  transform:
                    "translate(" +
                    canvasView.x +
                    "px," +
                    canvasView.y +
                    "px) scale(" +
                    canvasView.scale +
                    ")",
                }}
              >
                <svg className="connection-layer" aria-label="素材节点连线">
                  {graphConnections.map((connection) => {
                    const from =
                        canvasLayout[connection.sourceId] ||
                        fallbackCanvasLayout(connection.sourceId),
                      to =
                        canvasLayout[connection.targetId] ||
                        fallbackCanvasLayout(connection.targetId),
                      x1 = from.x + from.width,
                      y1 = from.y + from.height - 22,
                      x2 = to.x - 49,
                      y2 = to.y + 72,
                      bend = Math.max(90, Math.abs(x2 - x1) * 0.48),
                      path =
                        "M " +
                        x1 +
                        " " +
                        y1 +
                        " C " +
                        (x1 + bend) +
                        " " +
                        y1 +
                        ", " +
                        (x2 - bend) +
                        " " +
                        y2 +
                        ", " +
                        x2 +
                        " " +
                        y2,
                      selected = selectedConnectionId === connection.id;
                    return (
                      <g
                        className={"graph-wire " + (selected ? "selected" : "")}
                        key={connection.id}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelectedConnectionId(connection.id);
                          setPendingConnection(null);
                          setConnectionDraft(null);
                        }}
                      >
                        <path className="wire-hit" d={path} />
                        <path className="wire-visible" d={path} />
                        <circle cx={x1} cy={y1} r="5" />
                        <circle cx={x2} cy={y2} r="5" />
                      </g>
                    );
                  })}
                  {connectionDraft && (
                    <path
                      className="wire-draft"
                      d={
                        "M " +
                        connectionDraft.startX +
                        " " +
                        connectionDraft.startY +
                        " C " +
                        (connectionDraft.startX + 110) +
                        " " +
                        connectionDraft.startY +
                        ", " +
                        (connectionDraft.currentX - 110) +
                        " " +
                        connectionDraft.currentY +
                        ", " +
                        connectionDraft.currentX +
                        " " +
                        connectionDraft.currentY
                      }
                    />
                  )}
                </svg>
                {(() => {
                  const layout =
                    canvasLayout[SCRIPT_NODE_ID] ||
                    initialCanvasLayout[SCRIPT_NODE_ID];
                  return (
                    <div
                      className="canvas-node script-canvas-node"
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.width,
                        height: layout.height,
                      }}
                    >
                      <section className="script-node">
                        <header
                          className="node-drag-handle"
                          title="拖动剧本卡片"
                          onPointerDown={(event) =>
                            startMove(event, SCRIPT_NODE_ID)
                          }
                        >
                          <div>
                            <span>EPISODE SCRIPT</span>
                            <h2>EP02 · 雨幕余温</h2>
                          </div>
                          <small>拖动卡片 · 自动保存</small>
                        </header>
                        <textarea
                          aria-label="EP02 本集剧本"
                          value={episodeScript}
                          onChange={(event) =>
                            setEpisodeScript(event.target.value)
                          }
                          onWheel={(event) => event.stopPropagation()}
                          spellCheck={false}
                        />
                        <footer>
                          <span>{episodeScript.length} 字符</span>
                          <span>上下滚动编辑</span>
                        </footer>
                      </section>
                      {resizeDirections.map((direction) => (
                        <i
                          aria-hidden="true"
                          className={"resize-handle resize-" + direction}
                          key={direction}
                          onPointerDown={(event) =>
                            startResize(event, SCRIPT_NODE_ID, direction)
                          }
                        />
                      ))}
                    </div>
                  );
                })()}
                {referenceNodes.map((node) => {
                  const layout =
                      canvasLayout[node.id] || fallbackCanvasLayout(node.id),
                    imageCount = node.imageSlots.filter(Boolean).length,
                    audioCount = node.audioSlots.filter(Boolean).length,
                    gapped =
                      hasSlotGap(node.imageSlots) ||
                      hasSlotGap(node.audioSlots),
                    referencePrompt = referenceNodePrompt(node);
                  return (
                    <div
                      className={
                        "canvas-node reference-canvas-node " +
                        (node.enabled === false ? "node-disabled" : "")
                      }
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.width,
                        height: layout.height,
                      }}
                      key={node.id}
                    >
                      <article className="reference-node-card">
                        <header
                          className="node-drag-handle"
                          onPointerDown={(event) => startMove(event, node.id)}
                        >
                          <div>
                            <small>REFERENCE PACK · H3 LIMIT</small>
                            <input
                              value={node.title}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setReferenceNodes((current) =>
                                  current.map((item) =>
                                    item.id === node.id
                                      ? { ...item, title: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div
                            className="node-header-actions"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <button
                              className="node-bypass"
                              title={
                                node.enabled === false
                                  ? "启用节点"
                                  : "禁用并旁通节点"
                              }
                              onClick={() =>
                                toggleSourceNode("reference", node.id)
                              }
                            >
                              {node.enabled === false ? "启用" : "禁用"}
                            </button>
                            <button
                              className="node-delete"
                              title="删除素材节点（需要二次确认）"
                              onClick={() =>
                                removeSourceNode("reference", node.id)
                              }
                            >
                              删除
                            </button>
                          </div>
                        </header>
                        <section
                          className="reference-node-content"
                          onWheel={(event) => event.stopPropagation()}
                        >
                          <div className="slot-section-head">
                            <b>图片素材</b>
                            <span>{imageCount}/9 · 从左到右编号</span>
                          </div>
                          <div className="image-slot-grid">
                            {node.imageSlots.map((assetId, index) => {
                              const asset = assets.find(
                                (item) => item.id === assetId,
                              );
                              return (
                                <div
                                  className={
                                    "reference-slot " +
                                    (asset ? "filled" : "empty")
                                  }
                                  draggable={!!asset}
                                  onDragStart={() => {
                                    slotDragRef.current = {
                                      nodeId: node.id,
                                      kind: "image",
                                      index,
                                    };
                                  }}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() =>
                                    dropSlot(node.id, "image", index)
                                  }
                                  key={index}
                                >
                                  {asset ? (
                                    <>
                                      <img
                                        src={
                                          "/api/local/file?path=" +
                                          encodeURIComponent(asset.path || "")
                                        }
                                        alt={asset.name}
                                      />
                                      <em>P{index + 1}</em>
                                      <span>{asset.name}</span>
                                      <button
                                        title="移除"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          clearSlot(node.id, "image", index);
                                        }}
                                      >
                                        ×
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      aria-label={"添加 Picture " + (index + 1)}
                                      onClick={() =>
                                        setSlotPicker({
                                          nodeId: node.id,
                                          kind: "image",
                                          index,
                                        })
                                      }
                                    >
                                      <em>P{index + 1}</em>
                                      <i>＋</i>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="slot-section-head audio-head">
                            <b>参考音色</b>
                            <span>{audioCount}/3</span>
                          </div>
                          <div className="audio-slot-grid">
                            {node.audioSlots.map((assetId, index) => {
                              const asset = assets.find(
                                (item) => item.id === assetId,
                              );
                              return (
                                <div
                                  className={
                                    "reference-slot audio-slot " +
                                    (asset ? "filled" : "empty")
                                  }
                                  draggable={!!asset}
                                  onDragStart={() => {
                                    slotDragRef.current = {
                                      nodeId: node.id,
                                      kind: "audio",
                                      index,
                                    };
                                  }}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={() =>
                                    dropSlot(node.id, "audio", index)
                                  }
                                  key={index}
                                >
                                  {asset ? (
                                    <>
                                      <em>A{index + 1}</em>
                                      <span>{asset.name}</span>
                                      <button
                                        title="移除"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          clearSlot(node.id, "audio", index);
                                        }}
                                      >
                                        ×
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      aria-label={"添加 Audio " + (index + 1)}
                                      onClick={() =>
                                        setSlotPicker({
                                          nodeId: node.id,
                                          kind: "audio",
                                          index,
                                        })
                                      }
                                    >
                                      <em>A{index + 1}</em>
                                      <i>＋ 添加音色</i>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {gapped && (
                            <p className="slot-gap-warning">
                              索引存在空洞：生成前请让图片和音频分别从 P1 / A1
                              连续排列。
                            </p>
                          )}
                          <details className="reference-prompt-preview">
                            <summary>
                              查看素材引用提示词{" "}
                              <span>{referencePrompt.length} chars</span>
                            </summary>
                            <pre>{referencePrompt}</pre>
                          </details>
                        </section>
                        <footer>
                          <span>自动生成素材引用提示词</span>
                          <button
                            className={
                              "node-output-port reference " +
                              (pendingConnection?.sourceId === node.id
                                ? "pending"
                                : "")
                            }
                            onClick={() =>
                              startConnection("reference", node.id)
                            }
                          >
                            素材输出 <i />
                          </button>
                        </footer>
                      </article>
                      {resizeDirections.map((direction) => (
                        <i
                          aria-hidden="true"
                          className={"resize-handle resize-" + direction}
                          key={direction}
                          onPointerDown={(event) =>
                            startResize(event, node.id, direction)
                          }
                        />
                      ))}
                    </div>
                  );
                })}
                {commonPromptNodes.map((node) => {
                  const layout =
                    canvasLayout[node.id] || fallbackCanvasLayout(node.id);
                  return (
                    <div
                      className={
                        "canvas-node common-canvas-node " +
                        (node.enabled === false ? "node-disabled" : "")
                      }
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.width,
                        height: layout.height,
                      }}
                      key={node.id}
                    >
                      <article className="common-node-card">
                        <header
                          className="node-drag-handle"
                          onPointerDown={(event) => startMove(event, node.id)}
                        >
                          <div>
                            <small>PROJECT COMMON PROMPT · GLOBAL</small>
                            <input
                              value={node.title}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setCommonPromptNodes((current) =>
                                  current.map((item) =>
                                    item.id === node.id
                                      ? { ...item, title: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div
                            className="node-header-actions"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <button
                              className="node-bypass"
                              title={
                                node.enabled === false
                                  ? "启用节点"
                                  : "禁用并旁通节点"
                              }
                              onClick={() =>
                                toggleSourceNode("common", node.id)
                              }
                            >
                              {node.enabled === false ? "启用" : "禁用"}
                            </button>
                            <button
                              className="node-delete"
                              title="删除通用提示词节点（需要二次确认）"
                              onClick={() =>
                                removeSourceNode("common", node.id)
                              }
                            >
                              删除
                            </button>
                          </div>
                        </header>
                        <div
                          className="common-fields"
                          onWheel={(event) => event.stopPropagation()}
                        >
                          <label>
                            视频风格
                            <textarea
                              value={node.visualStyle}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setCommonPromptNodes((current) =>
                                  current.map((item) =>
                                    item.id === node.id
                                      ? {
                                          ...item,
                                          visualStyle: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            声音与 BGM 规则
                            <textarea
                              value={node.soundRules}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setCommonPromptNodes((current) =>
                                  current.map((item) =>
                                    item.id === node.id
                                      ? {
                                          ...item,
                                          soundRules: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            字幕 / UI 通用限制
                            <textarea
                              value={node.globalRules}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setCommonPromptNodes((current) =>
                                  current.map((item) =>
                                    item.id === node.id
                                      ? {
                                          ...item,
                                          globalRules: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            公共负面提示词
                            <textarea
                              value={node.negativePrompt}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setCommonPromptNodes((current) =>
                                  current.map((item) =>
                                    item.id === node.id
                                      ? {
                                          ...item,
                                          negativePrompt: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                        <footer>
                          <span>
                            全局自动应用到画布中的全部 {segments.length} 个
                            SEG，无需连线
                          </span>
                          <b className="global-node-badge">GLOBAL</b>
                        </footer>
                      </article>
                      {resizeDirections.map((direction) => (
                        <i
                          aria-hidden="true"
                          className={"resize-handle resize-" + direction}
                          key={direction}
                          onPointerDown={(event) =>
                            startResize(event, node.id, direction)
                          }
                        />
                      ))}
                    </div>
                  );
                })}
                {segments.map((segment, index) => {
                  const ps = segment.pictureIds
                    .map((id) => assets.find((item) => item.id === id))
                    .filter(Boolean) as LibraryAsset[];
                  const as = segment.audioIds
                      .map((id) => assets.find((item) => item.id === id))
                      .filter(Boolean) as LibraryAsset[],
                    referenceConnection = graphConnections.find(
                      (connection) =>
                        connection.type === "reference" &&
                        connection.targetId === segment.id,
                    ),
                    commonConnection = graphConnections.find(
                      (connection) =>
                        connection.type === "common" &&
                        connection.targetId === segment.id,
                    ),
                    connectedReferenceNode = referenceNodes.find(
                      (node) =>
                        node.id === referenceConnection?.sourceId &&
                        node.enabled !== false,
                    ),
                    connectedPictures = connectedReferenceNode?.imageSlots
                      .map((id) => assets.find((item) => item.id === id))
                      .filter(Boolean) as LibraryAsset[] | undefined,
                    connectedAudios = connectedReferenceNode?.audioSlots
                      .map((id) => assets.find((item) => item.id === id))
                      .filter(Boolean) as LibraryAsset[] | undefined,
                    productionReferences =
                      productionPrompts[segment.sequenceNo]?.references,
                    cardPictures = connectedReferenceNode
                      ? connectedPictures || []
                      : productionReferences?.filter(
                          (item) => item.mediaType === "image",
                        ) || ps,
                    cardAudios = connectedReferenceNode
                      ? connectedAudios || []
                      : productionReferences?.filter(
                          (item) => item.mediaType === "audio",
                        ) || as,
                    layout =
                      canvasLayout[segment.id] || defaultSegmentLayout(index);
                  return (
                    <div
                      className="canvas-node segment-canvas-node"
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.width,
                        height: layout.height,
                      }}
                      key={segment.id}
                    >
                      <div className="segment-input-ports">
                        <button
                          className={
                            (referenceConnection ? "connected " : "") +
                            (pendingConnection?.type === "reference"
                              ? "accepting"
                              : "")
                          }
                          title="连接素材节点"
                          onClick={(event) => {
                            event.stopPropagation();
                            connectToSegment("reference", segment.id);
                          }}
                        >
                          <i />
                          素材
                        </button>
                        <button
                          className={
                            (commonConnection ? "connected " : "") +
                            (pendingConnection?.type === "common"
                              ? "accepting"
                              : "")
                          }
                          title="连接通用提示词"
                          onClick={(event) => {
                            event.stopPropagation();
                            connectToSegment("common", segment.id);
                          }}
                        >
                          <i />
                          通用
                        </button>
                      </div>
                      <article
                        role="button"
                        tabIndex={0}
                        aria-label={"选择 " + segment.title}
                        className={
                          "segment-card " +
                          (active.id === segment.id ? "selected " : "") +
                          segment.status +
                          (segment.enabled ? "" : " node-disabled")
                        }
                        onClick={() => {
                          if (!cardMovedRef.current) setActiveId(segment.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveId(segment.id);
                          }
                        }}
                      >
                        <div
                          className="segment-head node-drag-handle"
                          title="拖动片段卡片"
                          onPointerDown={(event) =>
                            startMove(event, segment.id)
                          }
                        >
                          <span>
                            SEG{" "}
                            {String(segment.sequenceNo || index + 4).padStart(
                              2,
                              "0",
                            )}
                          </span>
                          <div className="segment-actions">
                            <i>{segment.status}</i>
                            <button
                              className="node-bypass"
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSegmentNode(segment.id);
                              }}
                            >
                              {segment.enabled ? "禁用" : "启用"}
                            </button>
                            <button
                              aria-label={
                                "展开 " + segment.title + " 最终提示词"
                              }
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveId(segment.id);
                                setExpandedSegmentId(segment.id);
                              }}
                            >
                              展开审片
                            </button>
                            <button
                              className="node-delete"
                              title="删除 SEG（需要二次确认）"
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSegmentNode(segment.id);
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <h2>{segment.title}</h2>
                        {!segment.enabled ? (
                          <small className="production-source bypassed">
                            ⏸ SEG 已旁通，不参与本次生成
                          </small>
                        ) : connectedReferenceNode || globalCommonPrompt ? (
                          <small className="production-source">
                            ✓ 三层提示词自动组合
                          </small>
                        ) : (
                          productionPrompts[segment.sequenceNo] && (
                            <small className="production-source">
                              ✓ 实际生成提示词
                            </small>
                          )
                        )}
                        <p onWheel={(event) => event.stopPropagation()}>
                          {productionPrompts[segment.sequenceNo]?.summary ||
                            segment.shotPrompt ||
                            "等待输入镜头提示词…"}
                        </p>
                        <div
                          className={
                            "segment-storyboard " +
                            (storyboards[segment.sequenceNo]?.length
                              ? "has-images"
                              : "empty")
                          }
                          onWheel={(event) => event.stopPropagation()}
                        >
                          {storyboards[segment.sequenceNo]?.length ? (
                            <>
                              {storyboards[segment.sequenceNo]
                                .slice(0, 6)
                                .map((image, imageIndex) => (
                                  <figure key={image.path}>
                                    <img
                                      src={
                                        "/api/local/file?path=" +
                                        encodeURIComponent(image.path)
                                      }
                                      alt={
                                        segment.title +
                                        " 故事版 " +
                                        (imageIndex + 1)
                                      }
                                    />
                                    <figcaption>
                                      SB{" "}
                                      {String(imageIndex + 1).padStart(2, "0")}
                                    </figcaption>
                                  </figure>
                                ))}
                              {storyboards[segment.sequenceNo].length > 6 && (
                                <b className="storyboard-more">
                                  +{storyboards[segment.sequenceNo].length - 6}
                                </b>
                              )}
                            </>
                          ) : (
                            <div className="segment-storyboard-empty">
                              <i>◇</i>
                              <span>暂无故事版</span>
                              <small>
                                展开审片查看或将故事版加入片段工作区
                              </small>
                            </div>
                          )}
                        </div>
                        <footer>
                          <span>{cardPictures.length} 图片</span>
                          <span>{cardAudios.length} 音频</span>
                          <span>
                            {segment.durationSec}s /{" "}
                            {framesForDuration(
                              segment.durationSec,
                              settings.frameRate,
                            )}
                            f
                          </span>
                        </footer>
                      </article>
                      {resizeDirections.map((direction) => (
                        <i
                          aria-hidden="true"
                          className={"resize-handle resize-" + direction}
                          key={direction}
                          onPointerDown={(event) =>
                            startResize(event, segment.id, direction)
                          }
                        />
                      ))}
                    </div>
                  );
                })}
                {Object.values(videoResults).map((result) => {
                  const key = "__video-" + result.sequenceNo,
                    layout = canvasLayout[key] || fallbackCanvasLayout(key),
                    source = result.path
                      ? "/api/local/file?path=" +
                        encodeURIComponent(result.path)
                      : comfy.url && result.comfyOutput
                        ? proxyUrl(
                            comfy.url,
                            "/view?filename=" +
                              encodeURIComponent(result.comfyOutput.filename) +
                              "&subfolder=" +
                              encodeURIComponent(
                                result.comfyOutput.subfolder || "",
                              ) +
                              "&type=" +
                              encodeURIComponent(
                                result.comfyOutput.type || "output",
                              ),
                          )
                        : "";
                  return (
                    <div
                      className="canvas-node video-canvas-node"
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.width,
                        height: layout.height,
                      }}
                      key={key}
                    >
                      <article className="video-result-card">
                        <header
                          className="node-drag-handle"
                          title="拖动成片卡片"
                          onPointerDown={(event) => startMove(event, key)}
                        >
                          <div>
                            <small>MINIMAX H3 OUTPUT</small>
                            <b>
                              SEG {String(result.sequenceNo).padStart(2, "0")} ·
                              成片
                            </b>
                          </div>
                          <i>READY</i>
                        </header>
                        <div className="video-result-player">
                          {source ? (
                            <video
                              aria-label={
                                "片段" + result.sequenceNo + "生成视频"
                              }
                              controls
                              preload="metadata"
                              src={source}
                              onPointerDown={(event) => event.stopPropagation()}
                              onWheel={(event) => event.stopPropagation()}
                            />
                          ) : (
                            <span>视频文件暂不可用</span>
                          )}
                        </div>
                        <footer>
                          <div>
                            <b>
                              {result.parameters?.width || settings.width}×
                              {result.parameters?.height || settings.height}
                            </b>
                            <span>
                              {result.parameters?.fps || settings.frameRate} FPS
                              ·{" "}
                              {result.parameters?.durationSeconds ||
                                segments.find(
                                  (item) =>
                                    item.sequenceNo === result.sequenceNo,
                                )?.durationSec ||
                                "—"}
                              s
                            </span>
                          </div>
                          <div>
                            <code>
                              {result.promptId
                                ? "ID " + result.promptId.slice(0, 8)
                                : "LOCAL OUTPUT"}
                            </code>
                            {source && (
                              <a
                                href={source}
                                target="_blank"
                                rel="noreferrer"
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                              >
                                打开
                              </a>
                            )}
                          </div>
                        </footer>
                      </article>
                      {resizeDirections.map((direction) => (
                        <i
                          aria-hidden="true"
                          className={"resize-handle resize-" + direction}
                          key={direction}
                          onPointerDown={(event) =>
                            startResize(event, key, direction)
                          }
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="canvas-foot">
                <span>
                  从素材输出端拖到 SEG 素材端口 · 点击连线后按 Delete 删除 ·
                  滚轮缩放
                </span>
                <span>
                  16:9 · {settings.width}×{settings.height} ·{" "}
                  {settings.frameRate} FPS
                </span>
              </div>
            </div>
            <section className="output-rail">
              <header>
                <div>
                  <small>EPISODE OUTPUT TRAIN</small>
                  <b>成片轨道</b>
                </div>
                <span>
                  {Object.keys(videoResults).length}/{segments.length}{" "}
                  节车厢已生成
                </span>
              </header>
              <div className="output-train">
                {segments.map((segment, index) => {
                  const result = videoResults[segment.sequenceNo],
                    source = result?.path
                      ? "/api/local/file?path=" +
                        encodeURIComponent(result.path)
                      : result && comfy.url && result.comfyOutput
                        ? proxyUrl(
                            comfy.url,
                            "/view?filename=" +
                              encodeURIComponent(result.comfyOutput.filename) +
                              "&subfolder=" +
                              encodeURIComponent(
                                result.comfyOutput.subfolder || "",
                              ) +
                              "&type=" +
                              encodeURIComponent(
                                result.comfyOutput.type || "output",
                              ),
                          )
                        : "";
                  return (
                    <div
                      className={"train-unit " + (result ? "ready" : "empty")}
                      key={segment.id}
                    >
                      {index > 0 && <i className="train-coupler" />}
                      <article>
                        <header>
                          <span>
                            SEG {String(segment.sequenceNo).padStart(2, "0")}
                          </span>
                          <b>{result ? "READY" : "WAITING"}</b>
                        </header>
                        {source ? (
                          <video
                            aria-label={"片段" + segment.sequenceNo + "成片"}
                            controls
                            preload="metadata"
                            src={source}
                          />
                        ) : (
                          <div className="empty-output">
                            <i>◇</i>
                            <span>等待生成</span>
                          </div>
                        )}
                        <footer>
                          <strong>{segment.title}</strong>
                          <span>
                            {segment.durationSec}s ·{" "}
                            {framesForDuration(
                              segment.durationSec,
                              settings.frameRate,
                            )}
                            f
                          </span>
                        </footer>
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <aside className="inspector">
            <div className="inspector-head">
              <div>
                <small>当前片段</small>
                <input
                  value={active.title}
                  onChange={(event) =>
                    updateSegment(active.id, { title: event.target.value })
                  }
                />
              </div>
              <button onClick={duplicateSegment}>复制</button>
            </div>
            <section
              className={
                "prompt-sources " +
                (activeReferenceNode || activeCommonNode ? "live" : "")
              }
            >
              <header>
                <b>
                  {activeReferenceNode || activeCommonNode
                    ? "实时组合提示词"
                    : "片段本地提示词"}
                </b>
                <code>REV {promptVersion}</code>
              </header>
              <div>
                <span>素材输入</span>
                <strong>{activeReferenceNode?.title || "未连接"}</strong>
              </div>
              <div>
                <span>通用输入</span>
                <strong>{activeCommonNode?.title || "未连接"}</strong>
              </div>
              <small>
                连接或修改上游节点后，REV 与下方最终提示词会立即更新。
              </small>
            </section>
            <div className="field-row">
              <label>
                时长
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={active.durationSec}
                  onChange={(event) =>
                    updateSegment(active.id, {
                      durationSec: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="toggle-label">
                承接上一段
                <input
                  type="checkbox"
                  checked={active.continuityFromPrev}
                  onChange={(event) =>
                    updateSegment(active.id, {
                      continuityFromPrev: event.target.checked,
                    })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>
                镜头提示词 <i>只写画面、动作、镜头和对白</i>
              </span>
              <textarea
                value={active.shotPrompt}
                onChange={(event) =>
                  updateSegment(active.id, {
                    shotPrompt: event.target.value,
                    finalPrompt: undefined,
                    status: "draft",
                  })
                }
              />
            </label>
            <section className="reference-review">
              <header>
                <b>素材引用</b>
                <button onClick={() => setPage("library")}>选择素材</button>
              </header>
              {[...pictures, ...audios].map((asset) => {
                const list = asset.mediaType === "audio" ? audios : pictures,
                  prefix = asset.mediaType === "audio" ? "Audio" : "Picture";
                return (
                  <div className="reference-line" key={asset.id}>
                    <span>
                      {asset.mediaType === "image" && (
                        <img
                          src={
                            "/api/local/file?path=" +
                            encodeURIComponent(asset.path || "")
                          }
                          alt=""
                        />
                      )}
                    </span>
                    <div>
                      <b>{asset.name}</b>
                      <small>
                        {asset.category} · {asset.fileName}
                      </small>
                    </div>
                    <code>
                      &lt;{prefix} {list.indexOf(asset) + 1}&gt;
                    </code>
                  </div>
                );
              })}
              {!pictures.length && !audios.length && (
                <p className="empty">尚未勾选素材</p>
              )}
            </section>
            <section className="audit">
              <header>
                <b>提交前审核</b>
                <span>
                  {audits.filter((item) => item.ok).length}/{audits.length}
                </span>
              </header>
              {audits.map((item) => (
                <p className={item.ok ? "ok" : "warn"} key={item.text}>
                  <i>{item.ok ? "✓" : "!"}</i>
                  {item.text}
                </p>
              ))}
            </section>
            <details className="prompt-preview">
              <summary>
                查看 H3 最终提示词{" "}
                <span>
                  REV {promptVersion} · {prompt.length} chars
                </span>
              </summary>
              <pre>{prompt}</pre>
            </details>
          </aside>
        </section>
      )}

      {page === "library" && (
        <section className="page-shell library-page">
          <header className="page-head">
            <div>
              <small>MATERIAL VAULT</small>
              <h1>素材库</h1>
              <p>
                点击卡片引用到当前片段；右上角方框用于素材管理，二者互不影响。
              </p>
              <code className="workspace-chip" title={projectRoot}>
                当前工作区 · {projectRoot}
              </code>
            </div>
            <div className="head-actions library-actions">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索名称或路径"
              />
              <select
                aria-label="新素材分类"
                value={addCategory}
                onChange={(event) =>
                  setAddCategory(event.target.value as AssetCategory)
                }
              >
                {(
                  ["人物", "道具", "场景", "首帧", "声音", "视频"] as const
                ).map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                multiple
                accept={
                  addCategory === "声音"
                    ? "audio/*"
                    : addCategory === "视频"
                      ? "video/*"
                      : "image/*"
                }
                onChange={(event) => void addAssets(event.target.files)}
              />
              <button
                className="add-material"
                disabled={!!libraryBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                ＋ 添加素材
              </button>
              <button
                onClick={() => void indexProject()}
                disabled={!!libraryBusy}
              >
                重新索引
              </button>
            </div>
          </header>
          <div className="category-bar library-toolbar">
            <div>
              {(
                [
                  "全部",
                  "人物",
                  "道具",
                  "场景",
                  "首帧",
                  "声音",
                  "视频",
                ] as const
              ).map((category) => (
                <button
                  key={category}
                  className={filter === category ? "active" : ""}
                  onClick={() => setFilter(category)}
                >
                  {category}
                  <span>
                    {category === "全部"
                      ? assets.length
                      : counts[category] || 0}
                  </span>
                </button>
              ))}
            </div>
            <aside>
              <span>
                {manageSelectedIds.length
                  ? "已选择 " + manageSelectedIds.length + " 项"
                  : "选择卡片以批量管理"}
              </span>
              {manageSelectedIds.length > 0 && (
                <>
                  <button onClick={() => setManageSelectedIds([])}>
                    取消选择
                  </button>
                  <button
                    className="danger"
                    disabled={!!libraryBusy}
                    onClick={() =>
                      void deleteAssets(
                        assets.filter((asset) =>
                          manageSelectedIds.includes(asset.id),
                        ),
                      )
                    }
                  >
                    批量删除
                  </button>
                </>
              )}
            </aside>
          </div>
          {libraryBusy && (
            <div className="library-status">
              <i />
              {libraryBusy}
            </div>
          )}
          <div className="library-grid">
            {visibleAssets.map((asset) => {
              const selected =
                  active.pictureIds.includes(asset.id) ||
                  active.audioIds.includes(asset.id),
                marked = manageSelectedIds.includes(asset.id),
                detail = materialDetailId === asset.id,
                list = asset.mediaType === "audio" ? audios : pictures;
              return (
                <article
                  className={
                    "material " +
                    (selected ? "selected " : "") +
                    (marked ? "marked " : "") +
                    (detail ? "show-detail" : "")
                  }
                  key={asset.id}
                >
                  <button
                    className={
                      "manage-check " +
                      (marked
                        ? "marked-state"
                        : selected
                          ? "referenced-state"
                          : "")
                    }
                    aria-label={
                      (marked ? "取消批量选择 " : "加入批量选择 ") + asset.name
                    }
                    title={
                      marked
                        ? "取消批量选择"
                        : selected
                          ? "已引用；点击加入批量选择"
                          : "加入批量选择"
                    }
                    onClick={() => toggleManage(asset.id)}
                  >
                    {marked || selected ? "✓" : ""}
                  </button>
                  {detail ? (
                    <section className="material-detail">
                      <header>
                        <button
                          className="detail-back"
                          aria-label="返回素材图片"
                          title="返回图片"
                          onClick={() => setMaterialDetailId(null)}
                        >
                          ←
                        </button>
                        <div>
                          <small>{asset.category} · MATERIAL DETAIL</small>
                          <strong>
                            {asset.name}
                            {asset.mediaType === "audio" ? " · 参考音色" : ""}
                          </strong>
                        </div>
                      </header>
                      <label>
                        <span>素材介绍</span>
                        <textarea
                          autoFocus
                          aria-label={asset.name + " 素材描述"}
                          value={asset.description}
                          onChange={(event) =>
                            updateDescription(asset, event.target.value)
                          }
                          placeholder="填写人物、道具、场景或音色的稳定特征…"
                        />
                      </label>
                      <small title={asset.relativePath}>
                        {asset.relativePath}
                      </small>
                      <footer>
                        <span>内容自动保存到当前工作区</span>
                        <button
                          className="card-delete"
                          aria-label={"删除 " + asset.name}
                          onClick={() => void deleteAssets([asset])}
                        >
                          删除素材
                        </button>
                      </footer>
                    </section>
                  ) : (
                    <>
                      <div
                        className={"material-preview " + asset.mediaType}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          (selected ? "取消引用 " : "引用 ") +
                          asset.name +
                          "；双击打开素材详情"
                        }
                        title="单击引用素材，双击打开素材详情"
                        onClick={() => handleMaterialPreviewClick(asset)}
                        onDoubleClick={() => openMaterialDetail(asset.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleAsset(asset);
                          }
                        }}
                      >
                        {asset.mediaType === "image" ? (
                          <img
                            src={
                              "/api/local/file?path=" +
                              encodeURIComponent(asset.path || "")
                            }
                            alt={asset.name}
                          />
                        ) : (
                          <span>
                            {asset.mediaType === "audio" ? "WAVE" : "VIDEO"}
                          </span>
                        )}
                        <i>{asset.category}</i>
                        {selected && (
                          <span className="referenced-badge">
                            已引用 · &lt;
                            {asset.mediaType === "audio"
                              ? "Audio"
                              : "Picture"}{" "}
                            {list.indexOf(asset) + 1}&gt;
                          </span>
                        )}
                      </div>
                      {asset.mediaType === "audio" && (
                        <audio
                          className="material-audio"
                          controls
                          preload="metadata"
                          src={
                            "/api/local/file?path=" +
                            encodeURIComponent(asset.path || "")
                          }
                        />
                      )}
                      <footer className="material-front-footer">
                        <div>
                          <strong>
                            {asset.name}
                            {asset.mediaType === "audio" ? " · 参考音色" : ""}
                          </strong>
                          <small>{asset.fileName}</small>
                        </div>
                        <span>
                          <button
                            className="detail-button"
                            onClick={() => openMaterialDetail(asset.id)}
                          >
                            素材详情
                          </button>
                          <button
                            className="card-delete"
                            aria-label={"删除 " + asset.name}
                            onClick={() => void deleteAssets([asset])}
                          >
                            删除
                          </button>
                        </span>
                      </footer>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {page === "assistant" && (
        <section className="page-shell assistant-page">
          <header className="page-head">
            <div>
              <small>AGENT PIPELINE</small>
              <h1>AI 协作工作流</h1>
              <p>
                剧本与生产提示词分阶段处理，每一步生成可审核任务包，不混用 Skill
                职责。
              </p>
              <code className="workspace-chip">
                当前工作区 · {WORKSPACE_ROOT}
              </code>
            </div>
          </header>
          <div className="skill-layout">
            <section className="skill-pipeline">
              <article className="skill-card screenplay-skill">
                <header>
                  <span>01</span>
                  <div>
                    <small>STORY DEVELOPMENT</small>
                    <h2>$screenwriter</h2>
                  </div>
                  <i>{screenplayApproved ? "已批准" : "待审核"}</i>
                </header>
                <p>
                  处理因果、人物弧线、对白、节奏和点改。优化稿先进入审核区；只有点击“批准并覆盖”后，才会替换工作区权威剧本。
                </p>
                <dl>
                  <div>
                    <dt>剧本</dt>
                    <dd>EP02 · 雨幕余温</dd>
                  </div>
                  <div>
                    <dt>草稿</dt>
                    <dd>{screenplayDraft.length} 字符</dd>
                  </div>
                  <div>
                    <dt>规则</dt>
                    <dd>审核后覆盖</dd>
                  </div>
                </dl>
                <button onClick={() => void createSkillTask("screenplay")}>
                  创建剧本优化任务
                </button>
              </article>
              <div className="skill-bridge">
                <i />
                <span>剧本审核通过后进入制作</span>
                <i />
              </div>
              <article className="skill-card shotlist-skill">
                <header>
                  <span>02</span>
                  <div>
                    <small>PRODUCTION PROMPTS</small>
                    <h2>$shotlist-builder</h2>
                  </div>
                  <i>{screenplayApproved ? "可进入" : "锁定"}</i>
                </header>
                <p>
                  只读取审核通过的权威剧本，完成片段拆分、空间阻挡、连续性台账、素材映射与
                  MiniMax H3 双语生产提示词。
                </p>
                <label className="platform-lock">
                  <input
                    type="checkbox"
                    checked={platformConfirmed}
                    onChange={(event) =>
                      setPlatformConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    <b>确认输出平台：MiniMax H3</b>
                    <small>
                      对应 Skill Phase 0；剧本批准并确认平台后才允许继续。
                    </small>
                  </span>
                </label>
                <dl>
                  <div>
                    <dt>剧本门禁</dt>
                    <dd>{screenplayApproved ? "已批准" : "待审核"}</dd>
                  </div>
                  <div>
                    <dt>引用素材</dt>
                    <dd>{projectReferenceCount} 项</dd>
                  </div>
                  <div>
                    <dt>交付</dt>
                    <dd>双语 HTML</dd>
                  </div>
                </dl>
                <button
                  disabled={!platformConfirmed || !screenplayApproved}
                  onClick={() => void createSkillTask("shotlist")}
                >
                  创建分镜提示词任务
                </button>
              </article>
            </section>
            <aside className="skill-console">
              <header>
                <small>REVIEW GATE</small>
                <h2>剧本审核与任务包</h2>
              </header>
              <section
                className={
                  "screenplay-review " + (screenplayApproved ? "approved" : "")
                }
              >
                <header>
                  <b>screenwriter 优化稿</b>
                  <span>
                    {screenplayApproved ? "✓ 权威版本已批准" : "待用户审核"}
                  </span>
                </header>
                <textarea
                  aria-label="screenwriter 优化稿审核"
                  value={screenplayDraft}
                  onChange={(event) => {
                    setScreenplayDraft(event.target.value);
                    setScreenplayApproved(false);
                  }}
                />
                <div>
                  <button
                    disabled={screenplayReviewBusy}
                    onClick={() => void loadScreenplayStatus()}
                  >
                    从工作区重载
                  </button>
                  <button
                    disabled={screenplayReviewBusy}
                    onClick={() => void saveScreenplayDraft()}
                  >
                    保存草稿
                  </button>
                  <button
                    className="approve"
                    disabled={screenplayReviewBusy || !screenplayDraft.trim()}
                    onClick={() => void approveScreenplayDraft()}
                  >
                    批准并覆盖权威剧本
                  </button>
                </div>
              </section>
              <label>
                本次要求或修改重点
                <textarea
                  value={skillBrief}
                  onChange={(event) => setSkillBrief(event.target.value)}
                  placeholder="例如：只优化片段04–16，保持片段01–03不变；或从片段04开始生成 H3 提示词。"
                />
              </label>
              <div className="context-stats">
                <span>
                  <b>{segments.length}</b>片段
                </span>
                <span>
                  <b>{projectReferenceCount}</b>引用素材
                </span>
                <span>
                  <b>{assets.length}</b>工作区素材
                </span>
              </div>
              <section
                className={"skill-receipt " + (skillJob.error ? "error" : "")}
              >
                <small>
                  {skillJob.kind === "screenplay"
                    ? "SCREENWRITER"
                    : skillJob.kind === "shotlist"
                      ? "SHOTLIST BUILDER"
                      : "READY"}
                </small>
                <h3>{skillJob.stage}</h3>
                {skillJob.markdownPath && <code>{skillJob.markdownPath}</code>}
                {skillJob.command && (
                  <>
                    <pre>{skillJob.command}</pre>
                    <button
                      onClick={() =>
                        navigator.clipboard
                          .writeText(skillJob.command || "")
                          .then(() => flash("Agent 指令已复制"))
                      }
                    >
                      复制 Agent 指令
                    </button>
                  </>
                )}
                {skillJob.error && <p>{skillJob.error}</p>}
              </section>
              <p className="skill-note">
                批准操作会先备份旧剧本，再覆盖权威文件。Web
                工具负责整理上下文和落盘；Agent 使用准确的 `$skill`
                指令读取任务包。
              </p>
            </aside>
          </div>
        </section>
      )}

      {page === "jobs" && (
        <section className="page-shell jobs-page">
          <header className="page-head">
            <div>
              <small>GENERATION MONITOR</small>
              <h1>任务中心</h1>
              <p>展示上传、排队、首采生成、拼接和输出。云端运行时显示阶段进度。</p>
            </div>
            <button onClick={refreshComfy}>重新检测</button>
          </header>
          <div className="job-grid">
            <article className="connection-card">
              <span className={comfy.found ? "pulse online" : "pulse"} />
              <small>{provider==='runninghub'?'CLOUD RUNTIME':'LOCAL RUNTIME'}</small>
              <h2>{provider==='runninghub'?'RunningHub · Plus 48GB':comfy.found ? "ComfyUI 在线" : "等待 ComfyUI"}</h2>
              <p>{provider==='runninghub'?`${cloudSteps} 步 · ${cloudMP} MP · 二采关闭`:comfy.url || comfy.error || "未发现监听进程"}</p>
              <dl>
                <div>
                  <dt>进程</dt>
                  <dd>{comfy.pid || "—"}</dd>
                </div>
                <div>
                  <dt>端口</dt>
                  <dd>{comfy.port || "—"}</dd>
                </div>
                <div>
                  <dt>策略</dt>
                  <dd>仅复用</dd>
                </div>
              </dl>
            </article>
            <article className="progress-card">
              <header>
                <div>
                  <small>ACTIVE JOB</small>
                  <h2>{job.stage}</h2>
                </div>
                <b>{job.percent}%</b>
              </header>
              <div className="progress">
                <i style={{ width: job.percent + "%" }} />
              </div>
              <p>Prompt ID · {job.promptId || "尚未提交"}</p>
              {job.error && <pre className="error-box">{job.error}</pre>}
              {job.output && <pre className="output-box">{job.output}</pre>}
            </article>
            <article className="stages">
              <h3>生成阶段</h3>
              {[
                "校验素材与提示词",
                "上传选中素材",
                "编译多段时间线",
                provider === 'runninghub' ? "RunningHub 排队" : "ComfyUI 排队",
                "H3 分段生成与拼接",
                "成片封装与保存",
              ].map((stage, index) => (
                <div key={stage}>
                  <i
                    className={
                      job.percent >= [4, 8, 34, 40, 46, 95][index] ? "done" : ""
                    }
                  >
                    {index + 1}
                  </i>
                  <span>{stage}</span>
                </div>
              ))}
            </article>
          </div>
        </section>
      )}

      {page === "settings" && (
        <section className="page-shell settings-page">
          <header className="page-head">
            <div>
              <small>SYSTEM</small>
              <h1>项目与生成设置</h1>
              <p>连接和模型参数集中在这里，核心画布保持干净。</p>
            </div>
          </header>
          <div className="settings-grid">
            <section>
              <h2>生成位置</h2>
              <label>运行方式<select value={provider} onChange={e=>saveCloud(e.target.value,cloudSteps,cloudMP)}><option value="local">本地 ComfyUI</option><option value="runninghub">RunningHub 云端 · Plus 48GB</option></select></label>
              {provider==='runninghub' && <>
                <label>云端生成步数<input type="number" min={1} max={100} value={cloudSteps} onChange={e=>saveCloud(provider,Number(e.target.value),cloudMP)}/></label>
                <label>云端分辨率<select value={cloudMP} onChange={e=>saveCloud(provider,cloudSteps,Number(e.target.value))}>{[0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1].map(mp=><option value={mp} key={mp}>{mp} MP</option>)}</select></label>
                <p>默认 8 步 · 0.6 MP · 24 FPS。使用导入的导演台云端工作流，二采关闭。支持所选连续片段；密钥由本地服务读取。</p>
              </>}
            </section>
            <section>
              <h2>当前工作区</h2>
              <code className="settings-workspace">{WORKSPACE_ROOT}</code>
              <label>
                素材目录
                <input
                  value={projectRoot}
                  onChange={(event) => setProjectRoot(event.target.value)}
                  placeholder="当前工作区内的素材目录"
                />
              </label>
              <p className="workspace-note">
                剧本、素材、工作流、Skill
                任务与输出全部保存在当前工作区内；本地接口会拒绝越界的素材操作。
              </p>
              <div className="settings-actions">
                <button onClick={() => void indexProject()}>
                  应用并索引素材
                </button>
                <button onClick={() => setProjectRoot(PROJECT_ROOT)}>
                  恢复默认素材目录
                </button>
              </div>
              <label>
                默认 Director 工作流
                <input
                  value={templatePath}
                  onChange={(event) => setTemplatePath(event.target.value)}
                />
              </label>
              <button onClick={() => void loadWorkflowDefaults()}>
                读取工作流生成参数
              </button>
            </section>
            <section>
              <h2>首采生成参数</h2>
              <label>
                像素档
                <select
                  value={settings.megapixels}
                  onChange={(event) => {
                    const mp = Number(event.target.value),
                      sizes: Record<number, [number, number]> = {
                        0.2: [608, 352],
                        0.3: [736, 416],
                        0.4: [864, 480],
                        0.5: [960, 544],
                        0.6: [1056, 608],
                        0.7: [1152, 640],
                        0.8: [1216, 672],
                        0.9: [1280, 736],
                        0.98: [1344, 768],
                        1: [1376, 768],
                      };
                    const size = sizes[mp] || [1056, 608];
                    setSettings({
                      ...settings,
                      megapixels: mp,
                      width: size[0],
                      height: size[1],
                      refMaxSize: size[0],
                    });
                  }}
                >
                  {[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.98, 1].map(
                    (mp) => (
                      <option key={mp} value={mp}>
                        {mp} MP
                      </option>
                    ),
                  )}
                </select>
              </label>
              <div className="setting-pairs">
                {(
                  [
                    ["宽度", "width"],
                    ["高度", "height"],
                    ["FPS", "frameRate"],
                    ["Steps", "steps"],
                    ["Seed", "seed"],
                    ["CFG", "cfg"],
                  ] as const
                ).map(([label, key]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      value={settings[key]}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          [key]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
            <section>
              <h2>拼接与加速</h2>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.continuityEnabled}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      continuityEnabled: event.target.checked,
                    })
                  }
                />
                启用跨段连续性
              </label>
              <p className="hint">
                默认 0.6 MP（1056×608）、4 steps、Euler + Simple、4 步加速
                LoRA。工具暂不包含二采放大或精修逻辑。
              </p>
            </section>
          </div>
        </section>
      )}
      {generationPickerOpen && (
        <div
          className="generation-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setGenerationPickerOpen(false);
          }}
        >
          <section
            className="generation-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="选择要生成的视频片段"
          >
            <header>
              <div>
                <small>MINIMAX H3 · GENERATION RANGE</small>
                <h2>选择要生成的片段</h2>
                <p>
                  来源仅限当前画布中的 SEG
                  节点；多选后按编号组成同一条导演台时间线。
                </p>
              </div>
              <button
                className="generation-picker-close"
                aria-label="关闭片段选择"
                onClick={() => setGenerationPickerOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="generation-picker-tools">
              <button
                onClick={() =>
                  setGenerationSelection(
                    generationCandidates
                      .filter((segment) => segment.enabled)
                      .map((segment) => segment.id),
                  )
                }
              >
                全选启用
              </button>
              <button
                onClick={() =>
                  setGenerationSelection(active.enabled ? [active.id] : [])
                }
              >
                仅当前片段
              </button>
              <button
                disabled={
                  selectedGenerationSegments.length < 2 ||
                  generationIsContinuous
                }
                onClick={fillContinuousGenerationRange}
              >
                补齐连续区间
              </button>
              <button onClick={() => setGenerationSelection([])}>清空</button>
              <span>
                {selectedGenerationSegments.length > 1
                  ? generationIsContinuous
                    ? "✓ 连续片段，将顺序拼接"
                    : "! 当前选择不连续"
                  : "选择多个片段可连续生成"}
              </span>
            </div>
            <div className="generation-segment-list">
              {generationCandidates.map((segment) => {
                const connection = graphConnections.find(
                    (item) =>
                      item.type === "reference" && item.targetId === segment.id,
                  ),
                  referenceNode = referenceNodes.find(
                    (node) =>
                      node.id === connection?.sourceId &&
                      node.enabled !== false,
                  ),
                  pictureCount = referenceNode
                    ? referenceNode.imageSlots.filter(Boolean).length
                    : segment.pictureIds.length,
                  audioCount = referenceNode
                    ? referenceNode.audioSlots.filter(Boolean).length
                    : segment.audioIds.length,
                  selected = generationSelection.includes(segment.id);
                return (
                  <label
                    className={
                      "generation-segment-row" +
                      (selected ? " selected" : "") +
                      (segment.enabled ? "" : " disabled")
                    }
                    key={segment.id}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!segment.enabled}
                      onChange={() => toggleGenerationSegment(segment.id)}
                    />
                    <span className="generation-segment-index">
                      SEG {String(segment.sequenceNo).padStart(2, "0")}
                    </span>
                    <div>
                      <b>{segment.title}</b>
                      <small>
                        {segment.enabled
                          ? referenceNode
                            ? "已连接 · " + referenceNode.title
                            : pictureCount
                              ? "使用 SEG 内素材"
                              : "未连接素材节点"
                          : "节点已旁通，不参与生成"}
                      </small>
                    </div>
                    <span className="generation-segment-assets">
                      {pictureCount} 图片 · {audioCount} 音频
                    </span>
                    <span className="generation-segment-duration">
                      {segment.durationSec}s
                    </span>
                  </label>
                );
              })}
            </div>
            <footer>
              <div>
                <small>本次生成</small>
                <b>
                  {selectedGenerationSegments.length} 个片段 ·{" "}
                  {generationDuration}s · {generationFrames} 帧
                </b>
                <span>
                  {selectedGenerationSegments.length
                    ? selectedGenerationSegments
                        .map(
                          (segment) =>
                            "SEG" + String(segment.sequenceNo).padStart(2, "0"),
                        )
                        .join(" → ")
                    : "尚未选择片段"}
                </span>
              </div>
              <button
                className="generation-submit"
                disabled={!selectedGenerationSegments.length}
                onClick={() => void runProject(generationSelection)}
              >
                {selectedGenerationSegments.length > 1 && generationIsContinuous
                  ? "连续生成所选片段"
                  : "生成所选片段"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {slotPicker && (
        <div
          className="slot-picker-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSlotPicker(null);
          }}
        >
          <section
            className="slot-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="选择素材"
          >
            <header>
              <div>
                <small>REFERENCE SLOT</small>
                <h2>
                  选择 {slotPicker.kind === "image" ? "图片" : "参考音色"} ·{" "}
                  {slotPicker.kind === "image" ? "P" : "A"}
                  {slotPicker.index + 1}
                </h2>
              </div>
              <button onClick={() => setSlotPicker(null)}>×</button>
            </header>
            <div>
              {assets
                .filter(
                  (asset) =>
                    asset.mediaType === slotPicker.kind &&
                    !(
                      slotPicker.kind === "image" &&
                      (asset.category === "首帧" ||
                        /首帧|first.?frame/i.test(asset.path || ""))
                    ),
                )
                .map((asset) => (
                  <button
                    className="slot-picker-item"
                    onClick={() => selectSlotAsset(asset)}
                    key={asset.id}
                  >
                    {asset.mediaType === "image" ? (
                      <img
                        src={
                          "/api/local/file?path=" +
                          encodeURIComponent(asset.path || "")
                        }
                        alt={asset.name}
                      />
                    ) : (
                      <span className="slot-audio-icon">AUDIO</span>
                    )}
                    <div>
                      <b>{asset.name}</b>
                      <small>
                        {asset.category} · {asset.description || "暂无说明"}
                      </small>
                    </div>
                  </button>
                ))}
            </div>
            {!assets.some(
              (asset) =>
                asset.mediaType === slotPicker.kind &&
                !(
                  slotPicker.kind === "image" &&
                  (asset.category === "首帧" ||
                    /首帧|first.?frame/i.test(asset.path || ""))
                ),
            ) && (
              <p>
                素材库中暂无可用的
                {slotPicker.kind === "image" ? "图片" : "音频"}素材。
              </p>
            )}
          </section>
        </div>
      )}
      {expandedSegment && (
        <div
          className="prompt-review-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setExpandedSegmentId(null);
          }}
        >
          <section
            className="prompt-review-modal"
            role="dialog"
            aria-modal="true"
            aria-label={expandedSegment.title + " 最终提示词审核"}
          >
            <header>
              <div>
                <small>SEGMENT REVIEW · MINIMAX H3</small>
                <h2>{expandedSegment.title}</h2>
                <p>
                  最终提交内容 = 素材提示词 + 公共提示词 + 当前 SEG 分镜提示词
                </p>
              </div>
              <div>
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(expandedPrompt)
                      .then(() => flash("组合后的最终提示词已复制"))
                      .catch(() => flash("复制失败，请手动选择提示词"))
                  }
                >
                  复制组合提示词
                </button>
                <button
                  className="modal-close"
                  aria-label="关闭审片面板"
                  onClick={() => setExpandedSegmentId(null)}
                >
                  ×
                </button>
              </div>
            </header>
            <div className="prompt-review-body">
              <section className="final-prompt-panel">
                <header>
                  <div>
                    <small>COMPILED PROMPT SOURCES</small>
                    <b>最终提示词 · 三层组合</b>
                  </div>
                  <span>
                    REV {expandedPromptVersion} · {expandedPrompt.length} chars
                  </span>
                </header>
                <div className="prompt-parts">
                  <article className="prompt-part material-part">
                    <header>
                      <div>
                        <i>01</i>
                        <b>素材提示词</b>
                      </div>
                      <div className="prompt-part-source">
                        <span>
                          {expandedOverrides?.material !== undefined
                            ? "本 SEG 手动覆盖"
                            : expandedReferenceNode
                              ? "自动 · " + expandedReferenceNode.title
                              : "生成记录 / 未连接"}
                        </span>
                        {expandedOverrides?.material !== undefined && (
                          <button
                            onClick={() =>
                              updatePromptPartOverride(
                                expandedSegment.id,
                                "material",
                              )
                            }
                          >
                            恢复自动
                          </button>
                        )}
                      </div>
                    </header>
                    <textarea
                      aria-label="素材提示词"
                      value={expandedMaterialPrompt}
                      onChange={(event) =>
                        updatePromptPartOverride(
                          expandedSegment.id,
                          "material",
                          event.target.value,
                        )
                      }
                      onDoubleClick={(event) => event.currentTarget.select()}
                      spellCheck={false}
                    />
                  </article>
                  <article className="prompt-part common-part">
                    <header>
                      <div>
                        <i>02</i>
                        <b>公共提示词</b>
                      </div>
                      <div className="prompt-part-source">
                        <span>
                          {expandedOverrides?.common !== undefined
                            ? "本 SEG 手动覆盖"
                            : expandedCommonNode
                              ? "自动 · " + expandedCommonNode.title
                              : "未添加全局节点"}
                        </span>
                        {expandedOverrides?.common !== undefined && (
                          <button
                            onClick={() =>
                              updatePromptPartOverride(
                                expandedSegment.id,
                                "common",
                              )
                            }
                          >
                            恢复自动
                          </button>
                        )}
                      </div>
                    </header>
                    <textarea
                      aria-label="公共提示词"
                      value={expandedCommonPrompt}
                      onChange={(event) =>
                        updatePromptPartOverride(
                          expandedSegment.id,
                          "common",
                          event.target.value,
                        )
                      }
                      onDoubleClick={(event) => event.currentTarget.select()}
                      spellCheck={false}
                    />
                  </article>
                  <article className="prompt-part shot-part">
                    <header>
                      <div>
                        <i>03</i>
                        <b>分镜提示词</b>
                      </div>
                      <div className="prompt-part-source">
                        <span>
                          SEG{" "}
                          {String(expandedSegment.sequenceNo).padStart(2, "0")}{" "}
                          · 本片段专属
                        </span>
                      </div>
                    </header>
                    <textarea
                      aria-label="分镜提示词"
                      value={expandedShotPrompt}
                      onChange={(event) =>
                        updateSegment(expandedSegment.id, {
                          shotPrompt: event.target.value,
                          finalPrompt: undefined,
                          status: "draft",
                        })
                      }
                      onDoubleClick={(event) => event.currentTarget.select()}
                      spellCheck={false}
                    />
                  </article>
                </div>
              </section>
              <aside className="storyboard-panel">
                <header>
                  <div>
                    <small>VISUAL REVIEW</small>
                    <b>故事板</b>
                  </div>
                  <span>
                    {storyboards[expandedSegment.sequenceNo]?.length || 0} 张
                  </span>
                </header>
                {storyboards[expandedSegment.sequenceNo]?.length ? (
                  <div className="storyboard-gallery">
                    {storyboards[expandedSegment.sequenceNo].map((image) => (
                      <figure key={image.path}>
                        <img
                          src={
                            "/api/local/file?path=" +
                            encodeURIComponent(image.path)
                          }
                          alt={image.name}
                        />
                        <figcaption>{image.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="storyboard-empty">
                    <i>◇</i>
                    <b>未发现故事板图片</b>
                    <span>
                      将“故事板 / 分镜 /
                      storyboard”图片放入该片段工作区后会自动显示。
                    </span>
                  </div>
                )}
                <section className="modal-references">
                  <header>
                    <b>实际引用素材</b>
                    <span>{expandedReferences.length} 项</span>
                  </header>
                  {expandedReferences.map((reference, index) => {
                    const pictureIndex = expandedReferences
                        .slice(0, index + 1)
                        .filter((item) => item.mediaType === "image").length,
                      audioIndex = expandedReferences
                        .slice(0, index + 1)
                        .filter((item) => item.mediaType === "audio").length;
                    return (
                      <div key={reference.path}>
                        {reference.mediaType === "image" ? (
                          <img
                            src={
                              "/api/local/file?path=" +
                              encodeURIComponent(reference.path)
                            }
                            alt={reference.name}
                          />
                        ) : (
                          <span className="audio-ref">A</span>
                        )}
                        <p>
                          <b>{reference.name}</b>
                          <small>
                            {reference.mediaType === "audio"
                              ? "Audio " + audioIndex
                              : "Picture " + pictureIndex}
                          </small>
                        </p>
                      </div>
                    );
                  })}
                </section>
              </aside>
            </div>
            <footer>
              <span>
                双击任一区域全选 · 手动修改会参与最终编译并保存在工作区
              </span>
              <b>
                {expandedSegment.durationSec}s ·{" "}
                {framesForDuration(
                  expandedSegment.durationSec,
                  settings.frameRate,
                )}{" "}
                frames · MiniMax H3
              </b>
            </footer>
          </section>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
