/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./redub.module.css";

type TrackKind = "dialogue" | "vocal" | "bed" | "sfx";

type RedubClip = {
  id: string;
  source: string;
  trackId: string;
  start: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  mute: boolean;
  audioPath: string;
  sourceDuration?: number;
  text?: string;
  metadata?: Record<string, unknown>;
};

type RedubTrack = {
  id: string;
  name: string;
  kind: TrackKind;
  volume: number;
  muted: boolean;
  solo: boolean;
  pan: number;
  clips: RedubClip[];
};

type RedubTimeline = {
  version: number;
  name: string;
  duration: number;
  tracks: RedubTrack[];
};

type RedubManifestItem = {
  id: string;
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
  path?: string;
  ttsDuration?: number;
  [key: string]: unknown;
};

type RedubJob = {
  id: string;
  status?: string;
  stage?: string;
  duration?: number;
  sourceVideo?: string;
  exportPath?: string;
  mixedAudio?: string;
  srtPath?: string;
  updatedAt?: string;
};

type RedubJobSummary = {
  id: string;
  status: string;
  stage: string;
  duration: number;
  sourceName: string;
  ttsCount: number;
  createdAt: string;
  updatedAt: string;
  exportPath: string;
};

type TimelineValidationError = {
  code: string;
  message: string;
  location: string;
  trackId?: string;
  clipId?: string;
};

type ClipDrag = {
  pointerId: number;
  mode: "move" | "trim-start" | "trim-end";
  startX: number;
  anchorId: string;
  selectedIds: string[];
  baseline: RedubTimeline;
  moved: boolean;
};

type MarqueeState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MarqueeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  preserveSelection: boolean;
  previousSelection: string[];
  moved: boolean;
};

type PlaybackSession = {
  context: AudioContext;
  sources: AudioBufferSourceNode[];
  startAt: number;
  timelineStart: number;
};

const TRACK_LABELS: Record<TrackKind, string> = {
  dialogue: "对白",
  vocal: "人声",
  bed: "伴奏",
  sfx: "音效",
};

const TRACK_COLORS: Record<TrackKind, string> = {
  dialogue: "#35d6c4",
  vocal: "#8b7cff",
  bed: "#e6a84a",
  sfx: "#e95f78",
};

const waveformCache = new Map<string, Promise<Float32Array>>();
const audioBufferCache = new Map<string, Promise<AudioBuffer>>();
let sharedDecodeContext: AudioContext | null = null;

function decodeContext() {
  sharedDecodeContext ||= new AudioContext();
  return sharedDecodeContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneTimeline(value: RedubTimeline): RedubTimeline {
  return {
    ...value,
    tracks: value.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        ...(clip.metadata ? { metadata: { ...clip.metadata } } : {}),
      })),
    })),
  };
}

function roundTime(value: number) {
  return Number(Math.max(0, value).toFixed(3));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatClock(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function mediaUrl(path: string, revision?: number | string) {
  const query = new URLSearchParams({ path });
  if (revision !== undefined) query.set("v", String(revision));
  return `/api/local/file?${query.toString()}`;
}

async function readApiBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function responseError(data: unknown, fallback: string) {
  return isRecord(data) && typeof data.error === "string" ? data.error : fallback;
}

function validationErrorsFrom(data: unknown): TimelineValidationError[] {
  if (!isRecord(data) || !Array.isArray(data.errors)) return [];
  return data.errors
    .filter(isRecord)
    .map((error) => ({
      code: typeof error.code === "string" ? error.code : "UNKNOWN",
      message: typeof error.message === "string" ? error.message : "时间轴数据无效",
      location: typeof error.location === "string" ? error.location : "",
      ...(typeof error.trackId === "string" ? { trackId: error.trackId } : {}),
      ...(typeof error.clipId === "string" ? { clipId: error.clipId } : {}),
    }));
}

async function loadWaveformPeaks(path: string, revision: number) {
  const cacheKey = `${path}|${revision}`;
  const cached = waveformCache.get(cacheKey);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(mediaUrl(path, revision || undefined));
    if (!response.ok) throw new Error("波形读取失败");
    const bytes = await response.arrayBuffer();
    const buffer = await decodeContext().decodeAudioData(bytes.slice(0));
    const data = buffer.getChannelData(0);
    const points = 1200;
    const peaks = new Float32Array(points);
    const step = Math.max(1, data.length / points);
    for (let index = 0; index < points; index += 1) {
      const start = Math.floor(index * step);
      const end = Math.min(data.length, Math.floor((index + 1) * step));
      let peak = 0;
      const stride = Math.max(1, Math.floor((end - start) / 24));
      for (let sample = start; sample < end; sample += stride) {
        peak = Math.max(peak, Math.abs(data[sample] || 0));
      }
      peaks[index] = peak;
    }
    return peaks;
  })();
  waveformCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    waveformCache.delete(cacheKey);
    throw error;
  }
}

async function loadAudioBuffer(path: string) {
  const cached = audioBufferCache.get(path);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(mediaUrl(path, Date.now()));
    if (!response.ok) throw new Error(`音频读取失败：${path}`);
    const bytes = await response.arrayBuffer();
    return await decodeContext().decodeAudioData(bytes.slice(0));
  })();
  audioBufferCache.set(path, pending);
  try {
    return await pending;
  } catch (error) {
    audioBufferCache.delete(path);
    throw error;
  }
}

function TrackIcon({ kind }: { kind: TrackKind }) {
  if (kind === "bed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17V8.5L12 5v8.5M12 16V7M4 17a3 3 0 1 0 3-3M12 16a3 3 0 1 0 3-3M4 9l8-3.5M15 13V4l5 2v9M15 15a3 3 0 1 0 3-3" />
      </svg>
    );
  }
  if (kind === "sfx") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 14h3l4 4V6L7 10H4zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />
      </svg>
    );
  }
  if (kind === "vocal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="7" r="3" />
        <path d="M6 20v-3a6 6 0 0 1 12 0v3M4 21h16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5" />
    </svg>
  );
}

function ClipWaveform({
  clip,
  color,
  revision,
}: {
  clip: RedubClip;
  color: string;
  revision: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    let active = true;
    if (!clip.audioPath) {
      setPeaks(null);
      return;
    }
    void loadWaveformPeaks(clip.audioPath, revision)
      .then((value) => {
        if (active) setPeaks(value);
      })
      .catch(() => {
        if (active) setPeaks(null);
      });
    return () => {
      active = false;
    };
  }, [clip.audioPath, revision]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,.14)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
      if (!peaks) return;

      const sourceDuration = Math.max(
        Number(clip.sourceDuration || 0),
        clip.offset + clip.duration,
        0.001,
      );
      const pointStart = Math.floor((clip.offset / sourceDuration) * peaks.length);
      const pointEnd = Math.min(
        peaks.length,
        Math.ceil(((clip.offset + clip.duration) / sourceDuration) * peaks.length),
      );
      const visible = Math.max(1, pointEnd - pointStart);
      context.fillStyle = color;
      for (let x = 0; x < width; x += 1) {
        const index = Math.min(
          peaks.length - 1,
          pointStart + Math.floor((x / width) * visible),
        );
        const amplitude = Math.max(1, Math.min(1, peaks[index]) * height * 0.76);
        context.globalAlpha = 0.86;
        context.fillRect(x, (height - amplitude) / 2, 1, amplitude);
      }
      context.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, clip.offset, clip.duration, clip.sourceDuration, color]);

  return <canvas ref={canvasRef} className={styles.clipWaveform} />;
}

export default function RedubStudio() {
  const [jobs, setJobs] = useState<RedubJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [job, setJob] = useState<RedubJob | null>(null);
  const [timeline, setTimeline] = useState<RedubTimeline | null>(null);
  const [manifest, setManifest] = useState<RedubManifestItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(960);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [validationErrors, setValidationErrors] = useState<TimelineValidationError[]>([]);
  const [notice, setNotice] = useState("正在读取重配音任务…");
  const [loading, setLoading] = useState(true);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [mixBusy, setMixBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportResult, setExportResult] = useState<{
    exportPath: string;
    mixedAudio: string;
    srtPath: string;
  } | null>(null);
  const [undoStack, setUndoStack] = useState<RedubTimeline[]>([]);
  const [redoStack, setRedoStack] = useState<RedubTimeline[]>([]);
  const [clipDrag, setClipDrag] = useState<ClipDrag | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [waveRevisions, setWaveRevisions] = useState<Record<string, number>>({});

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineInnerRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const clipDragRef = useRef<ClipDrag | null>(null);
  const marqueeGestureRef = useRef<MarqueeGesture | null>(null);
  const playheadDragRef = useRef(false);
  const rulerDragRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const playbackRef = useRef<PlaybackSession | null>(null);
  const playbackTokenRef = useRef(0);
  const currentTimeRef = useRef(0);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allClips = useMemo(
    () => timeline?.tracks.flatMap((track) => track.clips) || [],
    [timeline],
  );
  const selectedClip = selectedIds.length === 1
    ? allClips.find((clip) => clip.id === selectedIds[0]) || null
    : null;
  const selectedTrack = selectedClip && timeline
    ? timeline.tracks.find((track) => track.id === selectedClip.trackId) || null
    : null;

  const overlapIds = useMemo(() => {
    const ids = new Set<string>();
    for (const track of timeline?.tracks || []) {
      const clips = [...track.clips].sort((left, right) => left.start - right.start);
      let active: RedubClip | null = null;
      for (const clip of clips) {
        if (active && clip.start < active.start + active.duration - 0.001) {
          ids.add(active.id);
          ids.add(clip.id);
        }
        if (!active || clip.start + clip.duration > active.start + active.duration) {
          active = clip;
        }
      }
    }
    return ids;
  }, [timeline]);

  const pixelsPerSecond = timeline
    ? Math.max(1, (viewportWidth * zoom) / Math.max(0.001, timeline.duration))
    : 1;
  const tickStep = useMemo(() => {
    const candidates = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
    return candidates.find((candidate) => candidate * pixelsPerSecond >= 82) || 120;
  }, [pixelsPerSecond]);
  const rulerTicks = useMemo(() => {
    if (!timeline) return [];
    const ticks: number[] = [];
    for (let time = 0; time <= timeline.duration + 0.001; time += tickStep) {
      ticks.push(Number(time.toFixed(3)));
    }
    return ticks;
  }, [timeline, tickStep]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/local/redub/jobs");
        const data = await readApiBody(response);
        if (!response.ok) throw new Error(responseError(data, "任务列表读取失败"));
        const rows = isRecord(data) && Array.isArray(data.jobs)
          ? data.jobs.filter(isRecord).map((item): RedubJobSummary => ({
              id: typeof item.id === "string" ? item.id : "",
              status: typeof item.status === "string" ? item.status : "unknown",
              stage: typeof item.stage === "string" ? item.stage : "",
              duration: Number(item.duration || 0),
              sourceName: typeof item.sourceName === "string" ? item.sourceName : "",
              ttsCount: Number(item.ttsCount || 0),
              createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
              updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
              exportPath: typeof item.exportPath === "string" ? item.exportPath : "",
            })).filter((item) => item.id)
          : [];
        if (!active) return;
        setJobs(rows);
        setSelectedJobId((current) =>
          rows.some((item) => item.id === current) ? current : rows[0]?.id || "",
        );
        setLoading(false);
        if (!rows.length) setNotice("workspace/dialogue-redub 下还没有可用任务");
      } catch (error) {
        if (!active) return;
        setLoading(false);
        setNotice(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    let active = true;
    setLoading(true);
    setTimeline(null);
    setJob(null);
    setPlaying(false);
    stopAudioNodes();
    void (async () => {
      try {
        const response = await fetch(
          `/api/local/redub/job?id=${encodeURIComponent(selectedJobId)}`,
        );
        const data = await readApiBody(response);
        if (!response.ok) throw new Error(responseError(data, "任务详情读取失败"));
        if (!isRecord(data) || !isRecord(data.timeline)) {
          throw new Error("后端返回的时间轴数据无效");
        }
        const loadedTimeline = data.timeline as unknown as RedubTimeline;
        const loadedManifest = Array.isArray(data.ttsManifest)
          ? data.ttsManifest.filter(isRecord).map((item) => ({
              ...item,
              id: typeof item.id === "string" ? item.id : "",
              ...(typeof item.path === "string" ? { path: item.path } : {}),
            })).filter((item) => item.id)
          : [];
        if (!active) return;
        setJob(isRecord(data.job) ? data.job as unknown as RedubJob : null);
        setTimeline(loadedTimeline);
        setManifest(loadedManifest);
        setSelectedIds([]);
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setZoom(1);
        setDirty(false);
        setSaveState("idle");
        setValidationErrors([]);
        setUndoStack([]);
        setRedoStack([]);
        setWaveRevisions({});
        setExportResult(null);
        setLoading(false);
        setNotice(
          `${loadedTimeline.name} · ${loadedTimeline.tracks.length} 轨 · ${allClipCount(loadedTimeline)} 个片段`,
        );
        requestAnimationFrame(() => {
          if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = 0;
        });
      } catch (error) {
        if (!active) return;
        setLoading(false);
        setTimeline(null);
        setNotice(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedJobId]);

  useEffect(() => {
    const viewport = timelineScrollRef.current;
    if (!viewport) return;
    const update = () => setViewportWidth(Math.max(1, viewport.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const update = () => {
      const session = playbackRef.current;
      if (!session || !timeline) {
        setPlaying(false);
        return;
      }
      const elapsed = Math.max(0, session.context.currentTime - session.startAt);
      const next = session.timelineStart + elapsed;
      if (next >= timeline.duration) {
        stopAudioNodes();
        currentTimeRef.current = timeline.duration;
        setCurrentTime(timeline.duration);
        setPlaying(false);
        return;
      }
      currentTimeRef.current = next;
      setCurrentTime(next);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      }
      if (event.key === "Escape") {
        setSelectedIds([]);
        setValidationErrors([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [timeline, playing, undoStack, redoStack, currentTime]);

  useEffect(() => () => {
    stopAudioNodes();
  }, []);

  async function refreshJobs() {
    const response = await fetch("/api/local/redub/jobs");
    const data = await readApiBody(response);
    if (!response.ok) return;
    if (!isRecord(data) || !Array.isArray(data.jobs)) return;
    setJobs(
      data.jobs.filter(isRecord).map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        status: typeof item.status === "string" ? item.status : "unknown",
        stage: typeof item.stage === "string" ? item.stage : "",
        duration: Number(item.duration || 0),
        sourceName: typeof item.sourceName === "string" ? item.sourceName : "",
        ttsCount: Number(item.ttsCount || 0),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
        exportPath: typeof item.exportPath === "string" ? item.exportPath : "",
      })).filter((item) => item.id),
    );
  }

  function stopAudioNodes() {
    playbackTokenRef.current += 1;
    const session = playbackRef.current;
    playbackRef.current = null;
    if (!session) return;
    for (const source of session.sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    void session.context.close().catch(() => undefined);
  }

  function pausePlayback() {
    const session = playbackRef.current;
    if (session) {
      const elapsed = Math.max(0, session.context.currentTime - session.startAt);
      currentTimeRef.current = session.timelineStart + elapsed;
      setCurrentTime(currentTimeRef.current);
    }
    stopAudioNodes();
    setPlaying(false);
  }

  async function startPlayback(fromTime: number) {
    if (!timeline) return;
    const start = clamp(fromTime, 0, timeline.duration);
    if (start >= timeline.duration) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
      fromTime = 0;
    }
    stopAudioNodes();
    const token = playbackTokenRef.current;
    const hasSolo = timeline.tracks.some((track) => track.solo);
    const audibleTracks = timeline.tracks.filter(
      (track) => !track.muted && (!hasSolo || track.solo),
    );
    const scheduled = audibleTracks.flatMap((track) =>
      track.clips
        .filter((clip) => !clip.mute && clip.start + clip.duration > fromTime)
        .map((clip) => ({ track, clip })),
    );
    if (!scheduled.length) {
      currentTimeRef.current = fromTime;
      setCurrentTime(fromTime);
      setNotice("当前播放位置之后没有可发声片段");
      return;
    }

    setNotice("正在准备多轨试听…");
    try {
      const context = new AudioContext();
      await context.resume();
      const buffers = await Promise.all(
        scheduled.map(({ clip }) => loadAudioBuffer(clip.audioPath)),
      );
      if (token !== playbackTokenRef.current) {
        await context.close();
        return;
      }
      const startAt = context.currentTime + 0.04;
      const sources: AudioBufferSourceNode[] = [];
      for (let index = 0; index < scheduled.length; index += 1) {
        const { track, clip } = scheduled[index];
        const buffer = buffers[index];
        const localOffset = Math.max(0, fromTime - clip.start);
        const delay = Math.max(0, clip.start - fromTime);
        const playDuration = Math.min(
          clip.duration - localOffset,
          Math.max(0.001, buffer.duration - clip.offset - localOffset),
        );
        if (!(playDuration > 0)) continue;
        const source = context.createBufferSource();
        const gain = context.createGain();
        const panner = context.createStereoPanner();
        source.buffer = buffer;
        const baseGain = Math.max(0, track.volume) * Math.max(0, clip.gain);
        gain.gain.setValueAtTime(baseGain, startAt + delay);
        const relativeStart = Math.max(0, fromTime - clip.start);
        if (clip.fadeIn > relativeStart) {
          gain.gain.setValueAtTime(0, startAt + delay);
          gain.gain.linearRampToValueAtTime(
            baseGain,
            startAt + delay + Math.max(0, clip.fadeIn - relativeStart),
          );
        }
        if (clip.fadeOut > 0) {
          const fadeStart = Math.max(
            0,
            clip.duration - clip.fadeOut - relativeStart,
          );
          gain.gain.setValueAtTime(baseGain, startAt + delay + fadeStart);
          gain.gain.linearRampToValueAtTime(
            Math.max(0, 0.0001),
            startAt + delay + Math.max(0.001, clip.duration - relativeStart),
          );
        }
        panner.pan.setValueAtTime(clamp(track.pan, -1, 1), startAt + delay);
        source.connect(gain);
        gain.connect(panner);
        panner.connect(context.destination);
        source.start(
          startAt + delay,
          Math.max(0, clip.offset + localOffset),
          playDuration,
        );
        sources.push(source);
      }
      playbackRef.current = {
        context,
        sources,
        startAt,
        timelineStart: fromTime,
      };
      currentTimeRef.current = fromTime;
      setCurrentTime(fromTime);
      setPlaying(true);
      setNotice("正在播放多轨试听；空格暂停");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setPlaying(false);
    }
  }

  async function togglePlayback() {
    if (playing) {
      pausePlayback();
      return;
    }
    await startPlayback(currentTimeRef.current);
  }

  function scrubTo(value: number, resume = playing) {
    if (!timeline) return;
    const next = clamp(Number(value.toFixed(3)), 0, timeline.duration);
    stopAudioNodes();
    setPlaying(false);
    currentTimeRef.current = next;
    setCurrentTime(next);
    if (resume) void startPlayback(next);
  }

  function pushUndo(snapshot = timeline) {
    if (!snapshot) return;
    setUndoStack((stack) => [...stack.slice(-49), cloneTimeline(snapshot)]);
    setRedoStack([]);
  }

  function undo() {
    if (!timeline) return;
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack.slice(-49), cloneTimeline(timeline)]);
    setTimeline(cloneTimeline(previous));
    setDirty(true);
    setValidationErrors([]);
    setNotice("已撤销上一步时间轴编辑");
  }

  function redo() {
    if (!timeline) return;
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-49), cloneTimeline(timeline)]);
    setTimeline(cloneTimeline(next));
    setDirty(true);
    setValidationErrors([]);
    setNotice("已重做时间轴编辑");
  }

  function updateTrack(
    trackId: string,
    patch: Partial<Pick<RedubTrack, "volume" | "muted" | "solo" | "pan">>,
  ) {
    setTimeline((current) => current
      ? {
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId ? { ...track, ...patch } : track,
          ),
        }
      : current);
    setDirty(true);
    setValidationErrors([]);
  }

  function updateClip(clipId: string, patch: Partial<RedubClip>) {
    setTimeline((current) => current
      ? {
          ...current,
          tracks: current.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) =>
              clip.id === clipId ? { ...clip, ...patch } : clip,
            ),
          })),
        }
      : current);
    setDirty(true);
    setValidationErrors([]);
  }

  function timeAtClientX(clientX: number) {
    if (!timeline || !timelineInnerRef.current) return 0;
    const rect = timelineInnerRef.current.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * timeline.duration;
  }

  function beginClipGesture(
    event: React.PointerEvent<HTMLElement>,
    clip: RedubClip,
    mode: ClipDrag["mode"],
  ) {
    if (event.button !== 0 || !timeline) return;
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && mode === "move") {
      setSelectedIds((current) =>
        current.includes(clip.id)
          ? current.filter((id) => id !== clip.id)
          : [...current, clip.id],
      );
      return;
    }
    const selected = selectedSet.has(clip.id) && mode === "move"
      ? selectedIds
      : [clip.id];
    if (selected.length === 1 && selected[0] === clip.id) setSelectedIds([clip.id]);
    if (selected.length !== selectedIds.length || selected.some((id) => !selectedSet.has(id))) {
      setSelectedIds(selected);
    }
    pushUndo(timeline);
    const drag: ClipDrag = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      anchorId: clip.id,
      selectedIds: selected,
      baseline: cloneTimeline(timeline),
      moved: false,
    };
    clipDragRef.current = drag;
    setClipDrag(drag);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveClipGesture(event: React.PointerEvent<HTMLElement>) {
    const drag = clipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !timelineInnerRef.current) return;
    event.stopPropagation();
    const rect = timelineInnerRef.current.getBoundingClientRect();
    const rawDelta = ((event.clientX - drag.startX) / Math.max(1, rect.width)) * drag.baseline.duration;
    const delta = Number(rawDelta.toFixed(3));
    if (Math.abs(delta) < 0.001 && !drag.moved) return;
    drag.moved = true;
    const next = cloneTimeline(drag.baseline);

    if (drag.mode === "move") {
      const clips = next.tracks.flatMap((track) => track.clips)
        .filter((clip) => drag.selectedIds.includes(clip.id));
      if (!clips.length) return;
      const minimumStart = Math.min(...clips.map((clip) => clip.start));
      const maximumEnd = Math.max(...clips.map((clip) => clip.start + clip.duration));
      const boundedDelta = clamp(
        delta,
        -minimumStart,
        drag.baseline.duration - maximumEnd,
      );
      for (const track of next.tracks) {
        for (const clip of track.clips) {
          if (drag.selectedIds.includes(clip.id)) {
            clip.start = roundTime(clip.start + boundedDelta);
          }
        }
      }
    } else {
      for (const track of next.tracks) {
        const clip = track.clips.find((candidate) => candidate.id === drag.anchorId);
        if (!clip) continue;
        const original = drag.baseline.tracks
          .flatMap((candidate) => candidate.clips)
          .find((candidate) => candidate.id === drag.anchorId);
        if (!original) break;
        if (drag.mode === "trim-start") {
          const minimumStart = Math.max(0, original.start - original.offset);
          const maximumStart = original.start + original.duration - 0.05;
          const nextStart = clamp(original.start + delta, minimumStart, maximumStart);
          const shift = nextStart - original.start;
          clip.start = roundTime(nextStart);
          clip.offset = roundTime(Math.max(0, original.offset + shift));
          clip.duration = roundTime(Math.max(0.05, original.duration - shift));
        } else {
          const sourceLimit =
            Number(original.sourceDuration || 0) > 0
              ? Math.max(
                  original.duration,
                  Number(original.sourceDuration) - original.offset,
                )
              : Number.POSITIVE_INFINITY;
          const nextDuration = clamp(
            original.duration + delta,
            0.05,
            Math.min(
              sourceLimit,
              drag.baseline.duration - original.start,
            ),
          );
          clip.duration = roundTime(nextDuration);
        }
        break;
      }
    }
    setTimeline(next);
    setDirty(true);
    setValidationErrors([]);
  }

  function finishClipGesture(event?: React.PointerEvent<HTMLElement>) {
    const drag = clipDragRef.current;
    if (!drag) return;
    if (event && drag.pointerId !== event.pointerId) return;
    clipDragRef.current = null;
    setClipDrag(null);
    if (drag.moved) {
      setNotice(
        drag.mode === "move"
          ? `已移动 ${drag.selectedIds.length} 个片段`
          : drag.mode === "trim-start"
            ? "已调整片段入点与素材 offset"
            : "已调整片段时长",
      );
    }
  }

  function beginPlayheadGesture(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    resumeAfterScrubRef.current = playing;
    if (playing) pausePlayback();
    playheadDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    currentTimeRef.current = timeAtClientX(event.clientX);
    setCurrentTime(currentTimeRef.current);
  }

  function movePlayheadGesture(event: React.PointerEvent<HTMLElement>) {
    if (!playheadDragRef.current) return;
    event.stopPropagation();
    currentTimeRef.current = clamp(
      timeAtClientX(event.clientX),
      0,
      timeline?.duration || 0,
    );
    setCurrentTime(currentTimeRef.current);
  }

  function finishPlayheadGesture() {
    if (!playheadDragRef.current) return;
    playheadDragRef.current = false;
    if (resumeAfterScrubRef.current) void startPlayback(currentTimeRef.current);
    resumeAfterScrubRef.current = false;
  }

  function beginRulerGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    resumeAfterScrubRef.current = playing;
    if (playing) pausePlayback();
    rulerDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    currentTimeRef.current = timeAtClientX(event.clientX);
    setCurrentTime(currentTimeRef.current);
  }

  function moveRulerGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (!rulerDragRef.current) return;
    currentTimeRef.current = clamp(
      timeAtClientX(event.clientX),
      0,
      timeline?.duration || 0,
    );
    setCurrentTime(currentTimeRef.current);
  }

  function finishRulerGesture() {
    if (!rulerDragRef.current) return;
    rulerDragRef.current = false;
    if (resumeAfterScrubRef.current) void startPlayback(currentTimeRef.current);
    resumeAfterScrubRef.current = false;
  }

  function rectFromPoints(startX: number, startY: number, endX: number, endY: number) {
    return {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
    };
  }

  function beginLaneGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !timeline) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const gesture: MarqueeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      preserveSelection: event.ctrlKey || event.metaKey,
      previousSelection: event.ctrlKey || event.metaKey ? [...selectedIds] : [],
      moved: false,
    };
    marqueeGestureRef.current = gesture;
    setMarquee({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
    if (!gesture.preserveSelection) setSelectedIds([]);
    scrubTo(timeAtClientX(event.clientX), playing);
  }

  function moveLaneGesture(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = marqueeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rect = rectFromPoints(
      gesture.startX,
      gesture.startY,
      event.clientX,
      event.clientY,
    );
    if (rect.width > 3 || rect.height > 3) gesture.moved = true;
    setMarquee(rect);
    if (!gesture.moved || !lanesRef.current) return;
    const hits = Array.from(
      lanesRef.current.querySelectorAll<HTMLElement>("[data-redub-clip-id]"),
    ).filter((element) => {
      const bounds = element.getBoundingClientRect();
      return !(
        bounds.right < rect.x ||
        bounds.left > rect.x + rect.width ||
        bounds.bottom < rect.y ||
        bounds.top > rect.y + rect.height
      );
    }).map((element) => element.dataset.redubClipId || "").filter(Boolean);
    setSelectedIds(
      gesture.preserveSelection
        ? Array.from(new Set([...gesture.previousSelection, ...hits]))
        : hits,
    );
  }

  function finishLaneGesture(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = marqueeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    marqueeGestureRef.current = null;
    setMarquee(null);
    if (!gesture.moved && !gesture.preserveSelection) setSelectedIds([]);
  }

  function setZoomAt(nextZoomValue: number) {
    const next = clamp(Number(nextZoomValue.toFixed(2)), 1, 24);
    const scroll = timelineScrollRef.current;
    if (!scroll || !timeline) {
      setZoom(next);
      return;
    }
    const currentWidth = Math.max(1, viewportWidth * zoom);
    const anchorRatio = clamp(
      (scroll.scrollLeft + scroll.clientWidth / 2) / currentWidth,
      0,
      1,
    );
    setZoom(next);
    requestAnimationFrame(() => {
      if (!timelineScrollRef.current) return;
      timelineScrollRef.current.scrollLeft = Math.max(
        0,
        anchorRatio * viewportWidth * next - viewportWidth / 2,
      );
    });
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const scroll = timelineScrollRef.current;
    if (!scroll) return;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = scroll.getBoundingClientRect();
    const pointerRatio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const time = timeAtClientX(event.clientX);
    const next = clamp(Number((zoom * factor).toFixed(2)), 1, 24);
    setZoom(next);
    requestAnimationFrame(() => {
      if (!timelineScrollRef.current || !timeline) return;
      const nextWidth = viewportWidth * next;
      timelineScrollRef.current.scrollLeft = Math.max(
        0,
        (time / timeline.duration) * nextWidth - viewportWidth * pointerRatio,
      );
    });
  }

  async function saveTimeline(showSuccess = true) {
    if (!timeline || !selectedJobId) return false;
    setSaveState("saving");
    setValidationErrors([]);
    try {
      const response = await fetch("/api/local/redub/timeline", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, timeline }),
      });
      const data = await readApiBody(response);
      if (!response.ok) {
        const errors = validationErrorsFrom(data);
        setValidationErrors(errors);
        setSaveState("error");
        setNotice(responseError(data, "时间轴保存失败"));
        return false;
      }
      if (isRecord(data) && isRecord(data.timeline)) {
        setTimeline(data.timeline as unknown as RedubTimeline);
      }
      if (isRecord(data) && isRecord(data.job)) {
        setJob(data.job as unknown as RedubJob);
      }
      setDirty(false);
      setSaveState("saved");
      if (showSuccess) setNotice("多轨时间轴已保存");
      void refreshJobs();
      return true;
    } catch (error) {
      setSaveState("error");
      setNotice(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function previewClip(clipId = selectedClip?.id || "") {
    if (!clipId || !selectedJobId) return;
    setPreviewBusy(true);
    try {
      const response = await fetch("/api/local/redub/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, clipId }),
      });
      const data = await readApiBody(response);
      if (!response.ok) throw new Error(responseError(data, "试听文件读取失败"));
      if (!isRecord(data) || typeof data.url !== "string") {
        throw new Error("试听接口没有返回音频地址");
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.src = data.url;
        await previewAudioRef.current.play();
      }
      setNotice(`正在试听 ${clipId}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function regenerateSelected() {
    if (!selectedClip || !selectedJobId) return;
    let saved = !dirty;
    if (!saved) saved = await saveTimeline(false);
    if (!saved) return;
    setTtsBusy(true);
    setNotice(`正在重新合成 ${selectedClip.id}…`);
    try {
      const response = await fetch("/api/local/redub/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          clipId: selectedClip.id,
          text: selectedClip.text || "",
          force: true,
        }),
      });
      const data = await readApiBody(response);
      if (!response.ok) {
        const errors = validationErrorsFrom(data);
        if (errors.length) setValidationErrors(errors);
        throw new Error(responseError(data, "TTS 重新合成失败"));
      }
      if (!isRecord(data)) throw new Error("TTS 接口返回格式无效");
      if (isRecord(data.timeline)) {
        setTimeline(data.timeline as unknown as RedubTimeline);
      }
      if (Array.isArray(data.ttsManifest)) {
        setManifest(data.ttsManifest.filter(isRecord).map((item) => ({
          ...item,
          id: typeof item.id === "string" ? item.id : "",
          ...(typeof item.path === "string" ? { path: item.path } : {}),
        })).filter((item) => item.id));
      }
      if (isRecord(data.job)) setJob(data.job as unknown as RedubJob);
      if (typeof data.path === "string") {
        for (const key of waveformCache.keys()) {
          if (key.startsWith(`${data.path}|`)) waveformCache.delete(key);
        }
        audioBufferCache.delete(data.path);
        setWaveRevisions((current) => ({
          ...current,
          [selectedClip.id]: Date.now(),
        }));
      }
      setDirty(false);
      setSaveState("saved");
      setValidationErrors([]);
      setNotice(`片段 ${selectedClip.id} 已重新合成并保存`);
      if (typeof data.url === "string" && previewAudioRef.current) {
        previewAudioRef.current.src = data.url;
        await previewAudioRef.current.play().catch(() => undefined);
      }
      void refreshJobs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setTtsBusy(false);
    }
  }

  async function mixAndExport() {
    if (!selectedJobId) return;
    let saved = !dirty;
    if (!saved) saved = await saveTimeline(false);
    if (!saved) return;
    setMixBusy(true);
    setNotice("正在执行多轨混音与视频导出…");
    try {
      const response = await fetch("/api/local/redub/mix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, burnSubs: true }),
      });
      const data = await readApiBody(response);
      if (!response.ok) {
        const errors = validationErrorsFrom(data);
        if (errors.length) setValidationErrors(errors);
        throw new Error(responseError(data, "混音导出失败"));
      }
      if (!isRecord(data)) throw new Error("混音接口返回格式无效");
      const result = {
        exportPath: typeof data.exportPath === "string" ? data.exportPath : "",
        mixedAudio: typeof data.mixedAudio === "string" ? data.mixedAudio : "",
        srtPath: typeof data.srtPath === "string" ? data.srtPath : "",
      };
      setExportResult(result);
      if (isRecord(data.job)) setJob(data.job as unknown as RedubJob);
      setNotice("混音与导出完成");
      void refreshJobs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setMixBusy(false);
    }
  }

  const statusLabel = ttsBusy
    ? "TTS 合成中"
    : mixBusy
      ? "混音导出中"
      : dirty
        ? "编辑中 · 未保存"
        : saveState === "saved"
          ? "已保存"
          : "已同步";

  if (loading && !timeline) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingMark}>RD</div>
        <h1>台词重配工作台</h1>
        <p>{notice}</p>
      </main>
    );
  }

  if (!timeline) {
    return (
      <main className={styles.emptyPage}>
        <section className={styles.emptyCard}>
          <small>DIRECTOR MASTER · DIALOGUE REDUB</small>
          <h1>没有可编辑的重配音任务</h1>
          <p>{notice}</p>
          <p className={styles.emptyHint}>
            请先在现有重配音流程中创建任务并完成听写/TTS，然后回到这里编辑多轨时间轴。
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <audio ref={previewAudioRef} hidden />
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>RD</span>
          <div>
            <small>DIRECTOR MASTER · DIALOGUE REDUB</small>
            <h1>多轨台词重配</h1>
          </div>
        </div>
        <div className={styles.jobPicker}>
          <label htmlFor="redub-job">当前任务</label>
          <select
            id="redub-job"
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
          >
            {jobs.map((item) => (
              <option value={item.id} key={item.id}>
                {item.sourceName || item.id} · {formatClock(item.duration)}
              </option>
            ))}
          </select>
          <span>{jobs.length} 个任务</span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statePill} ${dirty ? styles.stateDirty : styles.stateClean}`}>
            {statusLabel}
          </span>
          <button
            className={styles.iconButton}
            onClick={undo}
            disabled={!undoStack.length}
            title="撤销 Ctrl+Z"
          >
            ↶
          </button>
          <button
            className={styles.iconButton}
            onClick={redo}
            disabled={!redoStack.length}
            title="重做 Ctrl+Shift+Z"
          >
            ↷
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => void saveTimeline()}
            disabled={saveState === "saving" || ttsBusy || mixBusy}
          >
            {saveState === "saving" ? "保存中…" : "保存时间轴"}
          </button>
          <button
            className={styles.primaryButton}
            onClick={() => void mixAndExport()}
            disabled={mixBusy || ttsBusy}
          >
            {mixBusy ? "正在导出…" : "混音并导出"}
          </button>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.editorColumn}>
          <div className={styles.toolbar}>
            <div className={styles.playbackTools}>
              <button
                className={styles.playButton}
                onClick={() => void togglePlayback()}
                title="播放 / 暂停（空格）"
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <button
                className={styles.ghostButton}
                onClick={() => scrubTo(0, false)}
              >
                回到开头
              </button>
              <strong>{formatClock(currentTime)}</strong>
              <span>/ {formatClock(timeline.duration)}</span>
            </div>
            <div className={styles.zoomTools}>
              <span>时间轴缩放</span>
              <button onClick={() => setZoomAt(zoom / 1.5)} disabled={zoom <= 1}>−</button>
              <input
                type="range"
                min="1"
                max="24"
                step="0.25"
                value={zoom}
                onChange={(event) => setZoomAt(Number(event.target.value))}
                aria-label="时间轴缩放"
              />
              <button onClick={() => setZoomAt(zoom * 1.5)} disabled={zoom >= 24}>＋</button>
              <button onClick={() => setZoomAt(1)}>100%</button>
              <b>{Math.round(zoom * 100)}%</b>
              <small>Ctrl + 滚轮缩放</small>
            </div>
            <div className={styles.selectionTools}>
              <span>已选 {selectedIds.length}</span>
              <button onClick={() => setSelectedIds(allClips.map((clip) => clip.id))}>
                全选
              </button>
              <button onClick={() => setSelectedIds([])}>清空</button>
            </div>
          </div>

          <div className={styles.timelineFrame}>
            <div className={styles.controlColumn}>
              <div className={styles.controlHead}>
                <span>{timeline.tracks.length} 条轨道</span>
                <small>音量 / 声像</small>
              </div>
              {timeline.tracks.map((track, index) => (
                <div className={styles.trackControl} key={track.id}>
                  <div className={styles.trackTitle}>
                    <span
                      className={styles.trackIcon}
                      style={{ color: TRACK_COLORS[track.kind] }}
                    >
                      <TrackIcon kind={track.kind} />
                    </span>
                    <div>
                      <b>{track.name}</b>
                      <small>{TRACK_LABELS[track.kind]} · T{index + 1}</small>
                    </div>
                  </div>
                  <label className={styles.smallSlider}>
                    <span>音量</span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={track.volume}
                      onPointerDown={() => pushUndo()}
                      onChange={(event) =>
                        updateTrack(track.id, { volume: Number(event.target.value) })
                      }
                    />
                    <b>{Math.round(track.volume * 100)}</b>
                  </label>
                  <label className={styles.smallSlider}>
                    <span>声像</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={track.pan}
                      onPointerDown={() => pushUndo()}
                      onChange={(event) =>
                        updateTrack(track.id, { pan: Number(event.target.value) })
                      }
                    />
                    <b>
                      {track.pan === 0
                        ? "C"
                        : `${track.pan < 0 ? "L" : "R"}${Math.round(Math.abs(track.pan) * 100)}`}
                    </b>
                  </label>
                  <div className={styles.trackButtons}>
                    <button
                      className={track.muted ? styles.muteActive : ""}
                      onClick={() => {
                        pushUndo();
                        updateTrack(track.id, { muted: !track.muted });
                      }}
                    >
                      M
                    </button>
                    <button
                      className={track.solo ? styles.soloActive : ""}
                      onClick={() => {
                        pushUndo();
                        updateTrack(track.id, { solo: !track.solo });
                      }}
                    >
                      S
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div
              className={styles.timelineScroll}
              ref={timelineScrollRef}
              onWheel={handleWheel}
            >
              <div
                className={styles.timelineInner}
                ref={timelineInnerRef}
                style={{ width: `${zoom * 100}%` }}
              >
                <div
                  className={styles.ruler}
                  onPointerDown={beginRulerGesture}
                  onPointerMove={moveRulerGesture}
                  onPointerUp={finishRulerGesture}
                  onPointerCancel={finishRulerGesture}
                >
                  {rulerTicks.map((tick) => (
                    <span
                      key={tick}
                      className={styles.rulerTick}
                      style={{ left: `${(tick / Math.max(0.001, timeline.duration)) * 100}%` }}
                    >
                      <i />
                      <b>{tickStep < 1 ? tick.toFixed(2) : formatClock(tick)}</b>
                    </span>
                  ))}
                </div>
                <div className={styles.lanes} ref={lanesRef}>
                  {timeline.tracks.map((track) => (
                    <div
                      className={`${styles.lane} ${track.muted ? styles.laneMuted : ""}`}
                      data-track-id={track.id}
                      key={track.id}
                      onPointerDown={beginLaneGesture}
                      onPointerMove={moveLaneGesture}
                      onPointerUp={finishLaneGesture}
                      onPointerCancel={finishLaneGesture}
                    >
                      {track.clips.map((clip) => {
                        const left = (clip.start / Math.max(0.001, timeline.duration)) * 100;
                        const width =
                          (clip.duration / Math.max(0.001, timeline.duration)) * 100;
                        const selected = selectedSet.has(clip.id);
                        const overlap = overlapIds.has(clip.id);
                        return (
                          <div
                            key={clip.id}
                            data-redub-clip-id={clip.id}
                            className={[
                              styles.clip,
                              selected ? styles.clipSelected : "",
                              overlap ? styles.clipOverlap : "",
                              track.muted || clip.mute ? styles.clipMuted : "",
                              clipDrag?.anchorId === clip.id ? styles.clipDragging : "",
                            ].filter(Boolean).join(" ")}
                            style={{
                              left: `${left}%`,
                              width: `${Math.max(0.12, width)}%`,
                              borderColor: TRACK_COLORS[track.kind],
                            }}
                            title={`${clip.id} · ${formatClock(clip.start)} → ${formatClock(clip.start + clip.duration)}${overlap ? " · 同轨重叠" : ""}`}
                            onPointerDown={(event) => beginClipGesture(event, clip, "move")}
                            onPointerMove={moveClipGesture}
                            onPointerUp={finishClipGesture}
                            onPointerCancel={finishClipGesture}
                            onDoubleClick={() => scrubTo(clip.start, false)}
                          >
                            <ClipWaveform
                              clip={clip}
                              color={TRACK_COLORS[track.kind]}
                              revision={waveRevisions[clip.id] || 0}
                            />
                            <span className={styles.clipLabel}>
                              <b>{clip.text || clip.id}</b>
                              <small>{clip.duration.toFixed(2)}s</small>
                            </span>
                            <button
                              className={`${styles.trimHandle} ${styles.trimStart}`}
                              title="拖动调整入点与素材 offset"
                              aria-label={`调整 ${clip.id} 左边缘`}
                              onPointerDown={(event) => beginClipGesture(event, clip, "trim-start")}
                              onPointerMove={moveClipGesture}
                              onPointerUp={finishClipGesture}
                              onPointerCancel={finishClipGesture}
                            />
                            <button
                              className={`${styles.trimHandle} ${styles.trimEnd}`}
                              title="拖动调整片段时长"
                              aria-label={`调整 ${clip.id} 右边缘`}
                              onPointerDown={(event) => beginClipGesture(event, clip, "trim-end")}
                              onPointerMove={moveClipGesture}
                              onPointerUp={finishClipGesture}
                              onPointerCancel={finishClipGesture}
                            />
                            {overlap && <i className={styles.overlapMark}>OVERLAP</i>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div
                    className={styles.playhead}
                    style={{
                      left: `${(currentTime / Math.max(0.001, timeline.duration)) * 100}%`,
                    }}
                  >
                    <button
                      onPointerDown={beginPlayheadGesture}
                      onPointerMove={movePlayheadGesture}
                      onPointerUp={finishPlayheadGesture}
                      onPointerCancel={finishPlayheadGesture}
                      title={`播放头 ${formatClock(currentTime)}`}
                    >
                      <span>{formatClock(currentTime)}</span>
                      <i />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {marquee && (
            <div
              className={styles.marquee}
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}

          <div className={styles.timelineFooter}>
            <div>
              <span>{allClips.length} 个片段</span>
              <span>{selectedIds.length} 已选</span>
              <span className={overlapIds.size ? styles.warningText : styles.goodText}>
                {overlapIds.size
                  ? `${overlapIds.size} 个片段存在同轨重叠，保存/导出时会被严格校验`
                  : "同轨无重叠"}
              </span>
            </div>
            <p>{notice}</p>
          </div>

          {validationErrors.length > 0 && (
            <section className={styles.errorPanel}>
              <header>
                <div>
                  <small>SERVER VALIDATION</small>
                  <h2>时间轴保存失败</h2>
                </div>
                <button onClick={() => setValidationErrors([])}>×</button>
              </header>
              <ul>
                {validationErrors.map((error, index) => (
                  <li key={`${error.code}-${error.location}-${index}`}>
                    <code>{error.code}</code>
                    <span>{error.location}</span>
                    <b>{error.message}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className={styles.inspector}>
          <section className={styles.inspectorSection}>
            <small>PROJECT STATUS</small>
            <div className={styles.projectCard}>
              <h2>{timeline.name}</h2>
              <p>{job?.stage || "已加载时间轴"}</p>
              <dl>
                <div><dt>时长</dt><dd>{formatClock(timeline.duration)}</dd></div>
                <div><dt>轨道</dt><dd>{timeline.tracks.length}</dd></div>
                <div><dt>片段</dt><dd>{allClips.length}</dd></div>
                <div><dt>TTS</dt><dd>{manifest.length}</dd></div>
              </dl>
              {job?.sourceVideo && <p className={styles.pathText}>{job.sourceVideo}</p>}
            </div>
          </section>

          <section className={styles.inspectorSection}>
            <div className={styles.sectionHead}>
              <div>
                <small>CLIP INSPECTOR</small>
                <h2>{selectedClip ? selectedClip.id : "未选择单个片段"}</h2>
              </div>
              {selectedClip && (
                <button
                  className={selectedClip.mute ? styles.muteActive : ""}
                  onClick={() => {
                    pushUndo();
                    updateClip(selectedClip.id, { mute: !selectedClip.mute });
                  }}
                >
                  {selectedClip.mute ? "已静音" : "片段静音"}
                </button>
              )}
            </div>
            {selectedClip ? (
              <>
                <label className={styles.editorLabel}>
                  <span>台词文本</span>
                  <textarea
                    value={selectedClip.text || ""}
                    onFocus={() => pushUndo()}
                    onChange={(event) =>
                      updateClip(selectedClip.id, { text: event.target.value })
                    }
                    maxLength={2000}
                  />
                </label>
                <div className={styles.clipMeta}>
                  <span>{selectedTrack?.name || selectedClip.source}</span>
                  <span>{selectedTrack ? TRACK_LABELS[selectedTrack.kind] : ""}</span>
                  <span>{formatClock(selectedClip.start)} → {formatClock(selectedClip.start + selectedClip.duration)}</span>
                </div>
                <div className={styles.numberGrid}>
                  <label>
                    <span>起点</span>
                    <input
                      type="number"
                      min="0"
                      max={timeline.duration}
                      step="0.01"
                      value={selectedClip.start}
                      onFocus={() => pushUndo()}
                      onChange={(event) =>
                        updateClip(selectedClip.id, {
                          start: clamp(
                            Number(event.target.value) || 0,
                            0,
                            timeline.duration - 0.05,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>时长</span>
                    <input
                      type="number"
                      min="0.05"
                      step="0.01"
                      value={selectedClip.duration}
                      onFocus={() => pushUndo()}
                      onChange={(event) =>
                        updateClip(selectedClip.id, {
                          duration: Math.max(0.05, Number(event.target.value) || 0.05),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>素材 offset</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={selectedClip.offset}
                      onFocus={() => pushUndo()}
                      onChange={(event) =>
                        updateClip(selectedClip.id, {
                          offset: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>片段增益</span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.01"
                      value={selectedClip.gain}
                      onFocus={() => pushUndo()}
                      onChange={(event) =>
                        updateClip(selectedClip.id, {
                          gain: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                    />
                  </label>
                </div>
                <div className={styles.inspectorActions}>
                  <button
                    className={styles.secondaryButton}
                    disabled={previewBusy}
                    onClick={() => void previewClip()}
                  >
                    {previewBusy ? "读取中…" : "试听当前 TTS"}
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={ttsBusy || mixBusy || !(selectedClip.text || "").trim()}
                    onClick={() => void regenerateSelected()}
                  >
                    {ttsBusy ? "正在合成…" : "按文本重新合成"}
                  </button>
                </div>
                <p className={styles.inspectorHint}>
                  重新合成会先保存时间轴，再以 manifest 中的音频作为唯一来源。成功后会自动试听新 WAV。
                </p>
              </>
            ) : (
              <div className={styles.noSelection}>
                <b>{selectedIds.length > 1 ? `已选择 ${selectedIds.length} 个片段` : "没有选中片段"}</b>
                <p>
                  点击片段单选，Ctrl/⌘ 点击多选；从轨道空白处拖动可框选。多选后可直接拖动整组片段。
                </p>
                <div className={styles.legend}>
                  <span><i />可拖动片段</span>
                  <span><i className={styles.legendWarn} />同轨重叠预警</span>
                  <span><i className={styles.legendSelect} />当前选择</span>
                </div>
              </div>
            )}
          </section>

          <section className={styles.inspectorSection}>
            <div className={styles.sectionHead}>
              <div>
                <small>EXPORT</small>
                <h2>混音结果</h2>
              </div>
            </div>
            {exportResult ? (
              <div className={styles.exportList}>
                {exportResult.exportPath && (
                  <a href={mediaUrl(exportResult.exportPath, Date.now())} target="_blank" rel="noreferrer">
                    打开导出视频
                  </a>
                )}
                {exportResult.mixedAudio && (
                  <a href={mediaUrl(exportResult.mixedAudio, Date.now())} target="_blank" rel="noreferrer">
                    打开混合音轨 WAV
                  </a>
                )}
                {exportResult.srtPath && (
                  <a href={mediaUrl(exportResult.srtPath, Date.now())} target="_blank" rel="noreferrer">
                    打开生成字幕
                  </a>
                )}
              </div>
            ) : (
              <p className={styles.inspectorHint}>
                完成编辑后点击顶部“混音并导出”。同轨重叠、越界、offset 超长等问题会在这里以结构化错误展示。
              </p>
            )}
          </section>

          <section className={`${styles.inspectorSection} ${styles.shortcutCard}`}>
            <small>KEYBOARD</small>
            <div><kbd>Space</kbd><span>播放 / 暂停</span></div>
            <div><kbd>Ctrl Z</kbd><span>撤销</span></div>
            <div><kbd>Ctrl Shift Z</kbd><span>重做</span></div>
            <div><kbd>Ctrl 点击</kbd><span>追加或移除选择</span></div>
            <div><kbd>Ctrl 滚轮</kbd><span>以指针为锚点缩放</span></div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function allClipCount(timeline: RedubTimeline) {
  return timeline.tracks.reduce((total, track) => total + track.clips.length, 0);
}
