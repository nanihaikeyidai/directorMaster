// RunningHub hardening helpers (Sprint 2). Pure functions: no network, no secrets returned.
import path from 'node:path';

/** Workflow kinds whose adapters only consume one segment per cloud task. */
export const SINGLE_SEGMENT_KINDS = new Set(['mv-reference', 'feihou-remix']);

function guardError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

/**
 * Reject requests that would silently drop segments. Director workflows take a
 * whole timeline; reference / remix workflows must be submitted one segment per job.
 */
export function assertSegmentCountForKind(kind, count) {
  const n = Number(count) || 0;
  if (n < 1) throw guardError('RH_NO_SEGMENTS', '请选择至少 1 个片段');
  if (SINGLE_SEGMENT_KINDS.has(kind) && n > 1) {
    throw guardError(
      'RH_MULTI_SEGMENT_UNSUPPORTED',
      `工作流「${kind}」一次只支持单段，但收到 ${n} 段；请逐段提交（前端队列会按段串行），不会再静默只取第 1 段。`,
    );
  }
}

/** Project root: DIRECTOR_MASTER_ROOT, else the working directory of the dev server. */
export function resolveDirectorRoot(env = {}, cwd = process.cwd()) {
  const fromEnv = String(env.DIRECTOR_MASTER_ROOT || '').trim();
  return path.resolve(fromEnv || cwd);
}

/** Describe where the key would come from, without ever reading or returning it. */
export function resolveRunningHubKeySource(env = {}, platform = process.platform) {
  if (String(env.RUNNINGHUB_API_KEY || '').trim()) return { type: 'env', name: 'RUNNINGHUB_API_KEY' };
  if (platform === 'win32') {
    const explicit = String(env.RUNNINGHUB_DPAPI_FILE || '').trim();
    const home = String(env.USERPROFILE || '').trim();
    if (explicit) return { type: 'dpapi', file: explicit };
    if (home) return { type: 'dpapi', file: path.win32.join(home, '.codex', 'secrets', 'runninghub-api-key.dpapi') };
  }
  return { type: 'missing', message: '未配置 RunningHub 密钥：请设置环境变量 RUNNINGHUB_API_KEY（Windows 也可用 RUNNINGHUB_DPAPI_FILE 指向 DPAPI 文件）。' };
}

export function redactSecret(text, secret) {
  const value = text == null ? '' : String(text);
  const s = String(secret || '');
  return s ? value.split(s).join('***') : value;
}

const TERMINAL = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);

/** Safe, log-friendly job summary for task observability. */
export function summarizeCloudJob(job = {}, { secret = '' } = {}) {
  const start = Date.parse(job.createdAt), end = Date.parse(job.updatedAt);
  const elapsedSec = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : null;
  const summary = {
    id: job.id,
    status: job.status,
    stage: job.stage,
    workflowKind: job.workflowKind,
    taskId: job.taskId,
    segmentCount: job.segmentCount,
    elapsedSec,
    error: job.error ? redactSecret(job.error, secret) : undefined,
    terminal: TERMINAL.has(job.status),
  };
  return Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined));
}

/** True when the workflow kind only accepts one segment per cloud task. */
export function isSingleSegmentKind(kind) {
  return SINGLE_SEGMENT_KINDS.has(kind);
}

/**
 * Listing-friendly kind inference (same class priority as detectRunningHubWorkflowKind).
 * Returns null instead of throwing when no supported MiniMax H3 node is present.
 */
export function inferWorkflowKindFromNodes(workflow) {
  const classes = new Set();
  if (workflow && typeof workflow === 'object') {
    if (Array.isArray(workflow.nodes)) {
      for (const node of workflow.nodes) {
        if (!node || typeof node !== 'object') continue;
        const classType = node.class_type || node.type;
        if (classType) classes.add(String(classType));
      }
    }
    for (const value of Object.values(workflow)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (value.class_type) classes.add(String(value.class_type));
    }
  }
  if (classes.has('FeiHouEasyH3RH')) return 'feihou-remix';
  if (classes.has('MiniMaxH3ReferenceToVideo')) return 'mv-reference';
  if (classes.has('MiniMaxH3Director')) return 'director';
  return null;
}

/**
 * Attach kind / singleSegment (and optional kindError) onto a workflow listing entry.
 */
export function annotateWorkflowListing(entry, workflow) {
  const kind = inferWorkflowKindFromNodes(workflow);
  const singleSegment = isSingleSegmentKind(kind);
  const annotated = { ...entry, kind, singleSegment };
  const parseable = workflow && typeof workflow === 'object';
  if (kind == null && parseable) {
    annotated.kindError = '未能识别受支持的 MiniMax H3 工作流节点';
  }
  return annotated;
}

/** API-layer helper: shallow-copy job and attach summarizeCloudJob summary. */
export function attachJobSummary(job, { secret = '' } = {}) {
  return { ...job, summary: summarizeCloudJob(job, { secret }) };
}
