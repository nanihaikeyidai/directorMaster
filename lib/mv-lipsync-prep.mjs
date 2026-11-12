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

const DEFAULT_RMS_FLOOR = -35;
const DEFAULT_MID_FLOOR = -45;
const DEFAULT_MID_MINUS_BASS_MIN = -3;
const DEFAULT_TARGET_DURATION_SEC = 15;
const DEFAULT_MIN_DURATION_SEC = 10;
const DEFAULT_MIN_VOCAL_ACTIVE_RATIO = 0.35;
const DEFAULT_HOP_SEC = 0.25;
const CLOSEUP_PATH_RE = /(ref-crop|still-b|close-?up|face-?front|bust|胸像|近脸)/i;
const SCENE_PATH_RE = /(scene|场景|wide|远景|establishing)/i;

/**
 * @param {import('./mv-lipsync-prep.d.ts').EnergyHop} hop
 * @param {{ rmsFloor?: number, midFloor?: number, midMinusBassMin?: number }} [opts]
 */
export function isVocalActiveHop(hop, opts = {}) {
  const rmsFloor = Number.isFinite(opts.rmsFloor) ? opts.rmsFloor : DEFAULT_RMS_FLOOR;
  const midFloor = Number.isFinite(opts.midFloor) ? opts.midFloor : DEFAULT_MID_FLOOR;
  const midMinusBassMin = Number.isFinite(opts.midMinusBassMin)
    ? opts.midMinusBassMin
    : DEFAULT_MID_MINUS_BASS_MIN;
  if (!hop || typeof hop !== 'object') return false;
  const { rmsDb, midDb, bassDb } = hop;
  if (![rmsDb, midDb, bassDb].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return false;
  }
  return rmsDb > rmsFloor && midDb > midFloor && midDb - bassDb >= midMinusBassMin;
}

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
export function assessFaceCloseUpRef(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, score: 0, reason: '人物参考元数据缺失。', signals: {} };
  }
  const width = Number(input.width);
  const height = Number(input.height);
  const pathName = typeof input.path === 'string' ? input.path : '';
  const centerSkinFraction =
    typeof input.centerSkinFraction === 'number' && Number.isFinite(input.centerSkinFraction)
      ? input.centerSkinFraction
      : undefined;
  const faceHeightRatio =
    typeof input.faceHeightRatio === 'number' && Number.isFinite(input.faceHeightRatio)
      ? input.faceHeightRatio
      : undefined;

  if (!(width > 0 && height > 0)) {
    return { ok: false, score: 0, reason: '人物参考宽高无效，无法判断是否近脸。', signals: { width, height } };
  }

  const signals = {
    path: pathName,
    width,
    height,
    portrait: height >= width,
    centerSkinFraction: centerSkinFraction ?? null,
    faceHeightRatio: faceHeightRatio ?? null,
    pathCloseUpHint: CLOSEUP_PATH_RE.test(pathName),
    pathSceneHint: SCENE_PATH_RE.test(pathName),
  };

  if (faceHeightRatio != null && faceHeightRatio >= 0.25) {
    return {
      ok: true,
      score: Math.min(1, faceHeightRatio),
      reason: '人脸框高度占比足够，可作为口型近脸参考。',
      signals,
    };
  }

  if (signals.pathCloseUpHint) {
    return {
      ok: true,
      score: 0.85,
      reason: '路径提示为近脸/胸像裁剪，接受为口型人物参考。',
      signals,
    };
  }

  if (signals.pathSceneHint) {
    return {
      ok: false,
      score: 0.1,
      reason: '人物参考路径像场景/远景，不适合评口型；请换近脸特写。',
      signals,
    };
  }

  const skinOk = centerSkinFraction != null && centerSkinFraction >= 0.18;
  if (signals.portrait && skinOk) {
    return {
      ok: true,
      score: Math.min(1, 0.5 + centerSkinFraction),
      reason: '竖幅人像且中心肤色占比足够，接受为近脸参考。',
      signals,
    };
  }

  return {
    ok: false,
    score: 0.15,
    reason: '人物参考不像近脸特写（缺人脸框/近脸路径/足够中心肤色），换 still-B 或 ref-crop 再评口型。',
    signals,
  };
}

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

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 FFT. */
function fftRadix2(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
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
    const sr = 16000;
    const hop = Math.max(1, Math.round(hopSec * sr));
    const nfft = nextPow2(hop);
    const hops = [];
    for (let i = 0; i + hop <= samples.length; i += hop) {
      const re = new Float64Array(nfft);
      const im = new Float64Array(nfft);
      let sumSq = 0;
      for (let n = 0; n < hop; n++) {
        const x = samples[i + n] / 32768;
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (hop - 1 || 1));
        re[n] = x * w;
        sumSq += x * x;
      }
      fftRadix2(re, im);
      const half = nfft >> 1;
      let mid = 0;
      let bass = 0;
      let midN = 0;
      let bassN = 0;
      for (let k = 0; k <= half; k++) {
        const f = (k * sr) / nfft;
        const mag2 = re[k] * re[k] + im[k] * im[k];
        if (f >= 300 && f <= 3400) {
          mid += mag2;
          midN++;
        } else if (f >= 40 && f <= 200) {
          bass += mag2;
          bassN++;
        }
      }
      const rms = Math.sqrt(sumSq / hop) + 1e-12;
      const midMean = mid / Math.max(1, midN) + 1e-20;
      const bassMean = bass / Math.max(1, bassN) + 1e-20;
      hops.push({
        t: i / sr,
        rmsDb: 20 * Math.log10(rms),
        midDb: 10 * Math.log10(midMean),
        bassDb: 10 * Math.log10(bassMean),
      });
    }
    return hops;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
