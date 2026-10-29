import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseRhAsrOutput } from './subtitle-asr.mjs';
import { writeBilingualSubtitles } from './subtitle-cues.mjs';

/** @typedef {{ startMs: number, endMs: number, text: string, translation?: string }} SubtitleCue */

export const DEFAULT_SUBTITLE_ASR_WORKFLOW_ID = '2104649076645130241';
export const DEFAULT_SUBTITLE_ASR_API_BASE = 'https://www.runninghub.cn';

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function hasSubtitleAsrKey(env = process.env) {
  return Boolean(String(env?.RUNNINGHUB_API_KEY || '').trim());
}

/**
 * @param {{
 *   outDir?: string,
 *   workflowId?: string,
 *   apiBase?: string,
 *   jobId?: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} [options]
 */
export function resolveSubtitleAsrConfig(options = {}) {
  const env = options.env || process.env;
  const workflowId =
    String(options.workflowId || env.RUNNINGHUB_SUBTITLE_WORKFLOW_ID || DEFAULT_SUBTITLE_ASR_WORKFLOW_ID).trim() ||
    DEFAULT_SUBTITLE_ASR_WORKFLOW_ID;
  const apiBase =
    String(options.apiBase || env.RUNNINGHUB_API_BASE || DEFAULT_SUBTITLE_ASR_API_BASE).trim().replace(/\/$/, '') ||
    DEFAULT_SUBTITLE_ASR_API_BASE;
  const jobId = options.jobId ? String(options.jobId) : undefined;
  const baseOut = path.resolve(String(options.outDir || '.'));
  const outDir = jobId ? path.join(baseOut, jobId) : baseOut;
  return { workflowId, apiBase, outDir, jobId };
}

/**
 * Shape RH create payload fields without embedding apiKey / calling network.
 * @param {{ workflowId: string, fileName: string, nodeInfoList?: any[] }} input
 */
export function buildSubtitleAsrSubmitBody(input) {
  const workflowId = String(input.workflowId || '').trim();
  const fileName = String(input.fileName || '').trim();
  if (!workflowId) throw new Error('buildSubtitleAsrSubmitBody 需要 workflowId');
  if (!fileName) throw new Error('buildSubtitleAsrSubmitBody 需要 fileName');

  const nodeInfoList = Array.isArray(input.nodeInfoList)
    ? input.nodeInfoList
    : [
        {
          nodeId: '1',
          fieldName: 'video',
          fieldValue: fileName,
        },
      ];

  return {
    workflowId,
    instanceType: 'plus',
    nodeInfoList,
    workflow: '',
    fileName,
  };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Try to parse JSON text; return null on failure.
 * @param {string} text
 */
function tryParseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Normalize common RH outputs array/objects into something parseRhAsrOutput can consume.
 * @param {unknown} outputs
 */
export function extractAsrRawFromCloudOutputs(outputs) {
  if (outputs == null) {
    throw new Error('RH ASR 输出为空：无法解析 cloud outputs');
  }

  let list = outputs;
  if (isPlainObject(outputs) && Array.isArray(outputs.data)) {
    list = outputs.data;
  }

  if (isPlainObject(list) && !Array.isArray(list)) {
    // Already ASR-shaped (segments/sentences/cues/text/result)
    if (
      list.segments ||
      list.sentences ||
      list.cues ||
      list.result ||
      typeof list.text === 'string'
    ) {
      return list;
    }
    // Single output object
    list = [list];
  }

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('RH ASR 输出为空或格式不支持：需要 outputs 数组或 ASR JSON');
  }

  const texts = [];
  for (const item of list) {
    if (item == null) continue;
    if (typeof item === 'string') {
      const parsed = tryParseJson(item);
      if (parsed != null) return parsed;
      texts.push(item);
      continue;
    }
    if (!isPlainObject(item)) continue;

    if (
      item.segments ||
      item.sentences ||
      item.cues ||
      item.result
    ) {
      return item;
    }

    if (item.text != null) {
      const asString = String(item.text);
      const parsed = tryParseJson(asString);
      if (parsed != null) return parsed;
      if (asString.trim()) texts.push(asString.trim());
    }

    // Some RH payloads put JSON in fileUrl-adjacent fields or raw
    if (typeof item.raw === 'string') {
      const parsed = tryParseJson(item.raw);
      if (parsed != null) return parsed;
    }
    if (typeof item.json === 'string') {
      const parsed = tryParseJson(item.json);
      if (parsed != null) return parsed;
    }
    if (isPlainObject(item.json)) return item.json;
  }

  if (texts.length === 1) return { text: texts[0] };
  if (texts.length > 1) return { text: texts.join('\n') };

  throw new Error('RH ASR 输出无法提取文本/JSON：请检查 fileUrl/text/fileName 字段');
}

function missingKeyError() {
  return new Error(
    '字幕云端 ASR 需要 RUNNINGHUB_API_KEY（API key missing / not configured）。请配置密钥，或改用离线：--cues / --asr（本路径在缺钥时不会调用 RunningHub）。',
  );
}

/**
 * @param {any} statusResult
 */
function normalizeStatus(statusResult) {
  if (statusResult == null) return { status: 'UNKNOWN' };
  if (typeof statusResult === 'string') return { status: statusResult };
  const status = statusResult.status ?? statusResult.data ?? statusResult.taskStatus;
  return {
    status: String(status || 'UNKNOWN'),
    error: statusResult.error || statusResult.msg || statusResult.message,
  };
}

/**
 * Orchestration only — network via injectable deps.
 *
 * @param {{
 *   videoPath: string,
 *   outDir: string,
 *   langs?: string[],
 *   basename?: string,
 *   workflowId?: string,
 *   durationMs?: number,
 *   dryRun?: boolean,
 *   jobId?: string,
 *   apiBase?: string,
 *   maxPolls?: number,
 *   pollIntervalMs?: number,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} input
 * @param {{
 *   getApiKey: () => Promise<string> | string,
 *   uploadFile: (videoPath: string) => Promise<{ fileName: string } | string>,
 *   createTask: (body: any) => Promise<{ taskId: string } | string>,
 *   getStatus: (taskId: string) => Promise<any>,
 *   getOutputs: (taskId: string) => Promise<any>,
 *   readFile?: (filePath: string) => Promise<Buffer | Uint8Array | string> | Buffer | Uint8Array | string,
 *   sleep?: (ms: number) => Promise<void>,
 * }} deps
 */
export async function runSubtitleAsrPipeline(input, deps) {
  if (!input || typeof input !== 'object') {
    throw new Error('runSubtitleAsrPipeline 需要 input 对象');
  }
  if (!deps || typeof deps !== 'object') {
    throw new Error('runSubtitleAsrPipeline 需要 injectable deps');
  }
  for (const name of ['getApiKey', 'uploadFile', 'createTask', 'getStatus', 'getOutputs']) {
    if (typeof deps[name] !== 'function') {
      throw new Error(`runSubtitleAsrPipeline 缺少 deps.${name}`);
    }
  }

  const videoPath = path.resolve(String(input.videoPath || ''));
  const videoBasename = path.basename(videoPath) || 'video.mp4';
  const jobId = input.jobId || randomUUID();
  const config = resolveSubtitleAsrConfig({
    outDir: input.outDir,
    workflowId: input.workflowId,
    apiBase: input.apiBase,
    jobId: undefined, // keep outDir as provided; jobId tracked separately
    env: input.env,
  });
  mkdirSync(config.outDir, { recursive: true });

  const apiKey = String(await deps.getApiKey()).trim();
  if (!apiKey) throw missingKeyError();

  if (input.dryRun) {
    const planPath = path.join(config.outDir, 'asr-job-plan.json');
    const plan = {
      status: 'planned',
      workflowId: config.workflowId,
      apiBase: config.apiBase,
      videoPath,
      videoBasename,
      jobId,
      dryRun: true,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
    return {
      status: 'planned',
      cueCount: 0,
      needsReview: false,
      files: { plan: planPath },
      jobId,
      workflowId: config.workflowId,
    };
  }

  const uploaded = await deps.uploadFile(videoPath);
  const fileName =
    typeof uploaded === 'string'
      ? uploaded
      : String(uploaded?.fileName || '').trim();
  if (!fileName) throw new Error('RH ASR 上传失败：未返回 fileName');

  const submitBody = buildSubtitleAsrSubmitBody({
    workflowId: config.workflowId,
    fileName,
  });
  const created = await deps.createTask(submitBody);
  const taskId =
    typeof created === 'string'
      ? created
      : String(created?.taskId || created?.data?.taskId || '').trim();
  if (!taskId) throw new Error('RH ASR 提交失败：未返回 taskId');

  const maxPolls = Number.isFinite(input.maxPolls) && input.maxPolls > 0 ? Math.floor(input.maxPolls) : 60;
  const pollIntervalMs =
    Number.isFinite(input.pollIntervalMs) && input.pollIntervalMs >= 0
      ? Number(input.pollIntervalMs)
      : 2000;
  const sleep = typeof deps.sleep === 'function'
    ? deps.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let lastStatus = 'UNKNOWN';
  for (let i = 0; i < maxPolls; i += 1) {
    const raw = await deps.getStatus(taskId);
    const { status, error } = normalizeStatus(raw);
    lastStatus = status;
    if (status === 'SUCCESS') break;
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(
        `RH ASR 任务失败（${status}）${error ? ': ' + String(error) : ''}`.trim(),
      );
    }
    if (i < maxPolls - 1 && pollIntervalMs > 0) await sleep(pollIntervalMs);
    if (i === maxPolls - 1 && status !== 'SUCCESS') {
      throw new Error(
        `RH ASR 轮询超时（poll timeout）：${maxPolls} 次后仍为 ${lastStatus}`,
      );
    }
  }

  if (lastStatus !== 'SUCCESS') {
    throw new Error(
      `RH ASR 轮询超时（poll timeout）：${maxPolls} 次后仍为 ${lastStatus}`,
    );
  }

  const outputs = await deps.getOutputs(taskId);
  const rawAsr = extractAsrRawFromCloudOutputs(outputs);
  const parsed = parseRhAsrOutput(
    rawAsr,
    input.durationMs !== undefined ? { durationMs: input.durationMs } : {},
  );

  const langs = Array.isArray(input.langs) && input.langs.length
    ? input.langs
    : ['zh', 'en'];
  const sourceLang = langs[0] || 'zh';
  const targetLang = langs[1] || (sourceLang === 'zh' ? 'en' : 'zh');
  const basename = input.basename || 'subtitles';

  const written = writeBilingualSubtitles(config.outDir, parsed.cues, {
    sourceLang,
    targetLang,
    basename,
  });

  return {
    status: 'written',
    cueCount: parsed.cues.length,
    needsReview: Boolean(parsed.needsReview),
    source: parsed.source,
    files: written,
    taskId,
    jobId,
    workflowId: config.workflowId,
  };
}

/**
 * Real RH transport mirroring vite-plugins/runninghub.ts patterns.
 * Only used when CLI `--watch` is set; nightly verify must not invoke against live RH.
 *
 * @param {{ apiBase?: string, env?: NodeJS.ProcessEnv | Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createSubtitleAsrRhDeps(options = {}) {
  const env = options.env || process.env;
  const apiBase = String(options.apiBase || env.RUNNINGHUB_API_BASE || DEFAULT_SUBTITLE_ASR_API_BASE)
    .trim()
    .replace(/\/$/, '') || DEFAULT_SUBTITLE_ASR_API_BASE;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  async function getApiKey() {
    return String(env.RUNNINGHUB_API_KEY || '').trim();
  }

  async function call(endpoint, body, secret) {
    const response = await fetchImpl(apiBase + endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + secret,
      },
      body: JSON.stringify({ ...body, apiKey: secret }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('RunningHub HTTP ' + response.status);
    return response.json();
  }

  return {
    getApiKey,
    async uploadFile(videoPath) {
      const secret = await getApiKey();
      if (!secret) throw missingKeyError();
      const bytes = readFileSync(videoPath);
      const form = new FormData();
      form.append('apiKey', secret);
      form.append('file', new Blob([bytes]), path.basename(videoPath));
      const response = await fetchImpl(apiBase + '/task/openapi/upload', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(120000),
      });
      const result = await response.json();
      const fileName = result?.data?.fileName;
      if (!response.ok || result?.code !== 0 || !fileName) {
        throw new Error('素材上传失败：' + path.basename(videoPath));
      }
      return { fileName: String(fileName) };
    },
    async createTask(body) {
      const secret = await getApiKey();
      if (!secret) throw missingKeyError();
      const result = await call('/task/openapi/create', body, secret);
      if (result.code !== 0 || !result.data?.taskId) {
        throw new Error('RunningHub 提交失败：' + (result.msg || 'unknown'));
      }
      return { taskId: String(result.data.taskId) };
    },
    async getStatus(taskId) {
      const secret = await getApiKey();
      if (!secret) throw missingKeyError();
      const result = await call('/task/openapi/status', { taskId }, secret);
      if (result.code !== 0) throw new Error('状态查询失败：' + (result.msg || ''));
      // RH returns data as status string
      return { status: result.data, raw: result };
    },
    async getOutputs(taskId) {
      const secret = await getApiKey();
      if (!secret) throw missingKeyError();
      const result = await call('/task/openapi/outputs', { taskId }, secret);
      if (result.code !== 0) throw new Error('输出查询失败：' + (result.msg || ''));
      return result.data;
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
