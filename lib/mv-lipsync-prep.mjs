/**
 * Pure lipsync-trial prep gates: vocal-band activity + face close-up.
 * Callers inject energy hops / image meta; optional ffmpeg probe for CLI.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyCharacterPackToAssets } from './mv-character-consistency.mjs';
import { resolveLipsyncWorkflow } from './mv-lipsync-finalize.mjs';
import { computeEnergyHops, isVocalActiveHop } from './mv-energy-hops.mjs';
import { assessFaceCloseUpRef } from './mv-face-closeup.mjs';
export { assessFaceCloseUpRef };

const DEFAULT_TARGET_DURATION_SEC = 15;
const DEFAULT_MIN_DURATION_SEC = 10;
const DEFAULT_MIN_VOCAL_ACTIVE_RATIO = 0.35;
const DEFAULT_HOP_SEC = 0.25;

export { isVocalActiveHop };

/**
 * @param {import('./mv-lipsync-prep.d.ts').EnergyHop[]} hops
 * @param {{
 *   targetDurationSec?: number,
 *   minDurationSec?: number,
 *   minVocalActiveRatio?: number,
 *   hopSec?: number,
 * }} [opts]
 */
export function selectVocalSegment(hops, opts = {}) {
  const targetDurationSec =
    Number.isFinite(opts.targetDurationSec) && opts.targetDurationSec > 0
      ? opts.targetDurationSec
      : DEFAULT_TARGET_DURATION_SEC;
  const minDurationSec =
    Number.isFinite(opts.minDurationSec) && opts.minDurationSec > 0
      ? opts.minDurationSec
      : DEFAULT_MIN_DURATION_SEC;
  const minVocalActiveRatio =
    Number.isFinite(opts.minVocalActiveRatio) && opts.minVocalActiveRatio >= 0
      ? opts.minVocalActiveRatio
      : DEFAULT_MIN_VOCAL_ACTIVE_RATIO;
  let hopSec =
    Number.isFinite(opts.hopSec) && opts.hopSec > 0 ? opts.hopSec : DEFAULT_HOP_SEC;
  if (
    (!Number.isFinite(opts.hopSec) || opts.hopSec <= 0) &&
    Array.isArray(hops) &&
    hops.length >= 2 &&
    Number.isFinite(hops[1].t) &&
    Number.isFinite(hops[0].t) &&
    hops[1].t > hops[0].t
  ) {
    hopSec = hops[1].t - hops[0].t;
  }

  if (!Array.isArray(hops) || hops.length === 0) {
    return {
      ok: false,
      reason: '无人声能量曲线：音频 hops 为空，无法选取口型试片段。',
    };
  }

  const flags = hops.map((h) => isVocalActiveHop(h));
  const targetHops = Math.max(1, Math.round(targetDurationSec / hopSec));
  const minHops = Math.max(1, Math.round(minDurationSec / hopSec));

  /** @type {{ ratio: number, startIdx: number, endIdx: number, durationSec: number } | null} */
  let best = null;

  const consider = (windowHops) => {
    for (let startIdx = 0; startIdx + windowHops <= hops.length; startIdx++) {
      const endIdx = startIdx + windowHops;
      let active = 0;
      for (let i = startIdx; i < endIdx; i++) if (flags[i]) active++;
      const ratio = active / windowHops;
      const durationSec = windowHops * hopSec;
      if (
        !best ||
        ratio > best.ratio + 1e-9 ||
        (Math.abs(ratio - best.ratio) < 1e-9 && durationSec > best.durationSec)
      ) {
        best = { ratio, startIdx, endIdx, durationSec };
      }
    }
  };

  consider(Math.min(targetHops, hops.length));
  if (minHops < targetHops) consider(Math.min(minHops, hops.length));
  if (hops.length < targetHops && hops.length >= minHops) consider(hops.length);

  if (!best || best.ratio < minVocalActiveRatio || best.durationSec + 1e-9 < minDurationSec) {
    const ratioText = best ? best.ratio.toFixed(3) : '0';
    return {
      ok: false,
      vocalActiveRatio: best ? best.ratio : 0,
      reason: `未找到可靠人声段（器乐/低人声主导）：最高人声活跃比 ${ratioText}，低于门槛 ${minVocalActiveRatio}。禁止用间奏或纯器乐评口型。`,
    };
  }

  const startSec = hops[best.startIdx].t;
  const last = hops[best.endIdx - 1];
  const endSec = Number.isFinite(last?.t) ? last.t + hopSec : startSec + best.durationSec;
  return {
    ok: true,
    startSec,
    endSec,
    durationSec: endSec - startSec,
    vocalActiveRatio: best.ratio,
    confidence: Math.min(1, best.ratio),
    reason: `已选人声活跃窗口 ${startSec.toFixed(2)}–${endSec.toFixed(2)}s（活跃比 ${best.ratio.toFixed(3)}）。`,
  };
}

/**
 * @param {{
 *   path?: string,
 *   width: number,
 *   height: number,
 *   centerSkinFraction?: number,
 *   faceHeightRatio?: number,
 * }} input
 */
/**
 * @param {unknown} raw
 * @returns {{ path?: string, width?: number, height?: number, faceBox?: object, centerSkinFraction?: number, faceHeightRatio?: number } | null}
 */
function normalizeTrialRef(raw) {
  if (typeof raw === 'string') return { path: raw };
  if (!raw || typeof raw !== 'object') return null;
  const pathName = typeof raw.path === 'string' ? raw.path : '';
  if (!pathName) return null;
  const out = { path: pathName };
  if (typeof raw.role === 'string' && raw.role) out.role = raw.role;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (Number.isFinite(width) && width > 0) out.width = width;
  if (Number.isFinite(height) && height > 0) out.height = height;
  if (raw.faceBox && typeof raw.faceBox === 'object') out.faceBox = raw.faceBox;
  if (typeof raw.centerSkinFraction === 'number' && Number.isFinite(raw.centerSkinFraction)) {
    out.centerSkinFraction = raw.centerSkinFraction;
  }
  if (typeof raw.faceHeightRatio === 'number' && Number.isFinite(raw.faceHeightRatio)) {
    out.faceHeightRatio = raw.faceHeightRatio;
  }
  return out;
}

/**
 * @param {{ path?: string, width?: number, height?: number, faceBox?: object, faceHeightRatio?: number, centerSkinFraction?: number }} face
 */
function personInputFromFace(face) {
  const person = { path: face?.path || '' };
  if (face?.width) person.width = face.width;
  if (face?.height) person.height = face.height;
  if (typeof face?.centerSkinFraction === 'number') person.centerSkinFraction = face.centerSkinFraction;
  if (typeof face?.faceHeightRatio === 'number') person.faceHeightRatio = face.faceHeightRatio;
  else if (face?.faceBox) {
    const height = Number(face.height);
    const box = face.faceBox;
    if (height > 0 && box) {
      if (typeof box.height === 'number' && Number.isFinite(box.height)) {
        person.faceHeightRatio = box.height / height;
      } else if (typeof box.top === 'number' && typeof box.bottom === 'number') {
        person.faceHeightRatio = (box.bottom - box.top) / height;
      }
    }
  }
  // Path-heuristic close-ups (still-B / ref-crop) can pass without probed size.
  if (!(Number(person.width) > 0 && Number(person.height) > 0)) {
    person.width = 768;
    person.height = 1200;
  }
  return person;
}

/**
 * @param {{
 *   hops: import('./mv-lipsync-prep.d.ts').EnergyHop[],
 *   person?: Parameters<typeof assessFaceCloseUpRef>[0],
 *   refs?: Array<string | { path?: string, role?: string, width?: number, height?: number, faceBox?: object }>,
 *   targetDurationSec?: number,
 *   minDurationSec?: number,
 *   minVocalActiveRatio?: number,
 *   hopSec?: number,
 *   workflowId?: string,
 * }} input
 */
export function buildLipsyncTrialPlan(input) {
  const workflow = resolveLipsyncWorkflow(input?.workflowId);
  const workflowId = workflow.ok ? workflow.id : (String(input?.workflowId || '').trim() || undefined);
  const withWorkflow = (result) => {
    if (!workflow.ok) {
      return { ...result, ok: false, workflowId, workflow, reason: workflow.reason };
    }
    return { ...result, workflowId, workflow };
  };
  const audioOpts = {
    targetDurationSec: input?.targetDurationSec,
    minDurationSec: input?.minDurationSec,
    minVocalActiveRatio: input?.minVocalActiveRatio,
    hopSec: input?.hopSec,
  };

  /** @type {Record<string, unknown>} */
  let packFields = {};
  let personInput = input?.person || {};

  if (Array.isArray(input?.refs) && input.refs.length) {
    const refs = [];
    const seen = new Set();
    const push = (raw) => {
      const asset = normalizeTrialRef(raw);
      if (!asset) return;
      const key = String(asset.path).replace(/\\/g, '/');
      if (!key || seen.has(key)) return;
      seen.add(key);
      refs.push(asset);
    };
    if (input.person?.path) push(input.person);
    for (const raw of input.refs) push(raw);

    const applied = applyCharacterPackToAssets(refs);
    if (!applied.ok) {
      const audio = selectVocalSegment(input?.hops || [], audioOpts);
      const person = assessFaceCloseUpRef(input.person || applied.assets[0] || {});
      return withWorkflow({
        ok: false,
        audio,
        person,
        workflowId,
        reason: applied.reason,
        characterPack: applied.packResult,
      });
    }

    const primaryFace = applied.packResult.pack.primaryFace || {};
    const samePerson =
      input.person?.path &&
      String(input.person.path).replace(/\\/g, '/') === String(primaryFace.path || '').replace(/\\/g, '/');
    personInput = personInputFromFace({
      ...primaryFace,
      ...(samePerson ? input.person : {}),
      path: primaryFace.path,
    });
    packFields = {
      characterPack: applied.packResult,
      identityLockText: applied.packResult.pack.identityLockText || '',
      orderedRefs: applied.packResult.pack.orderedRefs || [],
    };
  }

  const audio = selectVocalSegment(input?.hops || [], audioOpts);
  const person = assessFaceCloseUpRef(personInput || {});

  if (!audio.ok && !person.ok) {
    return withWorkflow({
      ok: false,
      audio,
      person,
      workflowId,
      reason: `口型试片门禁未通过：${audio.reason}；且${person.reason}`,
      ...packFields,
    });
  }
  if (!audio.ok) {
    return withWorkflow({ ok: false, audio, person, workflowId, reason: audio.reason, ...packFields });
  }
  if (!person.ok) {
    return withWorkflow({ ok: false, audio, person, workflowId, reason: person.reason, ...packFields });
  }
  return withWorkflow({
    ok: true,
    audio,
    person,
    workflowId,
    reason: `试片计划可用：${audio.reason} ${person.reason}`,
    ...packFields,
  });
}

/**
 * Decode audio with ffmpeg and build EnergyHop[] (mono 16 kHz).
 * @param {string} audioPath
 * @param {{ hopSec?: number }} [opts]
 * @returns {import('./mv-lipsync-prep.d.ts').EnergyHop[]}
 */
export function probeEnergyHops(audioPath, opts = {}) {
  const hopSec = Number.isFinite(opts.hopSec) && opts.hopSec > 0 ? opts.hopSec : DEFAULT_HOP_SEC;
  if (!audioPath || !existsSync(audioPath)) {
    throw new Error('音频不存在：' + audioPath);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'mv-lipsync-'));
  const wavPath = path.join(dir, 'probe.wav');
  try {
    execFileSync('ffmpeg', ['-y', '-i', audioPath, '-ac', '1', '-ar', '16000', wavPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const buf = readFileSync(wavPath);
    let dataOffset = 12;
    let dataSize = 0;
    while (dataOffset + 8 <= buf.length) {
      const id = buf.toString('ascii', dataOffset, dataOffset + 4);
      const size = buf.readUInt32LE(dataOffset + 4);
      if (id === 'data') {
        dataOffset += 8;
        dataSize = size;
        break;
      }
      dataOffset += 8 + size + (size % 2);
    }
    if (!dataSize) throw new Error('WAV data chunk missing');
    const sampleBytes = buf.subarray(dataOffset, dataOffset + dataSize);
    const samples = new Int16Array(
      sampleBytes.buffer,
      sampleBytes.byteOffset,
      Math.floor(sampleBytes.byteLength / 2),
    );
    return computeEnergyHops(samples, { sampleRate: 16000, hopSec, scale: 1 / 32768 });
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
