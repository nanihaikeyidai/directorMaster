/**
 * Browser-safe QC for lipsync trial output frames.
 * Callers inject sampled-frame metadata; no node:, no ffmpeg, no filesystem.
 */

import { assessFaceCloseUpRef } from './mv-face-closeup.mjs';

export const DEFAULT_LIPSYNC_QC_MIN_CLOSEUP_RATIO = 0.6;
export const DEFAULT_LIPSYNC_QC_MIN_FRAMES = 3;

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Assess a generated trial frame. Path close-up/scene hints are ignored —
 * those rules are for reference stills, not output frames.
 *
 * @param {{
 *   path?: string,
 *   width?: number,
 *   height?: number,
 *   faceHeightRatio?: number,
 *   centerSkinFraction?: number,
 *   tSec?: number,
 * }} [frame]
 */
export function assessOutputFrameCloseUp(frame) {
  if (!frame || typeof frame !== 'object') {
    return { ok: false, score: 0, reason: '成片帧元数据缺失。', signals: {} };
  }
  return assessFaceCloseUpRef({
    width: frame.width,
    height: frame.height,
    faceHeightRatio: frame.faceHeightRatio,
    centerSkinFraction: frame.centerSkinFraction,
  });
}

function normalizePurpose(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'instrumental' || value === 'accompaniment' || value === 'none' || value === '无人声' || value === '伴奏') {
    return 'instrumental';
  }
  return 'vocal';
}

function normalizeFrames(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.frames)) return input.frames;
  return [];
}

/**
 * @param {{
 *   frames?: Array<{ tSec?: number, path?: string, width?: number, height?: number, faceHeightRatio?: number, centerSkinFraction?: number }>,
 *   purpose?: string,
 *   minCloseUpRatio?: number,
 *   minFrames?: number,
 * }} [input]
 */
export function planLipsyncQc(input = {}) {
  const purpose = normalizePurpose(input?.purpose);
  const minCloseUpRatio = toNum(input?.minCloseUpRatio) != null && toNum(input.minCloseUpRatio) >= 0 && toNum(input.minCloseUpRatio) <= 1
    ? toNum(input.minCloseUpRatio)
    : DEFAULT_LIPSYNC_QC_MIN_CLOSEUP_RATIO;
  const minFrames = toNum(input?.minFrames) != null && toNum(input.minFrames) > 0
    ? Math.floor(toNum(input.minFrames))
    : DEFAULT_LIPSYNC_QC_MIN_FRAMES;

  const rawFrames = normalizeFrames(input?.frames ?? input);
  const frames = rawFrames.map((frame, index) => {
    const assessment = assessOutputFrameCloseUp(frame);
    const row = {
      index,
      ok: assessment.ok,
      score: assessment.score,
      reason: assessment.reason,
      signals: assessment.signals,
    };
    const tSec = toNum(frame?.tSec);
    if (tSec !== null) row.tSec = tSec;
    if (typeof frame?.path === 'string' && frame.path) row.path = frame.path;
    return row;
  });

  const frameCount = frames.length;
  const closeUpCount = frames.filter((row) => row.ok).length;
  const closeUpRatio = frameCount > 0 ? closeUpCount / frameCount : 0;

  const base = {
    purpose,
    frameCount,
    closeUpCount,
    closeUpRatio,
    minCloseUpRatio,
    minFrames,
    frames,
  };

  if (frameCount < minFrames) {
    return {
      ...base,
      ok: false,
      code: 'MISSING_FRAMES',
      reason: frameCount === 0
        ? `缺少成片抽帧，无法检查近脸覆盖（至少需要 ${minFrames} 帧）。`
        : `成片抽帧不足：只有 ${frameCount} 帧，至少需要 ${minFrames} 帧才能检查近脸覆盖。`,
    };
  }

  if (purpose === 'instrumental') {
    return {
      ...base,
      ok: true,
      reason: `伴奏/无人声段不要求歌手近脸覆盖（当前近脸占比 ${closeUpCount}/${frameCount} = ${closeUpRatio.toFixed(2)}）。`,
    };
  }

  if (closeUpRatio < minCloseUpRatio) {
    return {
      ...base,
      ok: false,
      code: 'LOW_CLOSEUP_COVERAGE',
      reason: `人声试片近脸覆盖不足：${closeUpCount}/${frameCount} 帧为近脸（占比 ${closeUpRatio.toFixed(2)}，门槛 ${minCloseUpRatio}）。中景或脸太小，评不了口型；请加大面部特写后再评。`,
    };
  }

  return {
    ...base,
    ok: true,
    reason: `人声试片近脸覆盖通过：${closeUpCount}/${frameCount} 帧为近脸（占比 ${closeUpRatio.toFixed(2)}，门槛 ${minCloseUpRatio}）。`,
  };
}
