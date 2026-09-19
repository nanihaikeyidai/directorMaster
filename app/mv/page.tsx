/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element, @next/next/no-html-link-for-pages, react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  patchDirectorProject,
  uiWorkflowToApi,
  validateDirectorReferences,
  type DirectorSegmentInput,
  type DirectorSettings,
} from "../../lib/workflow";
import {
  BAND_MV_PROMPT_TEMPLATE_VERSION,
  buildStandardBandMvPrompt,
} from "../../lib/mv-prompt.mjs";

type Asset = {
  id: string;
  name: string;
  path: string;
  mediaType: "image" | "audio" | "video";
  category?: "人物" | "场景";
  fileName?: string;
  description?: string;
};
type SegmentNote = {
  kind: "vocal" | "instrumental";
  lyrics: string;
  direction: string;
};
type MvProject = {
  projectId: string;
  projectName: string;
  sourceName: string;
  sourcePath: string;
  duration: number;
  originalSourcePath?: string;
  originalDuration?: number;
  leadSilenceSec?: number;
  sampleRate?: number;
  channels?: number;
};
type GenerationProvider = "local" | "runninghub";
type TrackTool = "seek" | "cut" | "trim";
type SegmentGeneration = {
  provider: GenerationProvider;
  status: "preparing" | "queued" | "running" | "done" | "error";
  message: string;
  outputPath?: string;
  jobId?: string;
};
type CutMenu = { x: number; y: number; time: number } | null;
type RecentProject = {
  projectId: string;
  projectName: string;
  sourceName: string;
  duration: number;
  leadSilenceSec?: number;
  updatedAt: string;
  cuts: number;
  segments: number;
  visualAssets: number;
};
type WorkflowCatalogItem = { path: string; fileName: string; nodeCount: number; classes: string[]; invalid?: boolean };
type WorkflowCatalog = { local: WorkflowCatalogItem[]; cloud: WorkflowCatalogItem[] };

const MAX_SEGMENT = 15;
const MIN_SEGMENT = 0.25;
const LOCAL_WORKFLOW_PATH = "D:\\HermesWorkspace\\directorMaster\\workspace\\workflows\\mv\\local\\minimax_h3_director_hybrid_8step.json";
const LOCAL_WORKFLOW_STORAGE_KEY = "director-mv-local-workflow-path";
const CLOUD_WORKFLOW_PATH = "D:\\HermesWorkspace\\directorMaster\\workspace\\workflows\\mv\\cloud\\minimax_h3_remix_ref2va_dual_sampling_api.json";
const LEGACY_CLOUD_WORKFLOW_PATH = "D:\\HermesWorkspace\\directorMaster\\workspace\\workflows\\mv\\cloud\\runninghub-mv-ref2v-api.json";
const CLOUD_WORKFLOW_STORAGE_KEY = "director-mv-cloud-workflow-path";
const CLOUD_WORKFLOW_ID_STORAGE_KEY = "director-mv-cloud-workflow-id";
const MV_RUNNINGHUB_WORKFLOW_ID = "2087128116820013058";
const GENERATION_POLL_MS = 2500;
const localDirectorSettings: DirectorSettings = {
  taskType: "r2v",
  frameRate: 24,
  width: 1056,
  height: 608,
  megapixels: 0.6,
  refMaxSize: 1056,
  cfg: 1,
  seed: 666,
  steps: 8,
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
  exportSourceImages: false,
};
const emptyNote = (): SegmentNote => ({ kind: "vocal", lyrics: "", direction: "" });

function clock(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function uniqueCuts(values: number[], duration: number) {
  const sorted = Array.from(new Set(values.map((value) => Number(value.toFixed(3)))))
    .filter((value) => value > MIN_SEGMENT && value < duration - MIN_SEGMENT)
    .sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] >= MIN_SEGMENT);
}

function suggestCutsFromBuffer(buffer: AudioBuffer, duration: number, rangeStart = 0, rangeEnd = duration) {
  const samples = buffer.getChannelData(0);
  const next: number[] = [];
  let start = rangeStart;
  while (rangeEnd - start > MAX_SEGMENT) {
    const earliest = Math.min(start + 7, rangeEnd);
    const latest = Math.min(start + 13.8, rangeEnd - MIN_SEGMENT);
    let bestTime = latest;
    let bestEnergy = Number.POSITIVE_INFINITY;
    for (let time = Math.max(earliest, latest - 4.5); time <= latest; time += 0.04) {
      const center = Math.floor(time * buffer.sampleRate);
      const radius = Math.floor(buffer.sampleRate * 0.08);
      let energy = 0;
      let count = 0;
      for (let index = Math.max(0, center - radius); index < Math.min(samples.length, center + radius); index += 16) {
        energy += Math.abs(samples[index]);
        count += 1;
      }
      energy /= Math.max(1, count);
      if (energy < bestEnergy) { bestEnergy = energy; bestTime = time; }
    }
    next.push(Number(bestTime.toFixed(3)));
    start = bestTime;
  }
  return uniqueCuts(next, duration).filter((value) => value > rangeStart && value < rangeEnd);
}

export default function MvStudio() {
  const [projectName, setProjectName] = useState("女团MV");
  const [leadSilenceSec, setLeadSilenceSec] = useState(2);
  const [prependSilenceSec, setPrependSilenceSec] = useState(2);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [project, setProject] = useState<MvProject | null>(null);
  // When replacing music, keep the current project identity so the backend
  // can retain its references/materials. A new project deliberately leaves
  // this empty and starts with no inherited assets.
  const [replaceProjectId, setReplaceProjectId] = useState<string | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [, setUndo] = useState<Array<{ cuts: number[]; notes: SegmentNote[]; trimRange: { start: number; end: number } }>>([]);
  const [notes, setNotes] = useState<SegmentNote[]>([]);
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [generatedFrom, setGeneratedFrom] = useState("");
  const [visualAssets, setVisualAssets] = useState<Asset[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedCut, setSelectedCut] = useState<number | null>(null);
  const [trackTool, setTrackTool] = useState<TrackTool>("seek");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("等待上传音乐");
  const [result, setResult] = useState<any>(null);
  const [cutMenu, setCutMenu] = useState<CutMenu>(null);
  const [generation, setGeneration] = useState<Record<number, SegmentGeneration>>({});
  const [batchProvider, setBatchProvider] = useState<GenerationProvider | null>(null);
  const [batchSelection, setBatchSelection] = useState<number[]>([]);
  const [workflowConfigOpen, setWorkflowConfigOpen] = useState(false);
  const [workflowTab, setWorkflowTab] = useState<"local" | "cloud">("local");
  const [localWorkflowPath, setLocalWorkflowPath] = useState(LOCAL_WORKFLOW_PATH);
  const [cloudWorkflowPath, setCloudWorkflowPath] = useState(CLOUD_WORKFLOW_PATH);
  const [cloudWorkflowId, setCloudWorkflowId] = useState(MV_RUNNINGHUB_WORKFLOW_ID);
  const [workflowCatalog, setWorkflowCatalog] = useState<WorkflowCatalog>({ local: [], cloud: [] });
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [settings, setSettings] = useState({
    members: "按上传顺序和素材描述锁定每位成员的身份、乐器、舞台站位与主唱关系；第一张人物素材默认为视觉主角，除非分段导演说明另有指定",
    style: "高品质真人写实演唱会摄影，真实成年演员、自然皮肤与发丝、可信布料和乐器材质、电影级舞台灯光、多机位节奏剪辑",
    stage: "以用户上传的场景素材描述为舞台建筑、空间布局、灯光色彩与成员站位的权威依据",
    wardrobe: "服装跨段保持一致，除非分段导演说明明确换装",
    performance: "动作贴合节拍，口型只跟随原音轨，队形变化连续可追踪",
    continuity: "preserve performer identity, screen direction, stage geography, wardrobe, props, lighting progression, and the previous segment exit pose",
    vocalStartSec: "0",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const cloudWorkflowInputRef = useRef<HTMLInputElement>(null);
  const personInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveScrollRef = useRef<HTMLDivElement>(null);
  const waveInnerRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const dragCutRef = useRef<number | null>(null);
  const trimDragRef = useRef<"start" | "end" | null>(null);
  const playheadDragRef = useRef(false);
  const playheadWasPlayingRef = useRef(false);

  const segments = useMemo(() => {
    if (!project) return [];
    const rangeEnd = trimRange.end || project.duration;
    const points = [trimRange.start, ...cuts.filter((value) => value > trimRange.start && value < rangeEnd).sort((a, b) => a - b), rangeEnd];
    return points.slice(0, -1).map((start, index) => ({
      index: index + 1,
      start,
      end: points[index + 1],
      duration: points[index + 1] - start,
    }));
  }, [cuts, project, trimRange]);
  const invalidSegments = segments.filter(
    (segment) => segment.duration > MAX_SEGMENT + 0.001 || segment.duration < MIN_SEGMENT,
  );
  const missingVisualKinds = (["人物", "场景"] as const).filter(
    (category) => !visualAssets.some((asset) => asset.category === category),
  );
  const promptInputSignature = JSON.stringify({
    templateVersion: BAND_MV_PROMPT_TEMPLATE_VERSION,
    cuts,
    duration: project?.duration || 0,
    // 歌词与分镜导演词也是提示词输入；缺少它们会导致用户修改后仍显示旧提示词可用。
    notes,
    visualAssets: visualAssets.map(({ id, category, description }) => ({ id, category, description })),
    settings,
    leadSilenceSec,
    trimRange,
  });
  const promptsReady =
    generatedPrompts.length === segments.length && generatedFrom === promptInputSignature;
  const generationBusy = Object.values(generation).some((item) =>
    ["preparing", "queued", "running"].includes(item.status),
  );

  async function refreshRecentProjects() {
    const response = await fetch("/api/local/mv/projects");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "最近项目读取失败");
    setRecentProjects(Array.isArray(data.projects) ? data.projects : []);
  }

  function rememberWorkflowPath(value: string) {
    setLocalWorkflowPath(value);
    localStorage.setItem(LOCAL_WORKFLOW_STORAGE_KEY, value);
    setWorkflowMessage("路径已修改，点击“检查路径”确认工作流可用");
  }

  function rememberCloudWorkflowPath(value: string) {
    setCloudWorkflowPath(value);
    localStorage.setItem(CLOUD_WORKFLOW_STORAGE_KEY, value);
    setWorkflowMessage("云端路径已修改，点击“检查云端工作流”确认");
  }

  function rememberCloudWorkflowId(value: string) {
    setCloudWorkflowId(value);
    localStorage.setItem(CLOUD_WORKFLOW_ID_STORAGE_KEY, value);
    setWorkflowMessage("云端工作流 ID 已修改");
  }

  async function refreshWorkflowCatalog() {
    const response = await fetch("/api/local/workflows");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "工作流目录读取失败");
    setWorkflowCatalog({ local: Array.isArray(data.local) ? data.local : [], cloud: Array.isArray(data.cloud) ? data.cloud : [] });
  }

  async function validateLocalWorkflowPath(value = localWorkflowPath) {
    const workflowPath = value.trim();
    if (!workflowPath) {
      setWorkflowMessage("请先填写工作流 JSON 路径");
      return false;
    }
    setWorkflowMessage("正在读取并校验工作流…");
    try {
      const response = await fetch(`/api/local/workflow?path=${encodeURIComponent(workflowPath)}`);
      const workflow = await response.json();
      if (!response.ok) throw new Error(workflow.error || "工作流读取失败");
      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : Object.values(workflow);
      const hasDirector = nodes.some((node: any) => node?.type === "MiniMaxH3Director" || node?.class_type === "MiniMaxH3Director");
      if (!hasDirector) throw new Error("未找到 MiniMaxH3Director 节点");
      rememberWorkflowPath(workflowPath);
      setWorkflowMessage(`校验通过 · ${nodes.length} 个节点 · 可用于本地生成`);
      return true;
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function validateCloudWorkflowPath(value = cloudWorkflowPath) {
    const workflowPath = value.trim();
    if (!workflowPath) { setWorkflowMessage("请先填写云端工作流 JSON 路径"); return false; }
    setWorkflowMessage("正在读取并校验云端工作流…");
    try {
      const response = await fetch(`/api/local/workflow?path=${encodeURIComponent(workflowPath)}`);
      const workflow = await response.json();
      if (!response.ok) throw new Error(workflow.error || "云端工作流读取失败");
      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : Object.values(workflow);
      const supported = nodes.some((node: any) => ["FeiHouEasyH3RH", "MiniMaxH3ReferenceToVideo", "MiniMaxH3Director"].includes(node?.type || node?.class_type));
      if (!supported) throw new Error("未找到 FeiHouEasyH3RH、MiniMaxH3ReferenceToVideo 或 MiniMaxH3Director 节点");
      rememberCloudWorkflowPath(workflowPath);
      setWorkflowMessage(`校验通过 · ${nodes.length} 个节点 · 可用于云端生成`);
      await refreshWorkflowCatalog();
      return true;
    } catch (error) { setWorkflowMessage(error instanceof Error ? error.message : String(error)); return false; }
  }

  async function importLocalWorkflow(file: File, kind: "local" | "cloud" = "local") {
    setWorkflowMessage(`正在导入 ${file.name}…`);
    try {
      // Reading the selected file and copying it into the DirectorMaster
      // workspace is intentional: browsers do not expose arbitrary local
      // paths to JavaScript, while the local ComfyUI runtime needs a server
      // readable path for the workflow.
      const response = await fetch("/api/local/workflow/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, dataBase64: await toBase64(file), kind }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "工作流导入失败");
      if (kind === "cloud") await validateCloudWorkflowPath(String(data.path));
      else await validateLocalWorkflowPath(String(data.path));
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (kind === "cloud") { if (cloudWorkflowInputRef.current) cloudWorkflowInputRef.current.value = ""; }
      else if (workflowInputRef.current) workflowInputRef.current.value = "";
    }
  }

  async function restoreProject(projectId: string) {
    const response = await fetch("/api/local/mv/projects?id=" + encodeURIComponent(projectId));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "项目读取失败");
    const audioResponse = await fetch("/api/local/file?path=" + encodeURIComponent(data.sourcePath));
    if (!audioResponse.ok) throw new Error("项目音频读取失败");
    await decode(await audioResponse.blob());
    setProject(data);
    setReplaceProjectId(null);
    setVisualAssets(Array.isArray(data.visualAssets) ? data.visualAssets : []);
    setProjectName(data.projectName || data.projectId);
    setLeadSilenceSec(Number(data.leadSilenceSec ?? 0));
    const restoredTrimStart = Math.max(0, Number(data.trimStart || 0));
    setTrimRange({
      start: restoredTrimStart,
      end: Math.min(Number(data.duration), Number(data.trimEnd || data.duration)),
    });
    setCurrentTime(restoredTrimStart);
    setCuts(uniqueCuts(data.cuts || [], Number(data.duration)));
    setNotes(Array.isArray(data.segments) ? data.segments.map((item: any) => ({
      kind: item.kind === "instrumental" ? "instrumental" : "vocal",
      lyrics: String(item.lyrics || ""),
      direction: String(item.direction || ""),
    })) : []);
    setGeneratedPrompts(Array.isArray(data.promptBundle?.prompts) ? data.promptBundle.prompts : []);
    setGeneratedFrom(String(data.promptBundle?.signature || ""));
    const savedSettings = data.settings || data;
    setSettings((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(current).filter((key) => typeof savedSettings[key] === "string").map((key) => [key, savedSettings[key]])),
    }));
    localStorage.setItem("director-mv-last-project", data.projectId);
    setNotice(`已恢复项目「${data.projectName || data.projectId}」 · ${clock(Number(data.duration))}`);
  }

  async function saveCurrentProject() {
    if (!project) return;
    const response = await fetch("/api/local/mv/projects", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.projectId,
        sourcePath: project.sourcePath,
        cuts,
        segments: notes,
        visualAssets,
        leadSilenceSec: project.leadSilenceSec ?? leadSilenceSec,
        trimStart: trimRange.start,
        trimEnd: trimRange.end || project.duration,
        settings,
        promptBundle: { prompts: generatedPrompts, signature: generatedFrom },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "当前项目保存失败");
  }

  async function importHistoryProject(projectId: string) {
    if (busy) return;
    setBusy("正在保存并导入项目…");
    try {
      await saveCurrentProject();
      audioRef.current?.pause();
      setGeneration({});
      setResult(null);
      await restoreProject(projectId);
      setHistoryOpen(false);
      await refreshRecentProjects();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedWorkflowPath = localStorage.getItem(LOCAL_WORKFLOW_STORAGE_KEY);
      if (savedWorkflowPath && savedWorkflowPath.includes("workspace\\workflows\\mv-local")) {
        localStorage.setItem(LOCAL_WORKFLOW_STORAGE_KEY, LOCAL_WORKFLOW_PATH);
        setLocalWorkflowPath(LOCAL_WORKFLOW_PATH);
      } else if (savedWorkflowPath) setLocalWorkflowPath(savedWorkflowPath);
      const savedCloudWorkflowPath = localStorage.getItem(CLOUD_WORKFLOW_STORAGE_KEY);
      if (!savedCloudWorkflowPath || savedCloudWorkflowPath === LEGACY_CLOUD_WORKFLOW_PATH) {
        localStorage.setItem(CLOUD_WORKFLOW_STORAGE_KEY, CLOUD_WORKFLOW_PATH);
        setCloudWorkflowPath(CLOUD_WORKFLOW_PATH);
      } else setCloudWorkflowPath(savedCloudWorkflowPath);
      const savedCloudWorkflowId = localStorage.getItem(CLOUD_WORKFLOW_ID_STORAGE_KEY);
      if (savedCloudWorkflowId) setCloudWorkflowId(savedCloudWorkflowId);
      void refreshWorkflowCatalog().catch(() => undefined);
      void refreshRecentProjects().catch(() => undefined);
      const lastProject = localStorage.getItem("director-mv-last-project");
      if (lastProject) void restoreProject(lastProject).catch(() => localStorage.removeItem("director-mv-last-project"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/local/mv/projects", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: project.projectId,
          sourcePath: project.sourcePath,
          cuts,
          segments: notes,
          visualAssets,
          leadSilenceSec: project.leadSilenceSec ?? leadSilenceSec,
          trimStart: trimRange.start,
          trimEnd: trimRange.end || project.duration,
          settings,
          promptBundle: { prompts: generatedPrompts, signature: generatedFrom },
        }),
      }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, cuts, notes, settings, visualAssets, generatedPrompts, generatedFrom, trimRange]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const update = () => {
      if (audioRef.current) {
        const rangeEnd = trimRange.end || project?.duration || 0;
        if (rangeEnd && audioRef.current.currentTime >= rangeEnd) {
          audioRef.current.pause();
          audioRef.current.currentTime = rangeEnd;
        }
        setCurrentTime(audioRef.current.currentTime);
      }
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, trimRange, project]);

  // Prevent the browser from navigating to a dropped local file. The drop zone
  // still receives the event and handles the upload below.
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault();
    };
    // Capture phase is important: Chromium may navigate before a React
    // bubble listener gets a chance to cancel a file drop outside the target.
    document.addEventListener("dragover", preventFileNavigation, true);
    document.addEventListener("drop", preventFileNavigation, true);
    return () => {
      document.removeEventListener("dragover", preventFileNavigation, true);
      document.removeEventListener("drop", preventFileNavigation, true);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const buffer = bufferRef.current;
    if (!canvas || !buffer || !project) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0a1019";
    context.fillRect(0, 0, width, height);
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    for (let x = 0; x < width; x += 1) {
      let peak = 0;
      const begin = x * step;
      for (let i = begin; i < Math.min(data.length, begin + step); i += Math.max(1, Math.floor(step / 32)))
        peak = Math.max(peak, Math.abs(data[i]));
      const amplitude = Math.max(1, peak * (height * 0.72));
      context.fillStyle = "#3b7894";
      context.fillRect(x, (height - amplitude) / 2, 1, amplitude);
    }
    context.fillStyle = "rgba(107, 92, 255, .22)";
    segments.forEach((segment, index) => {
      if (index % 2 === 0) context.fillRect((segment.start / project.duration) * width, 0, (segment.duration / project.duration) * width, height);
    });
  }, [project, cuts, segments.length, timelineZoom]);

  useEffect(() => {
    // A replacement or restored project has a new time base. Start its view
    // from the beginning instead of keeping the previous project's zoom and
    // horizontal scroll position.
    setTimelineZoom(1);
    if (waveScrollRef.current) waveScrollRef.current.scrollLeft = 0;
  }, [project?.sourcePath]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setUndo((history) => {
          const last = history.at(-1);
          if (last) {
            setCuts(last.cuts);
            setNotes(last.notes);
            setTrimRange(last.trimRange);
          }
          return history.slice(0, -1);
        });
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        const audio = audioRef.current;
        if (!audio || !project) return;
        if (audio.paused) {
          if (audio.currentTime < trimRange.start || audio.currentTime >= (trimRange.end || project.duration))
            audio.currentTime = trimRange.start;
          void audio.play();
        }
        else audio.pause();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && ["v", "c", "t"].includes(event.key.toLowerCase())) {
        const nextTool = ({ v: "seek", c: "cut", t: "trim" } as const)[event.key.toLowerCase() as "v" | "c" | "t"];
        setTrackTool(nextTool);
        setSelectedCut(null);
        setNotice(nextTool === "seek" ? "播放定位模式：拖动白色播放头或点击波形定位" : nextTool === "cut" ? "切点编辑模式：拖动橙色切点，右键波形可新增" : "音频边界模式：拖动青色 IN / OUT 调整范围");
        return;
      }
      if (event.key === "Escape") {
        setCutMenu(null);
        setBatchProvider(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedCut != null) {
        event.preventDefault();
        rememberCuts();
        const removedIndex = cuts.indexOf(selectedCut);
        setCuts((old) => old.filter((value) => value !== selectedCut));
        setNotes((old) => old.filter((_, index) => index !== removedIndex + 1));
        setGeneration({});
        setResult(null);
        setSelectedCut(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [project, cuts, selectedCut, trimRange]);

  function rememberCuts() {
    setUndo((history) => [
      ...history.slice(-49),
      { cuts: [...cuts], notes: notes.map((note) => ({ ...note })), trimRange: { ...trimRange } },
    ]);
  }

  function addCut(time: number) {
    if (!project) return;
    const rangeEnd = trimRange.end || project.duration;
    if (time <= trimRange.start + MIN_SEGMENT || time >= rangeEnd - MIN_SEGMENT) {
      setNotice("切点必须位于当前音频片段的入点和出点之间");
      return;
    }
    const next = uniqueCuts([...cuts, time], project.duration);
    if (next.length === cuts.length) {
      setNotice("切点离边界或已有切点太近，已忽略");
      return;
    }
    rememberCuts();
    const insertionIndex = cuts.filter((value) => value < time).length + 1;
    setCuts(next);
    setNotes((old) => {
      const normalized = Array.from(
        { length: cuts.length + 1 },
        (_, index) => old[index] || emptyNote(),
      );
      normalized.splice(insertionIndex, 0, emptyNote());
      return normalized;
    });
    setGeneration({});
    setResult(null);
    setSelectedCut(Number(time.toFixed(3)));
    const nextPoints = [trimRange.start, ...next.filter((value) => value > trimRange.start && value < rangeEnd), rangeEnd];
    const hasLongSegment = nextPoints.some((value, index) => index > 0 && value - nextPoints[index - 1] > MAX_SEGMENT + 0.001);
    setNotice(`已在 ${clock(time)} 添加切点${hasLongSegment ? "；仍有超过 15 秒的片段，时长已标红" : ""}`);
  }

  async function decode(blob: Blob) {
    const audioContext = new AudioContext();
    try {
      bufferRef.current = await audioContext.decodeAudioData(await blob.arrayBuffer());
    } finally {
      await audioContext.close();
    }
  }

  async function upload(file: File, forcedReplaceProjectId: string | null = replaceProjectId) {
    setBusy("正在解析并保存音频…");
    setNotice("");
    // A new source track has a different clock. Do not carry the previous
    // track's split points, notes, generation jobs, or result into it.
    audioRef.current?.pause();
    setPlaying(false);
    setResult(null);
    setGeneration({});
    setBatchSelection([]);
    setSelectedCut(null);
    setTrackTool("seek");
    try {
      const response = await fetch("/api/local/mv/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectName, fileName: file.name, leadSilenceSec, replaceProjectId: forcedReplaceProjectId, visualAssets, dataBase64: await toBase64(file) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "上传失败");
      const paddedAudio = await fetch("/api/local/file?path=" + encodeURIComponent(data.sourcePath));
      if (!paddedAudio.ok) throw new Error("前置空白音频读取失败");
      await decode(await paddedAudio.blob());
      setProject(data);
      setReplaceProjectId(null);
      setTrimRange({ start: 0, end: Number(data.duration) });
      setVisualAssets(Array.isArray(data.visualAssets) ? data.visualAssets : []);
      setCuts([]);
      setUndo([]);
      setNotes([emptyNote()]);
      setGeneratedPrompts([]);
      setGeneratedFrom("");
      setCurrentTime(0);
      setNotice(`音轨已建立 · ${clock(data.duration)} · ${data.sampleRate || "?"} Hz`);
      localStorage.setItem("director-mv-last-project", data.projectId);
      void refreshRecentProjects();
    } catch (error) {
      bufferRef.current = null;
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function startReplaceMusic() {
    if (!project) return null;
    const currentProjectId = project.projectId;
    // Flush the current project's latest asset descriptions before detaching
    // it from the UI. The replacement request also carries the current list,
    // so a quick replacement cannot lose edits made moments earlier.
    await saveCurrentProject().catch(() => undefined);
    audioRef.current?.pause();
    setPlaying(false);
    setReplaceProjectId(project.projectId);
    setProject(null);
    bufferRef.current = null;
    setResult(null);
    setNotice("替换音乐：人物、场景素材和描述会保留；切点与提示词将在新音轨上重新建立");
    return currentProjectId;
  }

  async function replaceWithDroppedFile(file: File) {
    if (busy || generationBusy) {
      setNotice("当前仍有任务运行，请完成或停止后再替换音乐");
      return;
    }
    const replacementId = await startReplaceMusic();
    await upload(file, replacementId);
  }

  async function startNewProject() {
    await saveCurrentProject().catch(() => undefined);
    audioRef.current?.pause();
    setPlaying(false);
    setReplaceProjectId(null);
    setProject(null);
    bufferRef.current = null;
    setResult(null);
    setVisualAssets([]);
    setCuts([]);
    setNotes([emptyNote()]);
    setGeneratedPrompts([]);
    setGeneratedFrom("");
    setGeneration({});
    setBatchSelection([]);
    setSelectedCut(null);
    setNotice("新项目：请上传音乐；不会删除历史项目");
  }

  async function applyLeadSilence() {
    if (!project || busy) return;
    setBusy("正在重建 SOURCE TRACK…");
    try {
      await saveCurrentProject();
      const response = await fetch("/api/local/mv/projects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId, addLeadSilenceSec: prependSilenceSec }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "前置空白更新失败");
      await restoreProject(project.projectId);
      setResult(null);
      setLeadSilenceSec(Number(data.leadSilenceSec || 0));
      setNotice(`已在开头新增 ${prependSilenceSec.toFixed(1)} 秒空白；音频总长度变为 ${clock(Number(data.duration))}`);
      void refreshRecentProjects();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function uploadVisualAssets(files: FileList | File[], category: "人物" | "场景") {
    if (!project) return;
    const incoming = Array.from(files);
    const available = 9 - visualAssets.length;
    if (!available) {
      setNotice("视觉参考图已经达到 MiniMax H3 的 9 张上限");
      return;
    }
    const accepted = incoming.slice(0, available);
    setBusy(`正在上传${category}素材 0/${accepted.length}…`);
    const uploaded: Asset[] = [];
    try {
      for (let index = 0; index < accepted.length; index += 1) {
        const file = accepted[index];
        setBusy(`正在上传${category}素材 ${index + 1}/${accepted.length}…`);
        const response = await fetch("/api/local/mv/assets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: project.projectId,
            category,
            fileName: file.name,
            dataBase64: await toBase64(file),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `${file.name} 上传失败`);
        uploaded.push(data);
      }
      setVisualAssets((old) =>
        category === "人物"
          ? [
              ...old.filter((asset) => asset.category === "人物"),
              ...uploaded,
              ...old.filter((asset) => asset.category === "场景"),
            ]
          : [...old, ...uploaded],
      );
      setNotice(`已添加 ${uploaded.length} 张${category}素材${incoming.length > available ? `，另有 ${incoming.length - available} 张因 9 图上限未添加` : ""}`);
    } catch (error) {
      if (uploaded.length) setVisualAssets((old) => [...old, ...uploaded]);
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function moveVisualAsset(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= visualAssets.length) return;
    setVisualAssets((old) => {
      const next = [...old];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function removeVisualAsset(asset: Asset) {
    if (!project) return;
    if (!window.confirm(`删除素材“${asset.name}”？`)) return;
    if (!window.confirm("再次确认：文件会从当前 MV 项目目录中删除，此操作不能撤销。")) return;
    setBusy("正在删除视觉素材…");
    try {
      const response = await fetch("/api/local/mv/assets", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId, assetId: asset.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败");
      setVisualAssets((old) => old.filter((item) => item.id !== asset.id));
      setNotice(`已删除 ${asset.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function autoSplit() {
    const buffer = bufferRef.current;
    if (!buffer || !project) return;
    const next = suggestCutsFromBuffer(buffer, project.duration, trimRange.start, trimRange.end || project.duration);
    rememberCuts();
    setCuts(uniqueCuts(next, project.duration));
    setNotes(Array.from({ length: next.length + 1 }, () => emptyNote()));
    setGeneratedPrompts([]);
    setGeneratedFrom("");
    setGeneration({});
    setResult(null);
    setNotice("已按低能量停顿生成建议切点；请试听并确认每段不超过 15 秒，并在自然停顿处结束");
  }

  function resetCuts() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = trimRange.start;
    rememberCuts();
    setCuts([]);
    setNotes([emptyNote()]);
    setGeneratedPrompts([]);
    setGeneratedFrom("");
    setSelectedCut(null);
    setCurrentTime(trimRange.start);
    setResult(null);
    setNotice("切点已清空，可以从头重新切割");
  }

  function generatePrompts() {
    if (!project) return;
    if (invalidSegments.length) {
      setNotice("仍有片段超过 15 秒，请先继续切割");
      return;
    }
    if (missingVisualKinds.length) {
      setNotice(`请先上传${missingVisualKinds.join("和")}素材`);
      return;
    }
    const prompts = segments.map((segment, index) =>
      buildStandardBandMvPrompt({
        projectName: project.projectName,
        segment,
        note: notes[index] || emptyNote(),
        assets: visualAssets,
        settings,
        leadSilenceSec: Number(project.leadSilenceSec || 0),
      }),
    );
    setGeneratedPrompts(prompts);
    setGeneratedFrom(promptInputSignature);
    setResult(null);
      setNotice(`已按标准乐队 MV 模板生成 ${prompts.length} 段提示词，请逐段审核`);
  }

  async function exportSegments() {
    if (!project) return;
    if (invalidSegments.length) {
      setNotice("存在超过 15 秒或短于 0.25 秒的片段，不能导出");
      return;
    }
    if (missingVisualKinds.length) {
      setNotice(`请先上传${missingVisualKinds.join("和")}素材`);
      return;
    }
    if (!promptsReady) {
      setNotice("请先生成并审核当前版本的分段提示词");
      return;
    }
    setBusy("正在无损定位并导出 WAV 分段…");
    setResult(null);
    try {
      const authored = segments.map((segment, index) => {
        const note = notes[index] || emptyNote();
        return {
          ...note,
          prompt: generatedPrompts[index],
        };
      });
      const response = await fetch("/api/local/mv/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId, sourcePath: project.sourcePath, cuts, trimStart: trimRange.start, trimEnd: trimRange.end || project.duration, segments: authored, settings: { ...settings, visualAssets } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导出失败");
      setResult(data);
      setNotice(`已导出 ${data.segments.length} 段音频及 H3 提示词清单`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function setSegmentGeneration(index: number, value: SegmentGeneration) {
    setGeneration((current) => ({ ...current, [index]: value }));
  }

  function segmentListFor(cutValues: number[]) {
    if (!project) return [];
    const rangeEnd = trimRange.end || project.duration;
    const points = [trimRange.start, ...cutValues.filter((value) => value > trimRange.start && value < rangeEnd).sort((a, b) => a - b), rangeEnd];
    return points.slice(0, -1).map((start, index) => ({ index: index + 1, start, end: points[index + 1], duration: points[index + 1] - start }));
  }

  async function prepareGeneration(
    selectedIndexes: number[],
    cutValues = cuts,
    noteValues = notes,
    promptValues = generatedPrompts,
  ) {
    if (!project) throw new Error("请先上传音乐");
    const selectedSegments = segmentListFor(cutValues);
    if (promptValues.length !== selectedSegments.length) throw new Error("请先生成当前版本的分段提示词");
    const invalid = selectedSegments.filter((segment) => segment.duration > MAX_SEGMENT + 0.001 || segment.duration < MIN_SEGMENT);
    if (invalid.length) throw new Error("仍有片段超过 15 秒或过短");
    if (!selectedIndexes.length) throw new Error("至少选择一个片段");
    const authored = selectedSegments.map((segment, index) => ({
      ...(noteValues[index] || emptyNote()),
      prompt: promptValues[index],
    }));
    const response = await fetch("/api/local/mv/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.projectId,
        sourcePath: project.sourcePath,
        cuts: cutValues,
        trimStart: trimRange.start,
        trimEnd: trimRange.end || project.duration,
        segments: authored,
        settings: { ...settings, visualAssets },
      }),
    });
    const exported = await response.json();
    if (!response.ok) throw new Error(exported.error || "音频分段准备失败");
    setResult(exported);
    const ordered = [...selectedIndexes].sort((a, b) => a - b);
    return ordered.map((segmentIndex, selectedIndex): DirectorSegmentInput => {
      const audio = exported.segments[segmentIndex];
      if (!audio?.path) throw new Error(`SEG ${String(segmentIndex + 1).padStart(2, "0")} 音频未导出`);
      return {
        id: `mv-${project.projectId}-seg-${segmentIndex + 1}`,
      durationSec: selectedSegments[segmentIndex].duration,
        enabled: true,
        continuityFromPrev:
          selectedIndex > 0 && ordered[selectedIndex - 1] + 1 === segmentIndex,
        prompt: promptValues[segmentIndex],
        negativePrompt:
          "identity drift, face change, costume change, duplicated subject, malformed hands, teleportation, subtitles, captions, watermark, logo, replacement music",
        definitions: "",
        pictures: visualAssets.map((asset) => ({
          ...asset,
          fileName: asset.fileName || asset.path.split(/[\\/]/).pop() || `${asset.id}.png`,
          category: asset.category || "人物",
        })) as any,
        audios: [{
          id: `mv:${project.projectId}:audio:${segmentIndex + 1}`,
          name: `SEG ${String(segmentIndex + 1).padStart(2, "0")} 音轨`,
          fileName: audio.fileName,
          path: audio.path,
          mediaType: "audio",
          category: "声音",
          description: "当前 MV 片段的权威同步音轨；完整保留歌曲、演唱、节奏与时间。",
        }] as any,
      };
    });
  }

  async function monitorLocal(promptId: string, selectedIndexes: number[], comfyUrl: string) {
    for (let attempt = 0; attempt < 720; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, GENERATION_POLL_MS));
      const response = await fetch(`/api/local/comfyui/proxy?base=${encodeURIComponent(comfyUrl)}&endpoint=${encodeURIComponent("/history/" + promptId)}`);
      const history = await response.json();
      if (!response.ok) throw new Error(history.error || "读取 ComfyUI 状态失败");
      const record = history[promptId];
      if (!record) {
        selectedIndexes.forEach((index) => setSegmentGeneration(index, { provider: "local", status: "running", message: "ComfyUI 生成中" }));
        continue;
      }
      if (record.status?.status_str === "error")
        throw new Error(JSON.stringify(record.status.messages || record.status));
      const outputs = Object.values(record.outputs || {}).flatMap((node: any) => [
        ...(node.videos || []),
        ...(node.gifs || []),
        ...(node.images || []),
      ]);
      const primary = outputs.find((output: any) => /\.(mp4|webm|mov)$/i.test(output.filename || ""));
      if (!primary?.filename) throw new Error("ComfyUI 已完成，但没有返回视频文件");
      const projectRoot = project!.sourcePath.includes("\\source\\")
        ? project!.sourcePath.split("\\source\\")[0]
        : project!.sourcePath.slice(0, project!.sourcePath.lastIndexOf("\\"));
      const label = selectedIndexes.map((index) => String(index + 1).padStart(2, "0")).join("-");
      const archivedResponse = await fetch("/api/local/comfyui/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          comfyUrl,
          output: primary,
          outputDir: `${projectRoot}\\generated\\local`,
          preferredName: `MV_${project!.projectId}_SEG${label}_local_latest.mp4`,
        }),
      });
      const archived = await archivedResponse.json();
      if (!archivedResponse.ok) throw new Error(archived.error || "本地成片归档失败");
      selectedIndexes.forEach((index) => setSegmentGeneration(index, {
        provider: "local",
        status: "done",
        message: selectedIndexes.length > 1 ? "本地连续片段已完成" : "本地成片已完成",
        outputPath: archived.path,
      }));
      setNotice(`本地生成完成 · SEG ${label}`);
      return;
    }
    throw new Error("等待 ComfyUI 超时");
  }

  async function generateLocal(selectedIndexes: number[]) {
    if (generationBusy) return;
    selectedIndexes.forEach((index) => setSegmentGeneration(index, { provider: "local", status: "preparing", message: "准备导演台工作流" }));
    try {
      const inputs = await prepareGeneration(selectedIndexes);
      const discoverResponse = await fetch("/api/local/comfyui/discover");
      const comfy = await discoverResponse.json();
      if (!discoverResponse.ok || !comfy.found || !comfy.url)
        throw new Error("未发现运行中的本机 ComfyUI；不会启动新实例");
      const uniqueAssets = Array.from(new Map(inputs.flatMap((segment) => [...segment.pictures, ...segment.audios]).map((asset) => [asset.path, asset])).values());
      for (const [assetIndex, asset] of uniqueAssets.entries()) {
        selectedIndexes.forEach((index) => setSegmentGeneration(index, {
          provider: "local",
          status: "preparing",
          message: `上传素材 ${assetIndex + 1}/${uniqueAssets.length}`,
        }));
        const uploadResponse = await fetch("/api/local/comfyui/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: asset.path, fileName: asset.fileName, comfyUrl: comfy.url }),
        });
        const uploaded = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploaded.error || `上传失败：${asset.name}`);
      }
      const workflowPath = localWorkflowPath.trim() || LOCAL_WORKFLOW_PATH;
      const templateResponse = await fetch(`/api/local/workflow?path=${encodeURIComponent(workflowPath)}`);
      const template = await templateResponse.json();
      if (!templateResponse.ok) throw new Error(template.error || `导演台工作流读取失败：${workflowPath}`);
      const compiled = patchDirectorProject(template, inputs, {
        ...localDirectorSettings,
        continuityEnabled: selectedIndexes.length > 1,
      });
      validateDirectorReferences(compiled, inputs);
      const workflow = uiWorkflowToApi(compiled);
      validateDirectorReferences(workflow, inputs);
      const queueResponse = await fetch(`/api/local/comfyui/proxy?base=${encodeURIComponent(comfy.url)}&endpoint=${encodeURIComponent("/prompt")}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
      });
      const queued = await queueResponse.json();
      if (!queueResponse.ok || queued.error) throw new Error(queued.error?.message || queued.error || "提交 ComfyUI 失败");
      selectedIndexes.forEach((index) => setSegmentGeneration(index, { provider: "local", status: "queued", message: "已进入 ComfyUI 队列" }));
      await monitorLocal(queued.prompt_id, selectedIndexes, comfy.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      selectedIndexes.forEach((index) => setSegmentGeneration(index, { provider: "local", status: "error", message }));
      setNotice(message);
    }
  }

  async function waitCloud(jobId: string, segmentIndex: number): Promise<string> {
    for (let attempt = 0; attempt < 720; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      const response = await fetch(`/api/local/runninghub/jobs?id=${encodeURIComponent(jobId)}`);
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "读取 RunningHub 状态失败");
      if (job.status === "FAILED") throw new Error(job.error || "RunningHub 生成失败");
      if (job.status === "SUCCESS") {
        const outputPath = job.outputs?.[0]?.path;
        if (!outputPath) throw new Error("RunningHub 已完成，但没有返回视频文件");
        setSegmentGeneration(segmentIndex, { provider: "runninghub", status: "done", message: "云端成片已完成", outputPath, jobId });
        return outputPath;
      }
      setSegmentGeneration(segmentIndex, { provider: "runninghub", status: "running", message: job.stage || "RunningHub 生成中", jobId });
    }
    throw new Error("等待 RunningHub 超时");
  }

  async function generateCloud(
    selectedIndexes: number[],
    prepared?: { cuts: number[]; notes: SegmentNote[]; prompts: string[] },
  ) {
    if (generationBusy) return;
    if (!cloudWorkflowId.trim()) { setNotice("请先在“工作流配置”中填写 RunningHub 工作流 ID"); setWorkflowConfigOpen(true); setWorkflowTab("cloud"); return; }
    try {
      const inputs = await prepareGeneration(
        selectedIndexes,
        prepared?.cuts,
        prepared?.notes,
        prepared?.prompts,
      );
      const outputs: string[] = [];
      for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
        const segmentIndex = [...selectedIndexes].sort((a, b) => a - b)[inputIndex];
        setSegmentGeneration(segmentIndex, { provider: "runninghub", status: "preparing", message: "准备上传云端素材" });
        try {
          const response = await fetch("/api/local/runninghub/jobs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              workflowId: cloudWorkflowId.trim(),
              workflowPath: cloudWorkflowPath.trim(),
              segments: [inputs[inputIndex]],
              sequenceNos: [segmentIndex + 1],
              settings: { steps: 8, megapixels: 0.6 },
            }),
          });
          const job = await response.json();
          if (!response.ok) throw new Error(job.error || "RunningHub 提交失败");
          setSegmentGeneration(segmentIndex, { provider: "runninghub", status: "queued", message: "云端排队中", jobId: job.id });
          outputs.push(await waitCloud(job.id, segmentIndex));
        } catch (error) {
          setSegmentGeneration(segmentIndex, { provider: "runninghub", status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      }
      if (outputs.length === inputs.length && outputs.length) {
        const composeResponse = await fetch("/api/local/mv/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project?.projectId, videos: outputs, trimStart: trimRange.start, trimEnd: trimRange.end || project?.duration }) });
        const composed = await composeResponse.json();
        if (!composeResponse.ok) throw new Error(composed.error || "完整 MV 合成失败");
        setResult((current: any) => ({ ...(current || {}), finalVideoPath: composed.outputPath }));
        setNotice(`云端分段全部完成，已使用原始音乐合成完整 MV（${outputs.length} 段）`);
      }
      if (outputs.length !== inputs.length) setNotice(`云端串行任务已处理 ${selectedIndexes.length} 个片段`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function generateFullMv() {
    if (!project) { setNotice("请先上传音乐"); return; }
    if (generationBusy || busy) return;
    if (missingVisualKinds.length) { setNotice(`请先上传${missingVisualKinds.join("和")}素材`); return; }
    setBusy("正在自动切段并生成提示词…");
    try {
      if (!cuts.length && !bufferRef.current) throw new Error("音乐波形尚未准备好，请稍后再试");
      const autoCuts = cuts.length ? cuts : suggestCutsFromBuffer(bufferRef.current!, project.duration, trimRange.start, trimRange.end || project.duration);
      const autoSegments = segmentListFor(autoCuts);
      if (autoSegments.some((segment) => segment.duration > MAX_SEGMENT + 0.001 || segment.duration < MIN_SEGMENT))
        throw new Error("自动切段仍有超出 15 秒的片段，请手动调整");
      const autoNotes = autoSegments.map((_, index) => notes[index] || emptyNote());
      const autoPrompts = autoSegments.map((segment, index) => buildStandardBandMvPrompt({ projectName: project.projectName, segment, note: autoNotes[index], assets: visualAssets, settings, leadSilenceSec: Number(project.leadSilenceSec || 0) }));
      const signature = JSON.stringify({ templateVersion: BAND_MV_PROMPT_TEMPLATE_VERSION, cuts: autoCuts, duration: project.duration, notes: autoNotes, visualAssets: visualAssets.map(({ id, category, description }) => ({ id, category, description })), settings, leadSilenceSec, trimRange });
      setCuts(autoCuts); setNotes(autoNotes); setGeneratedPrompts(autoPrompts); setGeneratedFrom(signature);
      setNotice(`已自动切成 ${autoSegments.length} 段，正在按顺序提交云端 MV 任务…`);
      setBusy("");
      await generateCloud(autoSegments.map((_, index) => index), { cuts: autoCuts, notes: autoNotes, prompts: autoPrompts });
    } catch (error) {
      setBusy("");
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  function openBatch(provider: GenerationProvider) {
    setBatchSelection(segments.map((_, index) => index));
    setBatchProvider(provider);
  }

  function runBatch() {
    const provider = batchProvider;
    const selected = [...batchSelection].sort((a, b) => a - b);
    setBatchProvider(null);
    if (provider === "local") void generateLocal(selected);
    if (provider === "runninghub") void generateCloud(selected);
  }

  function timeAtWaveX(clientX: number) {
    if (!project || !waveInnerRef.current) return 0;
    const rect = waveInnerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * project.duration;
  }

  function handleTimelineWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!project || !waveScrollRef.current || !waveInnerRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const scroll = waveScrollRef.current;
    const innerRect = waveInnerRef.current.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const anchorRatio = Math.max(0, Math.min(1, (event.clientX - innerRect.left) / innerRect.width));
    const viewportOffset = event.clientX - scrollRect.left;
    const nextZoom = Math.max(1, Math.min(24, Number((timelineZoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18)).toFixed(2))));
    if (nextZoom === timelineZoom) return;
    setTimelineZoom(nextZoom);
    // Restore the scroll position after the wider inner track is laid out so
    // the timestamp under the pointer remains under the pointer.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const nextInner = waveInnerRef.current;
      if (!nextInner || !waveScrollRef.current) return;
      const targetX = anchorRatio * nextInner.getBoundingClientRect().width;
      waveScrollRef.current.scrollLeft = Math.max(0, targetX - viewportOffset);
    }));
  }

  function changeTimelineZoom(nextZoom: number) {
    if (!project || !waveScrollRef.current || !waveInnerRef.current) return;
    const scroll = waveScrollRef.current;
    const inner = waveInnerRef.current;
    const currentWidth = Math.max(1, inner.getBoundingClientRect().width);
    const anchorRatio = Math.max(0, Math.min(1, (scroll.scrollLeft + scroll.clientWidth / 2) / currentWidth));
    const next = Math.max(1, Math.min(24, Number(nextZoom.toFixed(2))));
    setTimelineZoom(next);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const nextInner = waveInnerRef.current;
      if (!nextInner || !waveScrollRef.current) return;
      waveScrollRef.current.scrollLeft = Math.max(0, anchorRatio * nextInner.getBoundingClientRect().width - scroll.clientWidth / 2);
    }));
  }

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (trackTool !== "seek" || event.button !== 0 || !project || !audioRef.current) return;
    const raw = timeAtWaveX(event.clientX);
    const value = Math.max(trimRange.start, Math.min(trimRange.end || project.duration, raw));
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  }

  function dragPlayhead(event: React.PointerEvent<HTMLButtonElement>) {
    if (!project || !audioRef.current || !playheadDragRef.current) return;
    event.stopPropagation();
    const raw = timeAtWaveX(event.clientX);
    const value = Math.max(trimRange.start, Math.min(trimRange.end || project.duration, raw));
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  }

  function finishPlayheadDrag() {
    playheadDragRef.current = false;
    if (playheadWasPlayingRef.current && audioRef.current) void audioRef.current.play();
    playheadWasPlayingRef.current = false;
  }

  function dragTrimHandle(edge: "start" | "end", event: React.PointerEvent<HTMLButtonElement>) {
    if (!project || trimDragRef.current !== edge) return;
    event.stopPropagation();
    const raw = timeAtWaveX(event.clientX);
    setTrimRange((current) => edge === "start"
      ? { start: Number(Math.min(raw, current.end - MIN_SEGMENT).toFixed(3)), end: current.end }
      : { start: current.start, end: Number(Math.max(raw, current.start + MIN_SEGMENT).toFixed(3)) });
  }

  function finishTrim() {
    if (!project) return;
    trimDragRef.current = null;
    const rangeEnd = trimRange.end || project.duration;
    const nextCuts = cuts.filter((value) => value > trimRange.start + MIN_SEGMENT && value < rangeEnd - MIN_SEGMENT);
    setCuts(nextCuts);
    setNotes((current) => Array.from({ length: nextCuts.length + 1 }, (_, index) => current[index] || emptyNote()));
    setGeneratedPrompts([]);
    setGeneratedFrom("");
    setGeneration({});
    setResult(null);
    const nextTime = Math.max(trimRange.start, Math.min(rangeEnd, audioRef.current?.currentTime || trimRange.start));
    if (audioRef.current) audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    setNotice(`音频范围已调整为 ${clock(trimRange.start)} → ${clock(rangeEnd)}（${(rangeEnd - trimRange.start).toFixed(2)} 秒）`);
  }

  function openCutMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!project) return;
    event.preventDefault();
    const time = timeAtWaveX(event.clientX);
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
    setCutMenu({
      x: Math.min(event.clientX, window.innerWidth - 210),
      y: Math.min(event.clientY, window.innerHeight - 130),
      time,
    });
  }

  return (
    <main className="mv-app" onPointerDown={() => { if (cutMenu) setCutMenu(null); }}>
      <header className="mv-topbar">
        <a className="mv-brand" href="/"><span>DM</span><b>DIRECTOR MASTER</b></a>
        <nav><a href="/">导演画布</a><a className="active" href="/mv">MV 制作</a><a href="/voice">声音克隆</a></nav>
        <button className="mv-history-trigger" onClick={() => { void refreshRecentProjects(); setHistoryOpen(true); }}>历史项目 <b>{recentProjects.length}</b></button>
        <button className="mv-workflow-trigger" onClick={() => { setWorkflowConfigOpen(true); setWorkflowMessage(""); }}>工作流配置</button>
        <div className="mv-state"><i className={project ? "online" : ""} />{busy || notice}</div>
      </header>

      <section className="mv-shell">
        <div className="mv-heading">
          <div><small>MINIMAX H3 · AUDIO-FIRST WORKFLOW</small><h1>MV 音频分镜台</h1><p>先把完整歌曲切成不超过 15 秒、且不截断唱句的段落，再为每段生成可审阅的素材映射与 H3 提示词。</p></div>
          <div className="mv-shortcuts"><span><kbd>Space</kbd> 播放 / 暂停</span><span><kbd>V / C / T</kbd> 切换工具</span><span><kbd>右键</kbd> 添加切点</span><span><kbd>Ctrl Z</kbd> 撤销</span><span><kbd>Delete</kbd> 删除切点</span></div>
        </div>

        {!project ? (
          <>
          <section className="mv-upload-card">
            <label>项目名称<input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={64} /></label>
            <label>音频前置空白（秒）<input type="number" min="0" max="30" step="0.1" value={leadSilenceSec} onChange={(event) => setLeadSilenceSec(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} /><small>默认 2 秒，空白会写入 SOURCE TRACK 波形和最终分段音频</small></label>
            {replaceProjectId && <p className="mv-replace-notice"><b>替换当前音乐</b> · 人物/场景素材、描述与项目配置会保留；切点、分段提示词和当前生成状态会按新音轨重置。</p>}
            <div role="button" tabIndex={0} className="mv-drop" onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const file = event.dataTransfer.files[0]; if (file) void upload(file); }}>
              <span className="mv-drop-icon">♫</span><b>拖动音乐文件到这里</b><small>或点击选择 · WAV / MP3 / FLAC / M4A / OGG / AAC · 最大 512 MB</small>
            </div>
            <input ref={inputRef} hidden type="file" accept="audio/*,.flac,.m4a,.aac" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
            <div className="mv-upload-actions"><button className="ghost" onClick={() => void startNewProject()}>新建项目（清空素材）</button>{replaceProjectId && <button className="ghost" onClick={() => { setReplaceProjectId(null); setNotice("已取消替换，原项目素材仍保留"); }}>取消替换</button>}</div>
          </section>
          {recentProjects.length > 0 && <section className="mv-panel mv-recent-projects"><div className="mv-panel-title"><div><small>RECENT WORKSPACES</small><h2>最近项目</h2></div><button className="ghost" onClick={() => void refreshRecentProjects()}>刷新</button></div><div className="mv-recent-list">{recentProjects.map((item) => <button key={item.projectId} className="mv-recent-item" onClick={() => void restoreProject(item.projectId)}><span><b>{item.projectName}</b><small>{item.sourceName} · {clock(Number(item.duration))} · 更新于 {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "未知"}</small></span><i>{item.segments || 1} 段 · {item.visualAssets} 个素材</i></button>)}</div></section>}
          </>
        ) : (
          <>
            <section className="mv-track-panel" onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const file = event.dataTransfer.files[0]; if (file) void replaceWithDroppedFile(file); }}>
              <div className="mv-track-head"><div><small>SOURCE TRACK</small><b>{project.sourceName}</b></div><div><strong className="mv-live-time">{clock(currentTime)}<i>/ {clock(project.duration)}</i></strong><button onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) { if (audio.currentTime < trimRange.start || audio.currentTime >= (trimRange.end || project.duration)) audio.currentTime = trimRange.start; void audio.play(); } else audio.pause(); }}>{playing ? "暂停" : "播放"}</button><button onClick={() => addCut(audioRef.current?.currentTime || 0)}>在播放头裁切</button><button onClick={autoSplit}>智能建议切点</button><button className="warning" onClick={resetCuts}>重新切割</button><button className="ghost" onClick={() => void startReplaceMusic()}>替换音乐</button><button className="ghost" onClick={() => void startNewProject()}>新建项目</button></div></div>
              <audio ref={audioRef} src={`/api/local/file?path=${encodeURIComponent(project.sourcePath)}`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onEnded={() => { setPlaying(false); setCurrentTime(project.duration); }} />
              <div className="mv-audio-pad-control"><label>在开头新增<input type="number" min="0.1" max="120" step="0.1" value={prependSilenceSec} onChange={(event) => setPrependSilenceSec(Math.max(0.1, Math.min(120, Number(event.target.value) || 0.1)))} /><span>秒空白</span></label><button disabled={Boolean(busy) || prependSilenceSec <= 0} onClick={() => void applyLeadSilence()}>增加空白并延长音频</button><small>当前前置空白 {Number(project.leadSilenceSec || 0).toFixed(1)} 秒 · 总长度 {clock(project.duration)}。新增后原音乐和全部切点整体后移。也可以直接把新音乐拖到这条音轨上替换。</small></div>
              <div className="mv-track-tools" role="toolbar" aria-label="音轨编辑工具"><button className={trackTool === "seek" ? "active seek" : ""} aria-pressed={trackTool === "seek"} onClick={() => setTrackTool("seek")}><kbd>V</kbd><b>播放定位</b><span>白线 · 点击或拖动</span></button><button className={trackTool === "cut" ? "active cut" : ""} aria-pressed={trackTool === "cut"} onClick={() => setTrackTool("cut")}><kbd>C</kbd><b>编辑切点</b><span>橙线 · 自由拖动</span></button><button className={trackTool === "trim" ? "active trim" : ""} aria-pressed={trackTool === "trim"} onClick={() => setTrackTool("trim")}><kbd>T</kbd><b>音频边界</b><span>青线 · 调整 IN / OUT</span></button><p>{trackTool === "seek" ? "当前位置只操作播放头，不会误拖切点。" : trackTool === "cut" ? "切点可在有效音频范围内自由移动；超过 15 秒只标红提醒，不阻止编辑。" : "只操作音频入点和出点，切点与播放头暂时锁定。"}</p></div>
              <div className="mv-wave-controls"><span>时间轴缩放 <b>{Math.round(timelineZoom * 100)}%</b></span><button onClick={() => changeTimelineZoom(timelineZoom / 1.5)} disabled={timelineZoom <= 1}>−</button><button onClick={() => changeTimelineZoom(1)}>重置</button><button onClick={() => changeTimelineZoom(timelineZoom * 1.5)} disabled={timelineZoom >= 24}>＋</button><small>滚轮缩放 · 下方滚动条浏览</small></div>
              <div className="mv-wave-viewport" ref={waveScrollRef} onWheel={handleTimelineWheel}>
              <div ref={waveInnerRef} className={`mv-wave tool-${trackTool}`} style={{ width: `${Math.max(1, timelineZoom) * 100}%` }} onPointerDown={seekFromPointer} onContextMenu={openCutMenu}>
                <canvas ref={canvasRef} />
                <div className="mv-trim-mask left" style={{ width: `${(trimRange.start / project.duration) * 100}%` }} />
                <div className="mv-trim-mask right" style={{ width: `${((project.duration - (trimRange.end || project.duration)) / project.duration) * 100}%` }} />
                <div className="mv-trim-selection" style={{ left: `${(trimRange.start / project.duration) * 100}%`, width: `${(((trimRange.end || project.duration) - trimRange.start) / project.duration) * 100}%` }} />
                <button disabled={trackTool !== "trim"} className="mv-trim-handle start" style={{ left: `${(trimRange.start / project.duration) * 100}%` }} title={`拖动调整入点 · ${clock(trimRange.start)}`} onPointerDown={(event) => { event.stopPropagation(); rememberCuts(); trimDragRef.current = "start"; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => dragTrimHandle("start", event)} onPointerUp={finishTrim}><i>IN</i></button>
                <button disabled={trackTool !== "trim"} className="mv-trim-handle end" style={{ left: `${((trimRange.end || project.duration) / project.duration) * 100}%` }} title={`拖动调整出点 · ${clock(trimRange.end || project.duration)}`} onPointerDown={(event) => { event.stopPropagation(); rememberCuts(); trimDragRef.current = "end"; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => dragTrimHandle("end", event)} onPointerUp={finishTrim}><i>OUT</i></button>
                <button disabled={trackTool !== "seek"} className={`mv-playhead ${currentTime / project.duration < .08 ? "near-start" : currentTime / project.duration > .92 ? "near-end" : ""}`} style={{ left: `${(currentTime / project.duration) * 100}%` }} title={`当前播放位置 ${clock(currentTime)}`} onPointerDown={(event) => { event.stopPropagation(); playheadWasPlayingRef.current = Boolean(audioRef.current && !audioRef.current.paused); audioRef.current?.pause(); playheadDragRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); dragPlayhead(event); }} onPointerMove={dragPlayhead} onPointerUp={finishPlayheadDrag} onPointerCancel={finishPlayheadDrag}><span>{clock(currentTime)}</span><i /></button>
                {cuts.map((cut, index) => <button disabled={trackTool !== "cut"} key={index} className={`mv-cut ${selectedCut === cut ? "selected" : ""}`} style={{ left: `${(cut / project.duration) * 100}%` }} title={`${clock(cut)} · 拖动调整`} onClick={(event) => { event.stopPropagation(); setSelectedCut(cut); }} onPointerDown={(event) => { event.stopPropagation(); dragCutRef.current = cut; rememberCuts(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (dragCutRef.current == null) return; const raw = timeAtWaveX(event.clientX); const value = Number(Math.max(trimRange.start + MIN_SEGMENT, Math.min((trimRange.end || project.duration) - MIN_SEGMENT, raw)).toFixed(3)); const previousValue = dragCutRef.current; dragCutRef.current = value; setSelectedCut(value); setCuts((old) => old.map((item) => item === previousValue ? value : item)); }} onPointerUp={() => { dragCutRef.current = null; setCuts((old) => uniqueCuts(old, project.duration)); setGeneratedPrompts([]); setGeneratedFrom(""); setGeneration({}); setResult(null); }} onPointerCancel={() => { dragCutRef.current = null; setCuts((old) => uniqueCuts(old, project.duration)); setGeneratedPrompts([]); setGeneratedFrom(""); setGeneration({}); setResult(null); }}><i /></button>)}
                <div className="mv-ruler">{segments.map((segment) => <span key={segment.index} className={segment.duration > MAX_SEGMENT || segment.duration < MIN_SEGMENT ? "bad" : ""} style={{ left: `${(segment.start / project.duration) * 100}%`, width: `${(segment.duration / project.duration) * 100}%` }}><b>SEG {String(segment.index).padStart(2, "0")}</b><i>{segment.duration.toFixed(2)}s</i></span>)}</div>
              </div>
              </div>
              <div className="mv-track-summary"><span>{segments.length} 段</span><span>{cuts.length} 个切点</span><span className={invalidSegments.length ? "danger" : "ok"}>{invalidSegments.length ? `${invalidSegments.length} 段超过 15 秒或过短` : "全部片段 ≤ 15 秒"}</span><span>编辑不受时长限制；生成前必须处理红色片段</span></div>
            </section>

            <div className="mv-grid">
              <section className="mv-panel mv-prompts"><div className="mv-panel-title"><div><small>PROMPT REVIEW</small><h2>分段最终提示词</h2></div><b>{generatedPrompts.length}/{segments.length}</b></div>
                <div className="mv-prompt-toolbar"><p>标准模板 {BAND_MV_PROMPT_TEMPLATE_VERSION} · 素材顺序对应 Picture 编号，第一张人物图默认为视觉主角。重点核对素材描述、成员站位和分段镜头。</p><div><button className="local" disabled={!promptsReady || generationBusy} onClick={() => openBatch("local")}>本地批量生成</button><button className="cloud" disabled={!promptsReady || generationBusy} onClick={() => openBatch("runninghub")}>云端批量生成</button><button className="cloud" disabled={generationBusy || Boolean(busy) || Boolean(missingVisualKinds.length)} onClick={() => void generateFullMv()}>一键云端出完整 MV</button><button disabled={Boolean(invalidSegments.length) || Boolean(missingVisualKinds.length)} onClick={generatePrompts}>{promptsReady ? "按标准模板重新生成" : "生成标准提示词"}</button></div></div>
                <div className="mv-prompt-list">{segments.map((segment, index) => <article key={`${segment.start}-${segment.end}`} className={segment.duration > MAX_SEGMENT || segment.duration < MIN_SEGMENT ? "invalid" : ""}>
                  <header><div><span>SEG {String(segment.index).padStart(2, "0")}</span><b>{clock(segment.start)} → {clock(segment.end)}</b><i>{segment.duration.toFixed(3)} 秒</i></div><div><button onClick={() => { if (!audioRef.current) return; audioRef.current.currentTime = segment.start; void audioRef.current.play(); window.setTimeout(() => audioRef.current?.pause(), segment.duration * 1000); }}>试听本段</button><button disabled={!generatedPrompts[index]} onClick={() => void navigator.clipboard.writeText(generatedPrompts[index] || "")}>复制提示词</button></div></header>
                  <div className="mv-prompt-refbar"><span>{visualAssets.filter((asset) => asset.category === "人物").length} 人物</span><span>{visualAssets.filter((asset) => asset.category === "场景").length} 场景</span><span>&lt;Audio 1&gt;</span><strong>{generatedPrompts[index] ? promptsReady ? "已生成 · 可审核" : "素材或切点已变化 · 需重新生成" : "等待生成"}</strong></div>
                  {generatedPrompts[index] ? <textarea aria-label={`SEG ${segment.index} 最终提示词`} value={generatedPrompts[index]} onChange={(event) => setGeneratedPrompts((old) => old.map((prompt, promptIndex) => promptIndex === index ? event.target.value : prompt))} /> : <div className="mv-prompt-empty"><b>尚未生成提示词</b><span>完成切点并上传人物、场景素材后，点击上方“生成提示词”。</span></div>}
                  <footer className="mv-segment-generate"><div>{generation[index] ? <><b className={generation[index].status}>{generation[index].message}</b>{generation[index].outputPath && <a href={`/api/local/file?path=${encodeURIComponent(generation[index].outputPath)}`} target="_blank">打开成片</a>}</> : <span>提示词确认后，可单独生成本段视频</span>}</div><div><button disabled={!promptsReady || generationBusy} onClick={() => void generateLocal([index])}>本地生成</button><button className="cloud" disabled={!promptsReady || generationBusy} onClick={() => void generateCloud([index])}>云端生成</button></div></footer>
                  {generation[index]?.outputPath && <video className="mv-segment-video" controls preload="metadata" src={`/api/local/file?path=${encodeURIComponent(generation[index].outputPath!)}`} />}
                </article>)}</div>
              </section>

              <aside className="mv-sidebar">
                <section className="mv-panel mv-reference-panel">
                  <div className="mv-panel-title"><div><small>VISUAL REFERENCES</small><h2>人物与场景素材</h2></div><b>{visualAssets.length}/9</b></div>
                  <p className="mv-help">上传后自动加入引用序列。每张图片严格对应同编号的 &lt;Picture N&gt; 与 &lt;Subject N&gt;；素材描述会直接写入标准提示词，请明确人物身份、乐器、服装、站位，或场景布局与灯光。</p>
                  <div className="mv-visual-uploads">
                    <button className="mv-mini-drop person" onClick={() => personInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadVisualAssets(event.dataTransfer.files, "人物"); }}><b>＋ 人物素材</b><span>人设图、服装图、多视图</span></button>
                    <button className="mv-mini-drop scene" onClick={() => sceneInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadVisualAssets(event.dataTransfer.files, "场景"); }}><b>＋ 场景素材</b><span>舞台、外景、灯光参考</span></button>
                    <input ref={personInputRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { if (event.target.files) void uploadVisualAssets(event.target.files, "人物"); event.target.value = ""; }} />
                    <input ref={sceneInputRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { if (event.target.files) void uploadVisualAssets(event.target.files, "场景"); event.target.value = ""; }} />
                  </div>
                  <div className="mv-reference-list">{visualAssets.map((asset, index) => <article key={asset.id}>
                    <div className="mv-reference-image"><img src={`/api/local/file?path=${encodeURIComponent(asset.path)}`} alt={asset.name} /><b>P{index + 1}</b><span>{asset.category}</span></div>
                    <div className="mv-reference-info"><strong>{asset.name}</strong><textarea maxLength={240} aria-label={`${asset.name} 素材描述`} placeholder={asset.category === "人物" ? "两句内描述人物外貌、发型、服装和身份特征" : "两句内描述场景布局、灯光、色调和空间锚点"} value={asset.description || ""} onChange={(event) => setVisualAssets((old) => old.map((item) => item.id === asset.id ? { ...item, description: event.target.value } : item))} /><div><button disabled={index === 0} onClick={() => moveVisualAsset(index, -1)}>上移</button><button disabled={index === visualAssets.length - 1} onClick={() => moveVisualAsset(index, 1)}>下移</button><button className="danger" onClick={() => void removeVisualAsset(asset)}>删除</button></div></div>
                  </article>)}</div>
                  {!visualAssets.length && <p className="mv-empty">先上传人物和场景参考图；音乐切段仍可独立进行。</p>}
                </section>
                <section className="mv-panel"><div className="mv-panel-title"><div><small>GLOBAL DIRECTION</small><h2>全局导演规则</h2></div></div><label>原音乐人声首次进入（秒）<input type="number" min="0" step="0.1" value={settings.vocalStartSec} onChange={(event) => setSettings({ ...settings, vocalStartSec: event.target.value })} /><small>从未加空白的原音乐起点计算；系统会自动叠加前置空白。人声进入前人物保持闭口。</small></label><label>成员与身份顺序<textarea value={settings.members} onChange={(event) => setSettings({ ...settings, members: event.target.value })} /></label><label>视觉风格<textarea value={settings.style} onChange={(event) => setSettings({ ...settings, style: event.target.value })} /></label><label>舞台与灯光<textarea value={settings.stage} onChange={(event) => setSettings({ ...settings, stage: event.target.value })} /></label><label>服装美术<textarea value={settings.wardrobe} onChange={(event) => setSettings({ ...settings, wardrobe: event.target.value })} /></label><label>表演与队形<textarea value={settings.performance} onChange={(event) => setSettings({ ...settings, performance: event.target.value })} /></label></section>
              </aside>
            </div>

            <section className="mv-export-bar"><div><small>EXPORT PACKAGE</small><b>{invalidSegments.length ? "修正超过 15 秒或过短的片段" : missingVisualKinds.length ? `请上传${missingVisualKinds.join("和")}素材` : !promptsReady ? "先生成并审核当前版本的分段提示词" : `提示词已就绪，可导出 ${segments.length} 个音频片段与审核清单`}</b>{result && <a href={`/api/local/file?path=${encodeURIComponent(result.outputRoot + "\\segments.json")}`} target="_blank">打开 segments.json</a>}</div><button disabled={Boolean(busy) || Boolean(invalidSegments.length) || Boolean(missingVisualKinds.length) || !promptsReady} onClick={() => void exportSegments()}>{busy || "导出音频与提示词清单"}</button></section>
            {result && <section className="mv-result"><h2>已生成</h2>{result.finalVideoPath && <p><a className="mv-final-link" href={`/api/local/file?path=${encodeURIComponent(result.finalVideoPath)}`} target="_blank">打开完整 MV 成片（原始音乐已合成）</a></p>}{result.segments.map((segment: any) => <article key={segment.index}><b>SEG {String(segment.index).padStart(2, "0")}</b><span>{clock(segment.start)}–{clock(segment.end)} · {segment.duration.toFixed(3)}s</span><a href={`/api/local/file?path=${encodeURIComponent(segment.path)}`}>播放音频</a><details><summary>查看 H3 最终提示词</summary><pre>{segment.prompt}</pre></details></article>)}</section>}
          </>
        )}
      </section>
      {cutMenu && <div className="mv-cut-menu" style={{ left: cutMenu.x, top: cutMenu.y }} onPointerDown={(event) => event.stopPropagation()}><small>{clock(cutMenu.time)}</small><button onClick={() => { addCut(cutMenu.time); setCutMenu(null); }}>＋ 在此添加切点</button><button onClick={() => setCutMenu(null)}>取消</button></div>}
      {historyOpen && <div className="mv-batch-backdrop" onPointerDown={() => setHistoryOpen(false)}><section className="mv-history-modal" onPointerDown={(event) => event.stopPropagation()}><header><div><small>SAVED MV WORKSPACES</small><h2>历史项目</h2><p>导入前会自动保存当前项目；项目素材、切点、提示词和音轨设置会一起恢复。</p></div><button onClick={() => setHistoryOpen(false)}>×</button></header><div className="mv-history-list">{recentProjects.map((item) => <article key={item.projectId} className={project?.projectId === item.projectId ? "active" : ""}><div><b>{item.projectName}</b><small>{item.sourceName}</small><span>更新于 {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "未知"}</span></div><dl><div><dt>时长</dt><dd>{clock(Number(item.duration))}</dd></div><div><dt>分段</dt><dd>{item.segments || 1}</dd></div><div><dt>素材</dt><dd>{item.visualAssets}</dd></div><div><dt>前置空白</dt><dd>{Number(item.leadSilenceSec || 0).toFixed(1)}s</dd></div></dl><button disabled={Boolean(busy) || project?.projectId === item.projectId} onClick={() => void importHistoryProject(item.projectId)}>{project?.projectId === item.projectId ? "当前项目" : "一键导入"}</button></article>)}</div>{!recentProjects.length && <p className="mv-empty">还没有已保存的 MV 项目。</p>}</section></div>}
      {batchProvider && <div className="mv-batch-backdrop" onPointerDown={() => setBatchProvider(null)}>
        <section className="mv-batch-modal" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><small>{batchProvider === "local" ? "LOCAL DIRECTOR BATCH" : "RUNNINGHUB SERIAL BATCH"}</small><h2>{batchProvider === "local" ? "本地连续片段生成" : "云端串行生成"}</h2><p>{batchProvider === "local" ? "选中的连续片段会编译进同一个导演台工作流，并开启段间引导。" : "所选片段将逐个上传、生成和下载；前一段结束后才提交下一段。"}</p></div><button onClick={() => setBatchProvider(null)}>×</button></header>
          <div className="mv-batch-tools"><button onClick={() => setBatchSelection(segments.map((_, index) => index))}>全选</button><button onClick={() => setBatchSelection([])}>清空</button><span>已选择 {batchSelection.length}/{segments.length} 段</span></div>
          <div className="mv-batch-list">{segments.map((segment, index) => <label key={segment.index} className={batchSelection.includes(index) ? "selected" : ""}><input type="checkbox" checked={batchSelection.includes(index)} onChange={() => setBatchSelection((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} /><b>SEG {String(segment.index).padStart(2, "0")}</b><span>{clock(segment.start)}–{clock(segment.end)}</span><i>{segment.duration.toFixed(3)} 秒</i></label>)}</div>
          <footer><div><small>执行方式</small><b>{batchProvider === "local" ? "MiniMax H3 导演台 · 4 步 · 0.6 MP" : "RunningHub · 8 步 · 0.6 MP"}</b></div><button disabled={!batchSelection.length} onClick={runBatch}>生成所选 {batchSelection.length} 段</button></footer>
        </section>
      </div>}
      {workflowConfigOpen && <div className="mv-batch-backdrop" onPointerDown={() => setWorkflowConfigOpen(false)}>
        <section className="mv-workflow-modal" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><small>MV WORKFLOW CONFIG</small><h2>工作流配置</h2><p>本地和云端工作流分开管理。选择或导入 JSON 后，生成按钮会使用当前对应配置。</p></div><button onClick={() => setWorkflowConfigOpen(false)}>×</button></header>
          <div className="mv-workflow-tabs"><button className={workflowTab === "local" ? "active" : ""} onClick={() => { setWorkflowTab("local"); setWorkflowMessage(""); }}>本地工作流</button><button className={workflowTab === "cloud" ? "active" : ""} onClick={() => { setWorkflowTab("cloud"); setWorkflowMessage(""); }}>云端工作流</button></div>
          <div className="mv-workflow-body">
            {workflowTab === "local" ? <>
              <label>本地工作流 JSON 路径<input value={localWorkflowPath} onChange={(event) => rememberWorkflowPath(event.target.value)} placeholder="D:\\...\\minimax_h3_director.json" /></label>
              <div className="mv-workflow-actions"><button onClick={() => workflowInputRef.current?.click()}>浏览选择 JSON</button><button className="primary" onClick={() => void validateLocalWorkflowPath()}>检查路径</button><input ref={workflowInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importLocalWorkflow(file, "local"); }} /></div>
              <div className={`mv-workflow-status ${workflowMessage.includes("通过") ? "ok" : workflowMessage && !workflowMessage.includes("正在") && !workflowMessage.includes("修改") ? "error" : ""}`}>{workflowMessage || "当前默认工作流：" + LOCAL_WORKFLOW_PATH}</div>
              <div className="mv-workflow-catalog"><small>已归档本地工作流</small>{workflowCatalog.local.length ? workflowCatalog.local.map((item) => <button key={item.path} className={localWorkflowPath === item.path ? "selected" : ""} onClick={() => rememberWorkflowPath(item.path)}><b>{item.fileName}</b><span>{item.nodeCount} 节点</span></button>) : <span>目录暂无 JSON</span>}</div>
              <p className="mv-workflow-note">本地生成读取 <code>workspace/workflows/mv/local</code> 下的工作流，需包含 <code>MiniMaxH3Director</code> 节点。</p>
            </> : <>
              <label>云端工作流 JSON 路径<select value={cloudWorkflowPath} onChange={(event) => rememberCloudWorkflowPath(event.target.value)}><option value={CLOUD_WORKFLOW_PATH}>{CLOUD_WORKFLOW_PATH}</option>{workflowCatalog.cloud.filter((item) => item.path !== CLOUD_WORKFLOW_PATH).map((item) => <option key={item.path} value={item.path}>{item.fileName}</option>)}</select><input value={cloudWorkflowPath} onChange={(event) => rememberCloudWorkflowPath(event.target.value)} placeholder="workspace\\workflows\\mv\\cloud\\workflow.json" /></label>
              <label>RunningHub 工作流 ID<input value={cloudWorkflowId} onChange={(event) => rememberCloudWorkflowId(event.target.value)} placeholder="从 RunningHub API 页面复制数字 ID" /></label>
              <div className="mv-workflow-actions"><button onClick={() => cloudWorkflowInputRef.current?.click()}>导入云端 API JSON</button><button className="primary" onClick={() => void validateCloudWorkflowPath()}>检查云端工作流</button><input ref={cloudWorkflowInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importLocalWorkflow(file, "cloud"); }} /></div>
              <div className={`mv-workflow-status ${workflowMessage.includes("通过") ? "ok" : workflowMessage && !workflowMessage.includes("正在") && !workflowMessage.includes("修改") ? "error" : ""}`}>{workflowMessage || "当前云端工作流：" + CLOUD_WORKFLOW_PATH}</div>
              <div className="mv-workflow-catalog"><small>已归档云端工作流</small>{workflowCatalog.cloud.length ? workflowCatalog.cloud.map((item) => <button key={item.path} className={cloudWorkflowPath === item.path ? "selected" : ""} onClick={() => rememberCloudWorkflowPath(item.path)}><b>{item.fileName}</b><span>{item.nodeCount} 节点{item.invalid ? " · JSON 无效" : ""}</span></button>) : <span>目录暂无 JSON</span>}</div>
              <p className="mv-workflow-note">云端工作流读取 <code>workspace/workflows/mv/cloud</code>。附带的 Remix API JSON 不包含 RunningHub ID，必须填写 RunningHub API 页面中的数字 ID；生成时会自动上传当前片段的图片和音频素材。</p>
            </>}
          </div>
          <footer><span>路径和云端 ID 会保存在本机浏览器，下次打开 MV 页面自动恢复。</span><button onClick={() => setWorkflowConfigOpen(false)}>完成</button></footer>
        </section>
      </div>}
    </main>
  );
}
