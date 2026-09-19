/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { buildIndexTtsWorkflow, normalizeIndexTtsRequest } from "../lib/index-tts-workflow.mjs";

const execFileAsync = promisify(execFile);
const DIRECTOR_WORKSPACE = path.resolve("D:\\HermesWorkspace\\directorMaster");
const VOICE_ROOT = path.join(DIRECTOR_WORKSPACE, "workspace", "voice-clone");
const ASSET_ROOT = path.join(VOICE_ROOT, "assets");
const JOB_ROOT = path.join(VOICE_ROOT, "jobs");
const OUTPUT_ROOT = path.join(VOICE_ROOT, "generated");
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac"]);

function safeName(value: unknown, fallback = "voice") {
  return String(value || fallback)
    .trim()
    .replace(/[^\w\-.\u4e00-\u9fff]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 96) || fallback;
}

function workspacePath(value: unknown) {
  const resolved = path.resolve(String(value || ""));
  if (resolved !== DIRECTOR_WORKSPACE && !resolved.startsWith(DIRECTOR_WORKSPACE + path.sep))
    throw new Error("声音素材必须位于 Director Master 工作区内");
  return resolved;
}

async function probeAudio(file: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
    "-of", "json", file,
  ], { windowsHide: true, timeout: 30000 });
  const parsed = JSON.parse(stdout);
  const duration = Number(parsed.format?.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("未检测到有效音频轨道");
  return {
    duration,
    codec: parsed.streams?.[0]?.codec_name || "unknown",
    sampleRate: Number(parsed.streams?.[0]?.sample_rate || 0),
    channels: Number(parsed.streams?.[0]?.channels || 0),
    recommended: duration >= 3 && duration <= 10,
  };
}

async function detectLeadingSilence(file: string) {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-hide_banner", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.04", "-f", "null", "NUL",
    ], { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const start = stderr.match(/silence_start:\s*([\d.]+)/);
    const end = stderr.match(/silence_end:\s*([\d.]+)/);
    return start && Number(start[1]) < 0.05 && end ? Number(end[1]) : 0;
  } catch (error: any) {
    const text = String(error?.stderr || "");
    const start = text.match(/silence_start:\s*([\d.]+)/);
    const end = text.match(/silence_end:\s*([\d.]+)/);
    return start && Number(start[1]) < 0.05 && end ? Number(end[1]) : 0;
  }
}

export async function saveVoiceAsset(request: any) {
  const kind = request.kind === "emotion" ? "emotion" : "speaker";
  const original = path.basename(String(request.fileName || "reference.wav"));
  const extension = path.extname(original).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) throw new Error("仅支持 WAV、MP3、FLAC、M4A、OGG、AAC 音频");
  const bytes = Buffer.from(String(request.dataBase64 || ""), "base64");
  if (!bytes.length) throw new Error("上传的声音文件为空");
  if (bytes.length > 100 * 1024 * 1024) throw new Error("单个声音素材不能超过 100 MB");
  const id = randomUUID();
  const directory = path.join(ASSET_ROOT, kind);
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, `${id}_${safeName(original)}`);
  await fs.writeFile(target, bytes, { flag: "wx" });
  try {
    const audio = await probeAudio(target);
    const asset = {
      id,
      kind,
      name: path.basename(original, extension),
      fileName: path.basename(target),
      path: target,
      ...audio,
      leadingSilence: await detectLeadingSilence(target),
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify(asset, null, 2), "utf8");
    return asset;
  } catch (error) {
    await fs.unlink(target).catch(() => undefined);
    throw error;
  }
}

export async function listVoiceAssets() {
  const assets: any[] = [];
  for (const kind of ["speaker", "emotion"]) {
    const directory = path.join(ASSET_ROOT, kind);
    for (const name of await fs.readdir(directory).catch(() => [])) {
      if (!name.endsWith(".json")) continue;
      const asset = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      assets.push(asset);
    }
  }
  return assets.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function discoverComfy() {
  const script = [
    '$p=Get-CimInstance Win32_Process|Where-Object{$_.Name -match "^python(w)?\\.exe$" -and $_.CommandLine -match "main\\.py"}',
    '$r=foreach($x in $p){Get-NetTCPConnection -State Listen -OwningProcess $x.ProcessId -ErrorAction SilentlyContinue|ForEach-Object{[pscustomobject]@{pid=$x.ProcessId;port=$_.LocalPort}}}',
    '$r|Sort-Object port|ConvertTo-Json -Compress',
  ].join(";");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 10000 });
  const text = stdout.trim();
  if (!text) throw new Error("未发现正在运行的 ComfyUI；Director Master 不会启动新实例");
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const selected = rows.find((item) => Number(item.port) === 8188) || rows[0];
  return { url: `http://127.0.0.1:${selected.port}`, pid: selected.pid, port: selected.port };
}

async function ensureIndexTtsNodes(base: string) {
  const required = [
    "T8_IndexTTS25_ModelLoader",
    "T8_IndexTTS25_ReferenceQuality",
    "T8_IndexTTS25_EmotionControl",
    "T8_IndexTTS25_Generate",
  ];
  const missing: string[] = [];
  for (const node of required) {
    const response = await fetch(`${base}/object_info/${node}`);
    if (!response.ok) missing.push(node);
    else {
      const info = await response.json() as Record<string, unknown>;
      if (!info[node]) missing.push(node);
    }
  }
  if (missing.length) throw new Error("当前 ComfyUI 未安装或未加载 IndexTTS 2.5 · T8star-Aix 节点，请安装后重启 ComfyUI");
}

async function uploadToComfy(base: string, file: string, uploadName: string) {
  const bytes = await fs.readFile(file);
  const form = new FormData();
  form.append("image", new Blob([bytes]), uploadName);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await fetch(`${base}/upload/image`, { method: "POST", body: form });
  const receipt: any = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) throw new Error(`参考音频上传到 ComfyUI 失败：${receipt.error || response.status}`);
  return String(receipt.name || uploadName);
}

export async function submitVoiceJob(request: any) {
  if (request.consent !== true) throw new Error("请先确认已获得该声音的克隆和使用授权");
  const normalized = normalizeIndexTtsRequest(request);
  const speakerPath = workspacePath(request.speakerPath);
  await fs.access(speakerPath);
  const emotionPath = normalized.emotionMode === "audio" ? workspacePath(request.emotionAudioPath) : "";
  if (emotionPath) await fs.access(emotionPath);
  const runtime = await discoverComfy();
  await ensureIndexTtsNodes(runtime.url);
  const id = randomUUID();
  const speakerFile = await uploadToComfy(runtime.url, speakerPath, `${id}_speaker${path.extname(speakerPath)}`);
  const emotionFile = emotionPath
    ? await uploadToComfy(runtime.url, emotionPath, `${id}_emotion${path.extname(emotionPath)}`)
    : undefined;
  const label = safeName(request.character || request.outputName || "voice");
  const workflow = buildIndexTtsWorkflow({
    ...normalized,
    speakerFile,
    emotionFile,
    outputPrefix: `DirectorMaster/voice/${label}_${id.slice(0, 8)}`,
  });
  const response = await fetch(`${runtime.url}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  });
  const queued: any = await response.json();
  if (!response.ok || queued.error) throw new Error(queued.error?.message || queued.error || "IndexTTS 提交失败");
  const job = {
    id,
    promptId: queued.prompt_id,
    status: "queued",
    stage: "已进入 ComfyUI 队列",
    comfyUrl: runtime.url,
    comfyPort: runtime.port,
    character: String(request.character || "").trim(),
    text: normalized.text,
    language: normalized.language,
    emotionMode: normalized.emotionMode,
    emotionText: normalized.emotionText,
    emotionVector: normalized.emotionVector,
    emotionStrength: normalized.emotionStrength,
    durationFactor: normalized.durationFactor,
    speakerPath,
    emotionAudioPath: emotionPath || undefined,
    consentConfirmed: true,
    consentConfirmedAt: new Date().toISOString(),
    workflowHash: createHash("sha256").update(JSON.stringify(workflow)).digest("hex"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(JOB_ROOT, { recursive: true });
  await fs.writeFile(path.join(JOB_ROOT, `${id}.json`), JSON.stringify(job, null, 2), "utf8");
  return job;
}

function safeJobId(value: unknown) {
  const id = String(value || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("声音任务 ID 无效");
  return id;
}

export async function getVoiceJob(value: unknown) {
  const id = safeJobId(value);
  const jobFile = path.join(JOB_ROOT, `${id}.json`);
  const job = JSON.parse(await fs.readFile(jobFile, "utf8"));
  if (["done", "error"].includes(job.status)) return job;
  const history = await (await fetch(`${job.comfyUrl}/history/${job.promptId}`)).json() as Record<string, any>;
  const record = history[job.promptId];
  if (!record) return { ...job, status: "running", stage: "IndexTTS 2.5 正在生成" };
  if (record.status?.status_str === "error") {
    Object.assign(job, { status: "error", stage: "生成失败", error: JSON.stringify(record.status.messages || record.status), updatedAt: new Date().toISOString() });
  } else {
    const outputs = Object.values(record.outputs || {}).flatMap((output: any) => output.audio || []);
    const audio = outputs.find((item: any) => item?.filename);
    if (!audio) {
      Object.assign(job, { status: "error", stage: "ComfyUI 已完成但未返回音频", updatedAt: new Date().toISOString() });
    } else {
      const params = new URLSearchParams({ filename: audio.filename, subfolder: audio.subfolder || "", type: audio.type || "output" });
      const upstream = await fetch(`${job.comfyUrl}/view?${params}`);
      if (!upstream.ok) throw new Error("读取 IndexTTS 输出音频失败");
      await fs.mkdir(OUTPUT_ROOT, { recursive: true });
      const extension = AUDIO_EXTENSIONS.has(path.extname(audio.filename).toLowerCase()) ? path.extname(audio.filename) : ".wav";
      const outputPath = path.join(OUTPUT_ROOT, `${safeName(job.character || "voice")}_${id.slice(0, 8)}${extension}`);
      await fs.writeFile(outputPath, Buffer.from(await upstream.arrayBuffer()));
      const audioInfo = await probeAudio(outputPath);
      Object.assign(job, { status: "done", stage: "生成完成", outputPath, outputFile: path.basename(outputPath), audio: audioInfo, updatedAt: new Date().toISOString() });
    }
  }
  await fs.writeFile(jobFile, JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function listVoiceJobs() {
  const jobs: any[] = [];
  for (const name of await fs.readdir(JOB_ROOT).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    jobs.push(JSON.parse(await fs.readFile(path.join(JOB_ROOT, name), "utf8")));
  }
  return jobs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
}

