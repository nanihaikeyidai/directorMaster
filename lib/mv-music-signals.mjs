/**
 * Pure music-signal extraction from energy hops, for recommendMvPromptTemplate.
 * Callers inject hops; optional ffmpeg/ffprobe probe for CLI --audio.
 */

import { execFileSync } from 'node:child_process';
import { isVocalActiveHop, probeEnergyHops } from './mv-lipsync-prep.mjs';

const SIGNAL_KEYS = ['bpm', 'vocalDensity', 'energy', 'instruments', 'performers', 'hints'];
const BPM_MIN = 60;
const BPM_MAX = 180;
const BPM_MIN_HOPS = 24;
const BPM_MIN_RMS_STD = 1.5;
const BPM_MIN_AUTOCORR = 0.45;

/**
 * @param {unknown} extras
 * @returns {import('./mv-prompt.d.ts').MvRecommendSignals}
 */
function pickDefinedSignals(extras) {
  /** @type {import('./mv-prompt.d.ts').MvRecommendSignals} */
  const out = {};
  if (!extras || typeof extras !== 'object') return out;
  for (const key of SIGNAL_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (extras)[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/**
 * @param {import('./mv-lipsync-prep.d.ts').EnergyHop[] | null | undefined} hops
 */
function hopSecOf(hops) {
  if (
    Array.isArray(hops) &&
    hops.length >= 2 &&
    Number.isFinite(hops[1].t) &&
    Number.isFinite(hops[0].t) &&
    hops[1].t > hops[0].t
  ) {
    return hops[1].t - hops[0].t;
  }
  return 0.25;
}

/**
 * @param {number} meanRmsDb
 * @returns {'low' | 'medium' | 'high' | undefined}
 */
function mapEnergyFromMeanRmsDb(meanRmsDb) {
  if (!Number.isFinite(meanRmsDb)) return undefined;
  if (meanRmsDb < -28) return 'low';
  if (meanRmsDb < -18) return 'medium';
  return 'high';
}

/**
 * @param {number} ratio
 * @returns {'sparse' | 'medium' | 'dense' | undefined}
 */
function mapVocalDensityFromRatio(ratio) {
  if (!Number.isFinite(ratio)) return undefined;
  if (ratio < 0.25) return 'sparse';
  if (ratio < 0.5) return 'medium';
  return 'dense';
}

/**
 * Conservative BPM from RMS autocorrelation. Omit rather than guess.
 * @param {import('./mv-lipsync-prep.d.ts').EnergyHop[]} hops
 * @returns {{ bpm: number, bpmConfidence: number } | null}
 */
function estimateBpmFromHops(hops) {
  if (!Array.isArray(hops) || hops.length < BPM_MIN_HOPS) return null;
  const rms = hops.map((h) => (h && Number.isFinite(h.rmsDb) ? h.rmsDb : NaN));
  if (rms.some((v) => !Number.isFinite(v))) return null;

  const n = rms.length;
  const mean = rms.reduce((a, b) => a + b, 0) / n;
  const variance = rms.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std < BPM_MIN_RMS_STD) return null;

  const hopSec = hopSecOf(hops);
  if (!(hopSec > 0)) return null;
  const minLag = Math.max(1, Math.round(60 / BPM_MAX / hopSec));
  const maxLag = Math.min(Math.floor(n / 3), Math.round(60 / BPM_MIN / hopSec));
  if (maxLag < minLag) return null;

  const x = rms.map((v) => v - mean);
  const corrAt = (lag) => {
    let dot = 0;
    let e0 = 0;
    let e1 = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) {
      const a = x[i];
      const b = x[i + lag];
      dot += a * b;
      e0 += a * a;
      e1 += b * b;
    }
    const denom = Math.sqrt(e0 * e1);
    return denom > 1e-12 ? dot / denom : 0;
  };

  /** @type {{ lag: number, corr: number }[]} */
  const scores = [];
  let maxCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const corr = corrAt(lag);
    scores.push({ lag, corr });
    if (corr > maxCorr) maxCorr = corr;
  }
  if (maxCorr < BPM_MIN_AUTOCORR) return null;

  // Prefer the fastest (smallest lag) near-peak so 120 BPM wins over its 60 BPM octave.
  const near = scores.filter((s) => s.corr >= maxCorr * 0.9);
  near.sort((a, b) => a.lag - b.lag || b.corr - a.corr);
  const best = near[0];
  if (!best) return null;

  const bpm = 60 / (best.lag * hopSec);
  if (!(bpm >= BPM_MIN && bpm <= BPM_MAX)) return null;

  // Cross-check: peak intervals should agree, otherwise omit rather than guess.
  const peakTimes = [];
  for (let i = 1; i < n - 1; i++) {
    if (rms[i] > rms[i - 1] && rms[i] >= rms[i + 1] && rms[i] > mean) {
      const t = Number.isFinite(hops[i].t) ? hops[i].t : i * hopSec;
      peakTimes.push(t);
    }
  }
  if (peakTimes.length >= 4) {
    const intervals = [];
    for (let i = 1; i < peakTimes.length; i++) {
      const iv = peakTimes[i] - peakTimes[i - 1];
      if (iv >= 60 / BPM_MAX && iv <= 60 / BPM_MIN) intervals.push(iv);
    }
    if (intervals.length < 3) return null;
    const meanIv = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdIv = Math.sqrt(intervals.reduce((a, b) => a + (b - meanIv) ** 2, 0) / intervals.length);
    const cv = meanIv > 0 ? stdIv / meanIv : 1;
    if (cv > 0.22) return null;
    const peakBpm = 60 / meanIv;
    if (Math.abs(peakBpm - bpm) / bpm > 0.2) return null;
  } else if (best.corr < 0.7) {
    return null;
  }

  return {
    bpm: Math.round(bpm),
    bpmConfidence: Math.round(Math.min(1, Math.max(0, best.corr)) * 1000) / 1000,
  };
}

/**
 * @param {import('./mv-lipsync-prep.d.ts').EnergyHop[] | null | undefined} hops
 * @param {import('./mv-prompt.d.ts').MvRecommendSignals} [extras]
 */
export function extractMusicSignalsFromHops(hops, extras = {}) {
  const definedExtras = pickDefinedSignals(extras);
  const list = Array.isArray(hops) ? hops : [];
  /** @type {string[]} */
  const reasons = [];

  if (list.length === 0) {
    reasons.push('信号不足：音频 hops 为空，无法推断 energy/vocalDensity/bpm。');
    return {
      signals: { ...definedExtras },
      derived: { vocalActiveRatio: 0 },
      reasons,
    };
  }

  let active = 0;
  const rmsValues = [];
  for (const hop of list) {
    if (isVocalActiveHop(hop)) active += 1;
    if (hop && Number.isFinite(hop.rmsDb)) rmsValues.push(hop.rmsDb);
  }
  const vocalActiveRatio = active / list.length;
  const meanRmsDb =
    rmsValues.length > 0
      ? Math.round((rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length) * 1000) / 1000
      : null;

  /** @type {import('./mv-prompt.d.ts').MvRecommendSignals} */
  const extracted = {};
  const energy = meanRmsDb == null ? undefined : mapEnergyFromMeanRmsDb(meanRmsDb);
  const vocalDensity = mapVocalDensityFromRatio(vocalActiveRatio);
  if (energy) {
    extracted.energy = energy;
    reasons.push(
      `从能量 hops 推得 energy=${energy}（平均 rms ${meanRmsDb.toFixed(1)} dB）`,
    );
  }
  if (vocalDensity) {
    extracted.vocalDensity = vocalDensity;
    reasons.push(
      `从人声活跃比 ${vocalActiveRatio.toFixed(2)} 推得 vocalDensity=${vocalDensity}`,
    );
  }

  /** @type {{ vocalActiveRatio: number, meanRmsDb?: number, bpm?: number, bpmConfidence?: number }} */
  const derived = { vocalActiveRatio };
  if (meanRmsDb != null) derived.meanRmsDb = meanRmsDb;

  const bpmEst = estimateBpmFromHops(list);
  if (bpmEst) {
    extracted.bpm = bpmEst.bpm;
    derived.bpm = bpmEst.bpm;
    derived.bpmConfidence = bpmEst.bpmConfidence;
    reasons.push(
      `从 hops 峰值间隔估得 bpm=${bpmEst.bpm}（置信度 ${bpmEst.bpmConfidence.toFixed(2)}）`,
    );
  } else {
    reasons.push('bpm 未给出：峰值间隔方差过高或 hops 过短/过平。');
  }

  return {
    signals: { ...extracted, ...definedExtras },
    derived,
    reasons,
  };
}

/**
 * Thin IO: probeEnergyHops then extractMusicSignalsFromHops.
 * @param {string} audioPath
 * @param {import('./mv-prompt.d.ts').MvRecommendSignals} [extras]
 */
export function probeMusicSignals(audioPath, extras = {}) {
  const hops = probeEnergyHops(audioPath);
  const result = extractMusicSignalsFromHops(hops, extras);
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath],
      { encoding: 'utf8' },
    ).trim();
    const durationSec = Number(out);
    if (Number.isFinite(durationSec) && durationSec > 0) {
      result.derived.durationSec = durationSec;
    }
  } catch {
    /* optional metadata only */
  }
  return result;
}
