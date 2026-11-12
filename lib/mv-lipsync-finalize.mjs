import path from 'node:path';
import { checkMvCompose } from './mv-compose-validate.mjs';

export const DEFAULT_LIPSYNC_WORKFLOW_ID = '2089048490512052225';

/** @typedef {{ id: string, key: string, name: string, label: string, aliases: string[], isDefault: boolean }} LipsyncWorkflow */

/** @type {LipsyncWorkflow[]} */
export const LIPSYNC_WORKFLOWS = [
  {
    id: DEFAULT_LIPSYNC_WORKFLOW_ID,
    key: 'xunfeng',
    name: '迅风幻影自动版',
    label: '迅风幻影自动版（口型优先）',
    aliases: ['xunfeng', '迅风', '迅风幻影', '迅风幻影自动版'],
    isDefault: true,
  },
  {
    id: '2087128116820013058',
    key: 'pixel-fantasy',
    name: '像素幻想 MiniMaxH3ReferenceToVideo',
    label: '像素幻想（场景更稳）',
    aliases: ['pixel-fantasy', 'pixel', '像素幻想'],
    isDefault: false,
  },
];

function cloneWorkflow(entry) {
  return {
    id: entry.id,
    key: entry.key,
    name: entry.name,
    label: entry.label,
    aliases: [...entry.aliases],
    isDefault: entry.isDefault === true,
  };
}

export function listLipsyncWorkflows() {
  return LIPSYNC_WORKFLOWS.map(cloneWorkflow);
}

function defaultWorkflow() {
  return LIPSYNC_WORKFLOWS.find((item) => item.isDefault) || LIPSYNC_WORKFLOWS[0];
}

/**
 * @param {string} [idOrAlias]
 */
export function resolveLipsyncWorkflow(idOrAlias) {
  const raw = String(idOrAlias ?? '').trim();
  if (!raw) {
    const def = defaultWorkflow();
    return {
      ok: true,
      ...cloneWorkflow(def),
      reason: `未指定工作流，使用默认${def.name}`,
    };
  }
  const lowered = raw.toLowerCase();
  const found = LIPSYNC_WORKFLOWS.find((item) => {
    if (item.id === raw || item.key.toLowerCase() === lowered || item.name === raw || item.label === raw) return true;
    return item.aliases.some((alias) => alias === raw || alias.toLowerCase() === lowered);
  });
  if (found) {
    const reason = found.isDefault
      ? `口型试片默认工作流：${found.name}`
      : `已选择${found.name}`;
    return { ok: true, ...cloneWorkflow(found), reason };
  }
  if (/^\d{10,30}$/.test(raw)) {
    return {
      ok: true,
      id: raw,
      name: '自定义工作流',
      label: '自定义工作流',
      isDefault: false,
      custom: true,
      reason: `使用自定义工作流 ${raw}`,
    };
  }
  const options = LIPSYNC_WORKFLOWS.map((item) => `${item.name}（${item.key} / ${item.id}）`).join('、');
  return {
    ok: false,
    reason: `无法识别口型试片工作流「${raw}」。可选：${options}`,
  };
}

function collectVideoPaths(input) {
  if (Array.isArray(input?.videoPaths)) {
    const paths = input.videoPaths.map((item) => String(item || '').trim()).filter(Boolean);
    if (paths.length) return paths;
  }
  const single = String(input?.videoPath || '').trim();
  return single ? [single] : [];
}

function defaultOutPath(videoPath) {
  const ext = path.extname(videoPath) || '.mp4';
  const stem = ext ? videoPath.slice(0, videoPath.length - ext.length) : videoPath;
  return `${stem}-original-audio${ext}`;
}

function emptyCompose(reason) {
  return {
    ok: false,
    toleranceSec: 0.08,
    issues: [],
    summary: reason,
  };
}

/**
 * @param {{
 *   videoPath?: string,
 *   videoPaths?: string[],
 *   audioPath?: string,
 *   audioSource?: 'original' | 'generated' | 'unknown',
 *   startSec?: number,
 *   endSec?: number,
 *   sourceAudioDuration?: number,
 *   videoDuration?: number,
 *   outPath?: string,
 *   workflowId?: string,
 * }} [input]
 */
export function planLipsyncFinalize(input = {}) {
  const workflow = resolveLipsyncWorkflow(input.workflowId);
  const videoPaths = collectVideoPaths(input);
  const audioPath = String(input.audioPath || '').trim();
  const audioSource = input.audioSource;

  const fail = (reason, compose) => ({
    ok: false,
    reason,
    workflow,
    compose: compose || emptyCompose(reason),
    mux: null,
  });

  if (!videoPaths.length) return fail('缺少试片成片视频，无法封装原曲。');
  if (!audioPath) return fail('缺少原曲音轨，无法封装。请提供原始音乐后再封装。');
  if (audioSource === 'generated') {
    return fail('不能把生成音轨当作母带。请用原曲封装成片，不要保留生成音轨。');
  }

  const startSec = Number(input.startSec);
  const endSec = Number(input.endSec);
  const hasRange = Number.isFinite(startSec) && Number.isFinite(endSec);
  const videoDuration = Number(input.videoDuration);
  const hasVideoDuration = Number.isFinite(videoDuration);

  const segments = videoPaths.map((videoPath, index) => {
    const segment = { index: index + 1, videoPath };
    if (videoPaths.length === 1) {
      if (Number.isFinite(startSec)) segment.startSec = startSec;
      if (Number.isFinite(endSec)) segment.endSec = endSec;
      if (hasVideoDuration) segment.videoDuration = videoDuration;
      else if (hasRange) segment.videoDuration = endSec - startSec;
    }
    return segment;
  });

  const composeInput = {
    segments,
    sourceAudioPath: audioPath,
    audioSource: audioSource === 'unknown' ? 'unknown' : 'original',
  };
  if (Number.isFinite(Number(input.sourceAudioDuration))) {
    composeInput.sourceAudioDuration = Number(input.sourceAudioDuration);
  }

  const compose = checkMvCompose(composeInput, {
    requireOriginalAudio: true,
    requireVideo: true,
  });

  if (!workflow.ok) return fail(workflow.reason, compose);
  if (!compose.ok) return fail(compose.summary || '合成校验未通过，暂不封装原曲。', compose);

  const mux = {
    videoPaths,
    audioPath,
    outPath: String(input.outPath || '').trim() || defaultOutPath(videoPaths[0]),
    audioSource: 'original',
  };
  if (Number.isFinite(startSec)) mux.startSec = startSec;
  if (Number.isFinite(endSec)) mux.endSec = endSec;

  return {
    ok: true,
    reason: `可以封装原曲：工作流为${workflow.name}，合成校验通过。`,
    workflow,
    compose,
    mux,
  };
}
