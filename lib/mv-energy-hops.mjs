/**
 * Browser-safe energy hops + vocal-band classifier.
 * Shared by CLI (ffmpeg-decoded 16 kHz PCM) and the MV page (Web Audio buffer).
 * No node: imports — safe to bundle into app/mv/page.tsx.
 */

export const ENERGY_HOP_SAMPLE_RATE = 16000;
export const DEFAULT_ENERGY_HOP_SEC = 0.25;
const DEFAULT_RMS_FLOOR = -35;
const DEFAULT_MID_FLOOR = -45;
const DEFAULT_MID_MINUS_BASS_MIN = -3;

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
 * Box-filter + linear-interpolation resample to 16 kHz so band thresholds
 * (tuned on ffmpeg 16 kHz mono) stay comparable for 44.1/48 kHz buffers.
 */
function resampleTo16k(samples, fromRate, scale) {
  const ratio = fromRate / ENERGY_HOP_SAMPLE_RATE;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float64Array(outLen);
  const half = Math.max(0, Math.floor(ratio / 2));
  for (let i = 0; i < outLen; i++) {
    const center = i * ratio;
    const lo = Math.max(0, Math.floor(center) - half);
    const hi = Math.min(samples.length - 1, Math.floor(center) + half);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += samples[k];
    out[i] = (sum / (hi - lo + 1)) * scale;
  }
  return out;
}

/**
 * Build EnergyHop[] from mono PCM.
 * @param {ArrayLike<number> | null | undefined} samples
 * @param {{ sampleRate?: number, hopSec?: number, scale?: number }} [opts]
 * @returns {import('./mv-lipsync-prep.d.ts').EnergyHop[]}
 */
export function computeEnergyHops(samples, opts = {}) {
  if (!samples || typeof samples.length !== 'number' || samples.length === 0) return [];
  const hopSec =
    Number.isFinite(opts.hopSec) && opts.hopSec > 0 ? opts.hopSec : DEFAULT_ENERGY_HOP_SEC;
  const inRate =
    Number.isFinite(opts.sampleRate) && opts.sampleRate > 0
      ? opts.sampleRate
      : ENERGY_HOP_SAMPLE_RATE;
  const inScale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  let pcm = samples;
  let scale = inScale;
  if (Math.abs(inRate - ENERGY_HOP_SAMPLE_RATE) > 0.5) {
    pcm = resampleTo16k(samples, inRate, inScale);
    scale = 1;
  }
  const sr = ENERGY_HOP_SAMPLE_RATE;
  const hop = Math.max(1, Math.round(hopSec * sr));
  const nfft = nextPow2(hop);
  const hops = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    let sumSq = 0;
    for (let n = 0; n < hop; n++) {
      const x = pcm[i + n] * scale;
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
}

/**
 * Mix an AudioBuffer-like object down to mono Float32Array.
 * @param {{ numberOfChannels: number, length: number, getChannelData(i: number): Float32Array }} buffer
 */
export function mixToMono(buffer) {
  if (!buffer || !buffer.numberOfChannels) return new Float32Array(0);
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / channels;
  }
  return out;
}
