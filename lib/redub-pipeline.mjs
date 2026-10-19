/**
 * Dialogue redub P0 pipeline — ComfyUI only (no spawn).
 * Stages: extract → separate → R2T2 ASR → edit script → IndexTTS lines → mix → mux
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { buildIndexTtsWorkflow, normalizeIndexTtsRequest } from "./index-tts-workflow.mjs";
import {
  getAudibleTracks,
  migrateScriptToTimeline,
  normalizeTimeline,
  validateTimeline,
} from "./redub-timeline.mjs";

const execFileAsync = promisify(execFile);
export const DIRECTOR_WORKSPACE = path.resolve("D:\\HermesWorkspace\\directorMaster");
export const REDUB_ROOT = path.join(DIRECTOR_WORKSPACE, "workspace", "dialogue-redub");

const COMFY_CANDIDATES = [
  "F:\\Work-Fisher纯净包2026.8.7\\ComfyUI",
  "F:/Work-Fisher纯净包2026.8.7/ComfyUI",
];

export function safeName(value, fallback = "redub") {
  return (
    String(value || fallback)
      .trim()
      .replace(/[^\w\-.\u4e00-\u9fff]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 96) || fallback
  );
}

export async function discoverComfy() {
  const script = [
    '$p=Get-CimInstance Win32_Process|Where-Object{$_.Name -match "^python(w)?\\.exe$" -and $_.CommandLine -match "main\\.py"}',
    '$r=foreach($x in $p){Get-NetTCPConnection -State Listen -OwningProcess $x.ProcessId -ErrorAction SilentlyContinue|ForEach-Object{[pscustomobject]@{pid=$x.ProcessId;port=$_.LocalPort;cmd=$x.CommandLine}}}',
    "$r|Sort-Object port|ConvertTo-Json -Compress",
  ].join(";");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    timeout: 15000,
  });
  const text = stdout.trim();
  if (!text) throw new Error("未发现正在运行的 ComfyUI；Director Master 不会启动新实例");
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const selected = rows.find((item) => Number(item.port) === 8188) || rows[0];
  let root = "";
  const cmd = String(selected.cmd || "");
  const m = cmd.match(/([A-Za-z]:\\[^"]+?)\\main\.py/i) || cmd.match(/([A-Za-z]:\/[^"]+?)\/main\.py/i);
  if (m) root = m[1].replace(/\//g, "\\");
  if (!root) {
    for (const candidate of COMFY_CANDIDATES) {
      try {
        await fs.access(path.join(candidate, "main.py"));
        root = candidate;
        break;
      } catch {
        /* continue */
      }
    }
  }
  if (!root) throw new Error("无法定位 ComfyUI 根目录");
  return {
    url: `http://127.0.0.1:${selected.port}`,
    pid: selected.pid,
    port: Number(selected.port),
    root,
    inputDir: path.join(root, "input"),
    outputDir: path.join(root, "output"),
  };
}

async function ensureNodes(base, names) {
  const missing = [];
  for (const node of names) {
    const response = await fetch(`${base}/object_info/${encodeURIComponent(node)}`);
    if (!response.ok) {
      missing.push(node);
      continue;
    }
    const info = await response.json();
    if (!info[node]) missing.push(node);
  }
  if (missing.length) throw new Error(`ComfyUI 缺少节点：${missing.join(", ")}`);
}

async function uploadAudio(comfy, file, uploadName) {
  const bytes = await fs.readFile(file);
  const form = new FormData();
  form.append("image", new Blob([bytes]), uploadName);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await fetch(`${comfy.url}/upload/image`, { method: "POST", body: form });
  const receipt = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) throw new Error(`上传音频失败：${receipt.error || response.status}`);
  return String(receipt.name || uploadName);
}

async function queuePrompt(comfy, workflow) {
  const response = await fetch(`${comfy.url}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  });
  const queued = await response.json();
  if (!response.ok || queued.error) {
    const detail = queued.node_errors || queued.error || queued;
    throw new Error(`Comfy 提交失败：${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return queued.prompt_id;
}

async function waitHistory(comfy, promptId, { timeoutMs = 600000, label = "job" } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2500));
    const history = await (await fetch(`${comfy.url}/history/${promptId}`)).json();
    const record = history[promptId];
    if (!record) {
      process.stderr.write(`[redub] ${label}: waiting ${Math.round((Date.now() - started) / 1000)}s\n`);
      continue;
    }
    if (record.status?.status_str === "error") {
      throw new Error(`${label} 失败：${JSON.stringify(record.status.messages || record.status)}`);
    }
    return record;
  }
  throw new Error(`${label} 超时（${timeoutMs}ms）`);
}

async function downloadComfyFile(comfy, fileMeta, destPath) {
  const params = new URLSearchParams({
    filename: fileMeta.filename,
    subfolder: fileMeta.subfolder || "",
    type: fileMeta.type || "output",
  });
  const upstream = await fetch(`${comfy.url}/view?${params}`);
  if (!upstream.ok) throw new Error(`下载 Comfy 文件失败：${fileMeta.filename}`);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, Buffer.from(await upstream.arrayBuffer()));
  return destPath;
}

function collectAudioOutputs(record) {
  return Object.values(record.outputs || {}).flatMap((output) => output.audio || []);
}

function collectTextFiles(record) {
  const files = [];
  for (const output of Object.values(record.outputs || {})) {
    for (const key of Object.keys(output || {})) {
      const value = output[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && item.filename) files.push(item);
        }
      }
    }
  }
  return files;
}

export async function probeMedia(file) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels",
      "-of",
      "json",
      file,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  return JSON.parse(stdout);
}

export async function createJob({ videoPath, name, consent }) {
  if (consent !== true) throw new Error("台词重配涉及声音克隆，必须 consent=true");
  const resolved = path.resolve(videoPath);
  await fs.access(resolved);
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeName(name || path.basename(resolved, path.extname(resolved)))}`;
  const root = path.join(REDUB_ROOT, id);
  const dirs = ["source", "audio", "transcript", "refs", "tts", "subs", "export", "tmp"];
  for (const dir of dirs) await fs.mkdir(path.join(root, dir), { recursive: true });
  const destVideo = path.join(root, "source", path.basename(resolved));
  await fs.copyFile(resolved, destVideo);
  const probe = await probeMedia(destVideo);
  const job = {
    version: 1,
    id,
    status: "imported",
    stage: "已导入成片",
    consentConfirmed: true,
    consentConfirmedAt: new Date().toISOString(),
    root,
    sourceVideo: destVideo,
    probe,
    duration: Number(probe.format?.duration || 0),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(job);
  return job;
}

export async function readJob(jobIdOrRoot) {
  const root = path.isAbsolute(jobIdOrRoot)
    ? jobIdOrRoot
    : path.join(REDUB_ROOT, jobIdOrRoot);
  const job = JSON.parse(await fs.readFile(path.join(root, "job.json"), "utf8"));
  return job;
}

export async function writeJob(job) {
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(path.join(job.root, "job.json"), JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function extractAudio(job) {
  const out = path.join(job.root, "audio", "original.wav");
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-y", "-i", job.sourceVideo, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", out],
    { windowsHide: true, timeout: 120000 },
  );
  job.originalAudio = out;
  job.status = "extracted";
  job.stage = "已抽出原音轨";
  return writeJob(job);
}

/** Separate vocals via Comfy FL_Audio_Separation; fallback keeps original as vocals. */
export async function separateAudio(job, { skip = false } = {}) {
  const vocalsPath = path.join(job.root, "audio", "vocals.wav");
  const instPath = path.join(job.root, "audio", "instrumental.wav");
  if (skip) {
    await fs.copyFile(job.originalAudio, vocalsPath);
    // silent instrumental
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=44100:cl=stereo`,
        "-t",
        String(job.duration || 1),
        "-c:a",
        "pcm_s16le",
        instPath,
      ],
      { windowsHide: true, timeout: 60000 },
    );
    job.vocalsAudio = vocalsPath;
    job.instrumentalAudio = instPath;
    job.separation = "skipped";
    job.status = "separated";
    job.stage = "跳过分离（原音当人声）";
    return writeJob(job);
  }

  const comfy = await discoverComfy();
  await ensureNodes(comfy.url, ["LoadAudio", "FL_Audio_Separation", "SaveAudio"]);
  const uploadName = await uploadAudio(comfy, job.originalAudio, `redub_${job.id}_orig.wav`);
  const prefix = `DirectorMaster/redub/${safeName(job.id)}/sep`;
  const workflow = {
    "1": { class_type: "LoadAudio", inputs: { audio: uploadName } },
    "2": {
      class_type: "FL_Audio_Separation",
      inputs: { audio: ["1", 0], chunk_length: 12, chunk_overlap: 0.15, chunk_fade_shape: "linear" },
    },
    // FL outputs: 0 bass, 1 drums, 2 other, 3 vocals
    "3": { class_type: "SaveAudio", inputs: { audio: ["2", 3], filename_prefix: `${prefix}_vocals` } },
    "4": { class_type: "SaveAudio", inputs: { audio: ["2", 0], filename_prefix: `${prefix}_bass` } },
    "5": { class_type: "SaveAudio", inputs: { audio: ["2", 1], filename_prefix: `${prefix}_drums` } },
    "6": { class_type: "SaveAudio", inputs: { audio: ["2", 2], filename_prefix: `${prefix}_other` } },
  };
  process.stderr.write("[redub] separating audio via FL_Audio_Separation…\n");
  const promptId = await queuePrompt(comfy, workflow);
  const record = await waitHistory(comfy, promptId, { timeoutMs: 900000, label: "separate" });
  const audios = collectAudioOutputs(record);
  const pick = (needle) => audios.find((a) => String(a.filename).includes(needle) || String(a.subfolder || "").includes(needle));
  const vocalsMeta = pick("vocals") || audios[audios.length - 1];
  if (!vocalsMeta) throw new Error("分离完成但未找到 vocals 输出");
  await downloadComfyFile(comfy, vocalsMeta, vocalsPath);

  // mix bass+drums+other into instrumental
  const parts = [];
  for (const key of ["bass", "drums", "other"]) {
    const meta = pick(key);
    if (!meta) continue;
    const p = path.join(job.root, "tmp", `${key}.wav`);
    await downloadComfyFile(comfy, meta, p);
    parts.push(p);
  }
  if (parts.length) {
    const inputs = parts.flatMap((p) => ["-i", p]);
    const filter =
      parts.length === 1
        ? "anull"
        : `amix=inputs=${parts.length}:duration=longest:dropout_transition=0,volume=${parts.length}`;
    if (parts.length === 1) {
      await fs.copyFile(parts[0], instPath);
    } else {
      await execFileAsync(
        "ffmpeg",
        ["-hide_banner", "-y", ...inputs, "-filter_complex", filter, "-c:a", "pcm_s16le", instPath],
        { windowsHide: true, timeout: 180000 },
      );
    }
  } else {
    await fs.copyFile(job.originalAudio, instPath);
  }

  job.vocalsAudio = vocalsPath;
  job.instrumentalAudio = instPath;
  job.separation = "fl_audio_separation";
  job.separationPromptId = promptId;
  job.status = "separated";
  job.stage = "人声/伴奏已分离";
  return writeJob(job);
}

export function buildR2t2Workflow({ audioFile, prefix, language = "Chinese", hotwords = "" }) {
  return {
    "1": { class_type: "LoadAudio", inputs: { audio: audioFile } },
    "2": {
      class_type: "R2T2GGUFLoader",
      inputs: { n_ctx: 8192, n_batch: 1024, n_threads: 8, gpu_layers: -1 },
    },
    "3": {
      class_type: "R2T2Hotwords",
      inputs: { words: hotwords, hotword_file: "" },
    },
    "4": {
      class_type: "R2T2Transcribe",
      inputs: {
        model: ["2", 0],
        audio: ["1", 0],
        mode: "offline",
        language,
        context: "华强买瓜 西瓜摊 老板 顾客 对话",
        hotwords: ["3", 0],
        channel: "mean",
        auto_gain: true,
        stream_chunk_ms: 160,
        subtitle_timings: true,
      },
    },
    "5": {
      class_type: "R2T2SaveTranscript",
      inputs: {
        result_json: ["4", 2],
        format: "json",
        prefix: `${prefix}_json`,
        offset_ms: 0,
        allow_partial: false,
        whole_audio_draft: true,
      },
    },
    "6": {
      class_type: "R2T2SaveTranscript",
      inputs: {
        result_json: ["4", 2],
        format: "srt",
        prefix: `${prefix}_srt`,
        offset_ms: 0,
        allow_partial: true,
        whole_audio_draft: true,
      },
    },
  };
}

export async function transcribe(job, { language = "Chinese", hotwords = "华强,西瓜,老板,保熟" } = {}) {
  const comfy = await discoverComfy();
  await ensureNodes(comfy.url, ["LoadAudio", "R2T2GGUFLoader", "R2T2Transcribe", "R2T2SaveTranscript", "R2T2Hotwords"]);
  const src = job.vocalsAudio || job.originalAudio;
  const uploadName = await uploadAudio(comfy, src, `redub_${job.id}_asr.wav`);
  const prefix = `DirectorMaster/redub/${safeName(job.id)}/asr`;
  const workflow = buildR2t2Workflow({ audioFile: uploadName, prefix, language, hotwords });
  process.stderr.write("[redub] R2T2 ASR running…\n");
  const promptId = await queuePrompt(comfy, workflow);
  const record = await waitHistory(comfy, promptId, { timeoutMs: 1200000, label: "r2t2" });

  // Prefer reading saved files from Comfy output dir
  let transcript = null;
  let srt = "";
  const saved = collectTextFiles(record);
  for (const meta of saved) {
    const name = String(meta.filename || "");
    const local = path.join(job.root, "transcript", name);
    try {
      await downloadComfyFile(comfy, meta, local);
    } catch {
      // try direct path
      const direct = path.join(comfy.outputDir, meta.subfolder || "", name);
      try {
        await fs.copyFile(direct, local);
      } catch {
        continue;
      }
    }
    if (name.endsWith(".json")) {
      try {
        transcript = JSON.parse(await fs.readFile(local, "utf8"));
      } catch {
        /* ignore */
      }
    }
    if (name.endsWith(".srt")) srt = await fs.readFile(local, "utf8");
  }

  // Fallback: scan output for newest matching prefix
  if (!transcript) {
    const outRoot = path.join(comfy.outputDir, "DirectorMaster", "redub", safeName(job.id));
    try {
      const walk = async (dir, acc = []) => {
        for (const ent of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
          const p = path.join(dir, ent.name);
          if (ent.isDirectory()) await walk(p, acc);
          else acc.push(p);
        }
        return acc;
      };
      const files = await walk(outRoot);
      const jsonFile = files.filter((f) => f.endsWith(".json")).sort().at(-1);
      const srtFile = files.filter((f) => f.endsWith(".srt")).sort().at(-1);
      if (jsonFile) {
        const dest = path.join(job.root, "transcript", path.basename(jsonFile));
        await fs.copyFile(jsonFile, dest);
        transcript = JSON.parse(await fs.readFile(dest, "utf8"));
      }
      if (srtFile) {
        const dest = path.join(job.root, "transcript", path.basename(srtFile));
        await fs.copyFile(srtFile, dest);
        srt = await fs.readFile(dest, "utf8");
      }
    } catch {
      /* ignore */
    }
  }

  if (!transcript) {
    // last resort: history text fields
    const dump = path.join(job.root, "transcript", "history_dump.json");
    await fs.writeFile(dump, JSON.stringify(record, null, 2), "utf8");
    throw new Error("R2T2 完成但未拿到 transcript JSON，已写 history_dump.json");
  }

  const segments = normalizeSegments(transcript, srt, job.duration);
  const scriptPath = path.join(job.root, "transcript", "script.json");
  const script = {
    version: 1,
    source: "r2t2",
    language,
    fullText: transcript.text || segments.map((s) => s.originalText).join(""),
    segments: segments.map((seg, index) => ({
      id: `L${String(index + 1).padStart(3, "0")}`,
      speaker: index % 2 === 0 ? "A" : "B",
      start: seg.start,
      end: seg.end,
      originalText: seg.originalText,
      newText: seg.originalText,
      replace: true,
      emotionMode: "speaker",
      emotionText: "",
      durationFactor: 1,
    })),
  };
  await fs.writeFile(scriptPath, JSON.stringify(script, null, 2), "utf8");
  if (srt) await fs.writeFile(path.join(job.root, "transcript", "original.srt"), srt, "utf8");
  await fs.writeFile(path.join(job.root, "transcript", "r2t2_raw.json"), JSON.stringify(transcript, null, 2), "utf8");

  job.transcriptPromptId = promptId;
  job.scriptPath = scriptPath;
  job.segmentCount = script.segments.length;
  job.status = "transcribed";
  job.stage = `听写完成（${script.segments.length} 段）`;
  return writeJob(job);
}

function parseSrt(srt) {
  const blocks = String(srt || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const m = timeLine.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const toSec = (h, mi, s, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join("")
      .trim();
    if (text) out.push({ start, end, originalText: text });
  }
  return out;
}

function inferSampleRate(transcript, duration) {
  const segs = Array.isArray(transcript.segments) ? transcript.segments : [];
  const maxSample = Math.max(
    0,
    ...segs.map((s) => Number(s.end_sample ?? s.speech_end_sample ?? 0)),
  );
  if (maxSample > 0 && duration > 0.5) {
    const guessed = maxSample / duration;
    // snap to common rates
    for (const sr of [16000, 22050, 24000, 44100, 48000]) {
      if (Math.abs(guessed - sr) / sr < 0.08) return sr;
    }
    if (guessed > 8000 && guessed < 96000) return Math.round(guessed);
  }
  return 16000;
}

function segmentSeconds(s, sampleRate) {
  const hasTime =
    s.start != null || s.start_time != null || s.begin != null || s.start_sec != null;
  if (hasTime) {
    const start = Number(s.start ?? s.start_time ?? s.begin ?? s.start_sec ?? 0);
    const end = Number(s.end ?? s.end_time ?? s.finish ?? s.end_sec ?? start + 1);
    return { start, end };
  }
  const startSample = Number(s.speech_start_sample ?? s.start_sample ?? 0);
  const endSample = Number(s.speech_end_sample ?? s.end_sample ?? startSample);
  return {
    start: startSample / sampleRate,
    end: Math.max(startSample + 1, endSample) / sampleRate,
  };
}

function normalizeSegments(transcript, srt, duration) {
  const sampleRate = inferSampleRate(transcript, duration);
  let segs = Array.isArray(transcript.segments)
    ? transcript.segments
        .map((s) => {
          const { start, end } = segmentSeconds(s, sampleRate);
          return {
            start,
            end,
            originalText: String(s.text || s.content || "").trim(),
          };
        })
        .filter((s) => s.originalText)
    : [];
  if (!segs.length && srt) segs = parseSrt(srt);
  if (!segs.length && transcript.text) {
    segs = [{ start: 0, end: Number(duration) || 1, originalText: String(transcript.text).trim() }];
  }
  // merge ultra-short crumbs / adjacent fragments from same breath
  const merged = [];
  for (const seg of segs) {
    const start = Math.max(0, seg.start);
    const end = Math.max(start + 0.25, seg.end || start + 1);
    const prev = merged[merged.length - 1];
    if (prev && start - prev.end < 0.35 && (seg.originalText.length <= 3 || prev.originalText.length <= 3)) {
      prev.end = Math.max(prev.end, end);
      prev.originalText += seg.originalText;
    } else {
      merged.push({ start, end, originalText: seg.originalText });
    }
  }
  return merged;
}

export async function applyScript(job, scriptPath) {
  const resolved = path.resolve(scriptPath);
  const script = JSON.parse(await fs.readFile(resolved, "utf8"));
  if (!Array.isArray(script.segments) || !script.segments.length) throw new Error("script.segments 为空");
  const dest = path.join(job.root, "transcript", "script.json");
  await fs.copyFile(resolved, dest);
  job.scriptPath = dest;
  job.segmentCount = script.segments.length;
  job.status = "editing";
  job.stage = "已应用改写台词本";
  return writeJob(job);
}

export async function extractRefs(job, { speakerRefs = {} } = {}) {
  const script = JSON.parse(await fs.readFile(job.scriptPath, "utf8"));
  const external = { ...(script.speakerRefs || {}), ...(job.speakerRefs || {}), ...speakerRefs };
  const vocals = job.vocalsAudio || job.originalAudio;
  const bySpeaker = {};
  for (const seg of script.segments) {
    const sp = seg.speaker || "A";
    if (!bySpeaker[sp]) bySpeaker[sp] = [];
    bySpeaker[sp].push(seg);
  }
  await fs.mkdir(path.join(job.root, "refs"), { recursive: true });
  const refs = {};
  for (const speaker of Object.keys(bySpeaker)) {
    const out = path.join(job.root, "refs", `${safeName(speaker)}.wav`);
    if (external[speaker]) {
      const src = path.resolve(external[speaker]);
      await fs.access(src);
      await execFileAsync(
        "ffmpeg",
        ["-hide_banner", "-y", "-i", src, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", out],
        { windowsHide: true, timeout: 60000 },
      );
      refs[speaker] = { path: out, source: src, external: true };
      continue;
    }
    // Prefer mid-length, non-shouting segments for stable timbre (avoid fight climax)
    const ranked = [...bySpeaker[speaker]].sort((a, b) => {
      const da = a.end - a.start;
      const db = b.end - b.start;
      const score = (d) => (d >= 1.2 && d <= 4 ? 10 - Math.abs(d - 2.5) : d);
      return score(db) - score(da);
    });
    const calm = ranked.find((s) => {
      const t = s.originalText || "";
      return !/他妈|操|打|骗我|来人/.test(t) && s.end - s.start >= 1.0;
    });
    const chosen = calm || ranked[0];
    const start = Math.max(0, chosen.start);
    let dur = Math.min(8, Math.max(1.8, chosen.end - chosen.start));
    if (start + dur > (job.duration || start + dur)) dur = Math.max(1.2, (job.duration || start + 2) - start);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-y", "-ss", String(start), "-t", String(dur), "-i", vocals, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", out],
      { windowsHide: true, timeout: 60000 },
    );
    refs[speaker] = { path: out, start, duration: dur, fromSegment: chosen.id, external: false };
  }
  job.refs = refs;
  job.speakerRefs = external;
  job.status = "refs_ready";
  job.stage = `参考音色就绪（${Object.keys(refs)
    .map((k) => `${k}${refs[k].external ? "·外置" : "·片内"}`)
    .join(", ")}）`;
  return writeJob(job);
}

function emotionForLine(seg) {
  // Prefer explicit vector; avoid emotionMode=text (loads Qwen, slow/OOM).
  if (seg.emotionVector && typeof seg.emotionVector === "object") {
    return {
      emotionMode: "vector",
      emotionVector: seg.emotionVector,
      emotionStrength: seg.emotionStrength ?? 0.75,
    };
  }
  if (seg.emotionMode === "audio" || seg.emotionMode === "speaker") {
    return {
      emotionMode: seg.emotionMode,
      emotionText: seg.emotionText || "",
      emotionStrength: seg.emotionStrength ?? 0.7,
      emotionVector: seg.emotionVector,
    };
  }
  const t = String(seg.newText || seg.originalText || "");
  const z = { happy: 0, angry: 0, sad: 0, afraid: 0, disgusted: 0, melancholic: 0, surprised: 0, calm: 0 };
  if (/打|骗|他妈|找茬|操|滚|杀|怒|撒谎/.test(t)) {
    return { emotionMode: "vector", emotionVector: { ...z, angry: 0.55, surprised: 0.15 }, emotionStrength: 0.8 };
  }
  if (/喂|来人|哪里|救命|快/.test(t)) {
    return { emotionMode: "vector", emotionVector: { ...z, afraid: 0.35, surprised: 0.35, angry: 0.1 }, emotionStrength: 0.7 };
  }
  if (/吗|呢|什么|能不能|请问|有没有|保熟|折叠/.test(t)) {
    return { emotionMode: "vector", emotionVector: { ...z, surprised: 0.25, calm: 0.45 }, emotionStrength: 0.6 };
  }
  if (/哈哈|笑|开心|行啊|满意|轻松/.test(t)) {
    return { emotionMode: "vector", emotionVector: { ...z, happy: 0.55, calm: 0.2 }, emotionStrength: 0.55 };
  }
  if (/安静|犹豫|午睡|影子|折纸|云|星星|邮件|水母|订书机|星期三|露水|刷牙/.test(t)) {
    return { emotionMode: "vector", emotionVector: { ...z, calm: 0.7, melancholic: 0.1 }, emotionStrength: 0.5 };
  }
  if (/推销|推荐|怎么样|挑/.test(t)) {
    return { emotionMode: "vector", emotionVector: { ...z, happy: 0.25, calm: 0.5 }, emotionStrength: 0.55 };
  }
  // default: calm conversational — NOT angry
  return { emotionMode: "vector", emotionVector: { ...z, calm: 0.65 }, emotionStrength: 0.55 };
}

export async function synthesizeLines(job, { onlySpeakers = null, force = false } = {}) {
  const script = JSON.parse(await fs.readFile(job.scriptPath, "utf8"));
  const allow = onlySpeakers?.length
    ? new Set(onlySpeakers.map(String))
    : null;
  const comfy = await discoverComfy();
  await ensureNodes(comfy.url, [
    "T8_IndexTTS25_ModelLoader",
    "T8_IndexTTS25_ReferenceQuality",
    "T8_IndexTTS25_EmotionControl",
    "T8_IndexTTS25_Generate",
    "LoadAudio",
    "SaveAudio",
  ]);
  if (!job.refs) await extractRefs(job);
  // cache uploaded speaker files
  const speakerUpload = {};
  const prevManifest = [];
  try {
    const old = JSON.parse(await fs.readFile(job.ttsManifest, "utf8"));
    if (Array.isArray(old)) prevManifest.push(...old);
  } catch {
    /* first run */
  }
  const prevById = Object.fromEntries(prevManifest.filter((m) => m?.id).map((m) => [m.id, m]));
  const results = [];
  for (let i = 0; i < script.segments.length; i += 1) {
    const seg = script.segments[i];
    if (seg.replace === false) {
      results.push({ ...seg, skipped: true });
      continue;
    }
    const text = String(seg.newText || "").trim();
    if (!text) {
      results.push({ ...seg, skipped: true, reason: "empty" });
      continue;
    }
    const out = path.join(job.root, "tts", `${seg.id}.wav`);
    const speakerHit = !allow || allow.has(String(seg.speaker));
    if (!speakerHit || (!force && allow && !allow.has(String(seg.speaker)))) {
      // keep previous line audio
      if (prevById[seg.id]?.path) {
        results.push({ ...prevById[seg.id] });
      } else {
        try {
          await fs.access(out);
          results.push({
            id: seg.id,
            speaker: seg.speaker,
            start: seg.start,
            end: seg.end,
            text,
            path: out,
            skipped: true,
            reason: "reuse",
          });
        } catch {
          results.push({ ...seg, skipped: true, reason: "no-prev" });
        }
      }
      continue;
    }
    // when onlySpeakers set, non-matching already continued; force regenerate matching
    try {
      if (!force && !allow) {
        await fs.access(out);
        // full-run reuse existing unless force
        results.push({
          ...(prevById[seg.id] || {}),
          id: seg.id,
          speaker: seg.speaker,
          start: seg.start,
          end: seg.end,
          text,
          path: out,
          skipped: true,
          reason: "exists",
        });
        continue;
      }
    } catch {
      /* need generate */
    }
    const ref = job.refs[seg.speaker] || Object.values(job.refs)[0];
    if (!ref?.path) throw new Error(`缺少 speaker=${seg.speaker} 的参考音频`);
    const slot = Math.max(0.4, (seg.end - seg.start) || 1);
    let durationFactor = Number(seg.durationFactor);
    if (!Number.isFinite(durationFactor) || durationFactor <= 0) {
      const est = Math.max(0.6, text.length * 0.16);
      if (est > slot * 1.05) durationFactor = Math.min(1.25, Math.max(0.75, slot / est));
      else if (est < slot * 0.5) durationFactor = Math.min(1.15, Math.max(0.85, est / slot + 0.3));
      else durationFactor = 1;
    }
    const emo = emotionForLine(seg);
    const normalized = normalizeIndexTtsRequest({
      text,
      language: seg.language || "ZH",
      ...emo,
      durationFactor,
      seed: seg.seed ?? 20260913 + i,
      qualityRetryCount: 0,
    });
    if (!speakerUpload[seg.speaker]) {
      speakerUpload[seg.speaker] = await uploadAudio(comfy, ref.path, `redub_${safeName(job.id)}_${safeName(seg.speaker)}_ref.wav`);
    }
    const workflow = buildIndexTtsWorkflow({
      ...normalized,
      speakerFile: speakerUpload[seg.speaker],
      outputPrefix: `DirectorMaster/redub/${safeName(job.id)}/tts_${seg.id}`,
    });
    process.stderr.write(
      `[redub] TTS ${i + 1}/${script.segments.length} ${seg.id} ${seg.speaker} [${normalized.emotionMode}:${(normalized.emotionText || "spk").slice(0, 16)}]: ${text.slice(0, 20)}…\n`,
    );
    const promptId = await queuePrompt(comfy, workflow);
    const record = await waitHistory(comfy, promptId, { timeoutMs: 600000, label: `tts-${seg.id}` });
    const audioMeta = collectAudioOutputs(record).find((a) => a?.filename);
    if (!audioMeta) throw new Error(`${seg.id} TTS 无音频输出`);
    await downloadComfyFile(comfy, audioMeta, out);
    let ttsDur = slot;
    try {
      const p = await probeMedia(out);
      ttsDur = Number(p.format?.duration || slot);
    } catch {
      /* ignore */
    }
    results.push({
      id: seg.id,
      speaker: seg.speaker,
      start: seg.start,
      end: seg.end,
      text,
      path: out,
      ttsDuration: ttsDur,
      promptId,
      durationFactor,
      emotionMode: normalized.emotionMode,
      emotionText: normalized.emotionText,
    });
  }
  const manifest = path.join(job.root, "tts", "manifest.json");
  await fs.writeFile(manifest, JSON.stringify(results, null, 2), "utf8");
  job.ttsManifest = manifest;
  job.ttsCount = results.filter((r) => r.path).length;
  job.status = "tts_done";
  job.stage = `IndexTTS 完成 ${results.filter((r) => r.path && !r.reason).length}/${job.ttsCount} 句`;
  return writeJob(job);
}

async function assertWorkspacePath(filePath, label) {
  const resolved = path.resolve(String(filePath || ""));
  const workspaceReal = await fs.realpath(DIRECTOR_WORKSPACE).catch(() => DIRECTOR_WORKSPACE);
  const targetReal = await fs.realpath(resolved).catch(() => resolved);
  const lexicalRelative = path.relative(DIRECTOR_WORKSPACE, resolved);
  const realRelative = path.relative(workspaceReal, targetReal);
  const outside = (relative) =>
    !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (outside(lexicalRelative) || outside(realRelative)) {
    throw new Error(`${label} 不在 Director Master 工作区内：${filePath}`);
  }
  return resolved;
}

async function readJsonFile(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw error;
    throw new Error(`${label} 读取或解析失败：${error.message}`);
  }
}

async function loadTimelineForMix(job) {
  const jobRoot = await assertWorkspacePath(job.root, "job.root");
  const timelinePath = path.join(jobRoot, "timeline.json");
  let timeline;
  try {
    timeline = normalizeTimeline(await readJsonFile(timelinePath, "timeline.json"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!job.scriptPath || !job.ttsManifest) {
      throw new Error("缺少 timeline.json，且旧 script.json / tts manifest 不完整");
    }
    const scriptPath = await assertWorkspacePath(job.scriptPath, "script.json");
    const manifestPath = await assertWorkspacePath(job.ttsManifest, "tts manifest");
    const script = await readJsonFile(scriptPath, "script.json");
    const manifest = await readJsonFile(manifestPath, "tts manifest");
    timeline = normalizeTimeline(
      migrateScriptToTimeline(script, manifest, {
        duration: job.duration,
        name: `${job.id || "台词重配"} · 时间轴`,
        instrumentalPath: job.instrumentalAudio,
        separation: job.separation,
      }),
    );
  }

  const errors = validateTimeline(timeline);
  if (errors.length) {
    const detail = errors.map((error) => `${error.code}@${error.location}: ${error.message}`).join("; ");
    throw new Error(`时间轴校验失败：${detail}`);
  }
  return timeline;
}

function ffNumber(value) {
  return Number(Number(value).toFixed(6)).toString();
}

function panFilter(pan) {
  const left = pan <= 0 ? 1 : 1 - pan;
  const right = pan >= 0 ? 1 : 1 + pan;
  // 当前 FFmpeg 的 pan 表达式要求系数写在声道名之前。
  return `pan=stereo|c0=${ffNumber(left)}*c0|c1=${ffNumber(right)}*c1`;
}

function clipFilter(clip, inputIndex, sourceDuration) {
  const duration = Math.max(0.001, Number(clip.duration));
  const offset = Math.max(0, Number(clip.offset));
  const available = Math.max(0, sourceDuration - offset);
  const parts = [
    `[${inputIndex}:a]aresample=44100:async=1:first_pts=0`,
    "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo",
    `atrim=start=${ffNumber(offset)}`,
    "asetpts=PTS-STARTPTS",
  ];
  if (available > duration * 1.08) {
    const tempo = Math.min(1.4, Math.max(1.01, available / duration));
    parts.push(`atempo=${ffNumber(tempo)}`);
  }
  parts.push(
    `apad=whole_dur=${ffNumber(duration)}`,
    `atrim=duration=${ffNumber(duration)}`,
    "asetpts=PTS-STARTPTS",
    `volume=${ffNumber(clip.gain)}`,
  );
  if (Number(clip.fadeIn) > 0) {
    parts.push(`afade=t=in:st=0:d=${ffNumber(clip.fadeIn)}`);
  }
  if (Number(clip.fadeOut) > 0) {
    const fadeStart = Math.max(0, duration - Number(clip.fadeOut));
    parts.push(`afade=t=out:st=${ffNumber(fadeStart)}:d=${ffNumber(clip.fadeOut)}`);
  }
  if (Number(clip.start) > 0) {
    parts.push(`adelay=${Math.round(Number(clip.start) * 1000)}:all=1`);
  }
  return `${parts.join(",")}[c${inputIndex}]`;
}

async function clipSourceDuration(clip, audioPath, cache) {
  if (Number(clip.sourceDuration) > 0) return Number(clip.sourceDuration);
  if (cache.has(audioPath)) return cache.get(audioPath);
  const pending = probeMedia(audioPath)
    .then((probe) => {
      const audioStream = Array.isArray(probe.streams)
        ? probe.streams.find((stream) => stream?.codec_type === "audio")
        : null;
      const duration = Number(probe.format?.duration || audioStream?.duration || 0);
      return duration > 0 ? duration : Number(clip.offset) + Number(clip.duration);
    })
    .catch((error) => {
      throw new Error(`无法读取片段 ${clip.id} 的素材时长：${error.message}`);
    });
  cache.set(audioPath, pending);
  return pending;
}

function buildTimelineSrt(timeline) {
  const toTs = (sec) => {
    const safe = Math.max(0, Math.min(Number(timeline.duration), sec));
    const totalMilliseconds = Math.round(safe * 1000);
    const hours = Math.floor(totalMilliseconds / 3600000);
    const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
    const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
    const milliseconds = totalMilliseconds % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
  };
  const dialogueTrackIds = new Set(
    timeline.tracks.filter((track) => track.kind === "dialogue").map((track) => track.id),
  );
  const clips = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => dialogueTrackIds.has(clip.trackId) && String(clip.text || "").trim())
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const lines = [];
  clips.forEach((clip, index) => {
    const start = Math.max(0, Number(clip.start));
    const end = Math.min(
      Number(timeline.duration),
      Math.max(start + 0.4, start + Number(clip.duration)),
    );
    lines.push(String(index + 1));
    lines.push(`${toTs(start)} --> ${toTs(end)}`);
    lines.push(String(clip.text).trim());
    lines.push("");
  });
  return lines.join("\n");
}

export async function mixAndExport(job, { burnSubs = true } = {}) {
  const timeline = await loadTimelineForMix(job);
  const jobRoot = await assertWorkspacePath(job.root, "job.root");
  const sourceVideo = await assertWorkspacePath(job.sourceVideo, "sourceVideo");
  const duration = Math.max(0.001, Number(timeline.duration));
  const inputs = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
  const filterParts = [
    `[0:a]atrim=duration=${ffNumber(duration)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[base]`,
  ];
  const trackOutputs = [];
  const durationCache = new Map();
  let inputIndex = 1;
  let trackNumber = 0;

  for (const track of getAudibleTracks(timeline)) {
    const clipOutputs = [];
    for (const clip of track.clips) {
      if (clip.mute) continue;
      const resolvedPath = path.isAbsolute(clip.audioPath)
        ? clip.audioPath
        : path.resolve(jobRoot, clip.audioPath);
      const audioPath = await assertWorkspacePath(resolvedPath, `片段 ${clip.id} 的 audioPath`);
      try {
        await fs.access(audioPath);
      } catch {
        throw new Error(`片段 ${clip.id} 的音频不存在：${audioPath}`);
      }
      const sourceDuration = await clipSourceDuration(clip, audioPath, durationCache);
      if (Number(clip.offset) >= sourceDuration) {
        throw new Error(`片段 ${clip.id} 的 offset 超出素材时长`);
      }
      inputs.push("-i", audioPath);
      filterParts.push(clipFilter(clip, inputIndex, sourceDuration));
      clipOutputs.push(`[c${inputIndex}]`);
      inputIndex += 1;
    }
    if (!clipOutputs.length) continue;

    const output = `[t${trackNumber}]`;
    const volume = `volume=${ffNumber(track.volume)}`;
    const pan = panFilter(track.pan);
    if (clipOutputs.length === 1) {
      filterParts.push(`${clipOutputs[0]}${volume},${pan}${output}`);
    } else {
      filterParts.push(
        `${clipOutputs.join("")}amix=inputs=${clipOutputs.length}:duration=longest:dropout_transition=0:normalize=0,${volume},${pan}${output}`,
      );
    }
    trackOutputs.push(output);
    trackNumber += 1;
  }

  if (trackOutputs.length) {
    filterParts.push(
      `[base]${trackOutputs.join("")}amix=inputs=${trackOutputs.length + 1}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[out]`,
    );
  } else {
    filterParts.push("[base]alimiter=limit=0.95:level=false:latency=true[out]");
  }

  const mixed = path.join(jobRoot, "audio", "mixed.wav");
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-y",
      ...inputs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[out]",
      "-t",
      ffNumber(duration),
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      mixed,
    ],
    { windowsHide: true, timeout: 300000 },
  );

  const srtPath = path.join(jobRoot, "subs", "new.srt");
  await fs.writeFile(srtPath, buildTimelineSrt(timeline), "utf8");

  const exportPath = path.join(jobRoot, "export", `${safeName(job.id)}.mp4`);
  if (burnSubs) {
    // Windows 下 subtitles 滤镜需要转义盘符和反斜杠。
    const srtEsc = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-i",
        sourceVideo,
        "-i",
        mixed,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-vf",
        `subtitles='${srtEsc}':force_style='Fontsize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=24'`,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        exportPath,
      ],
      { windowsHide: true, timeout: 600000 },
    );
  } else {
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-i",
        sourceVideo,
        "-i",
        mixed,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        exportPath,
      ],
      { windowsHide: true, timeout: 300000 },
    );
  }

  job.mixedAudio = mixed;
  job.srtPath = srtPath;
  job.exportPath = exportPath;
  job.status = "done";
  job.stage = "导出完成";
  return writeJob(job);
}

export async function runPipeline({
  videoPath,
  name,
  consent,
  scriptPath,
  skipSeparate = false,
  burnSubs = true,
  stopAfter,
} = {}) {
  let job = await createJob({ videoPath, name, consent });
  process.stderr.write(`[redub] job ${job.id}\n`);
  job = await extractAudio(job);
  if (stopAfter === "extract") return job;
  try {
    job = await separateAudio(job, { skip: skipSeparate });
  } catch (error) {
    process.stderr.write(`[redub] separate failed, fallback: ${error.message}\n`);
    job = await separateAudio(job, { skip: true });
  }
  if (stopAfter === "separate") return job;
  job = await transcribe(job);
  if (stopAfter === "transcribe") return job;
  if (scriptPath) job = await applyScript(job, scriptPath);
  job = await extractRefs(job);
  if (stopAfter === "refs") return job;
  job = await synthesizeLines(job);
  if (stopAfter === "tts") return job;
  job = await mixAndExport(job, { burnSubs });
  return job;
}
