import { normalizeCues } from './subtitle-cues.mjs';

/**
 * @typedef {{ startMs: number, endMs: number, text: string, translation?: string }} SubtitleCue
 * @typedef {{ index: number, text?: string, translation?: string, startMs?: number, endMs?: number }} CuePatch
 * @typedef {{ cues: SubtitleCue[], needsReview?: boolean, source?: string }} ParseRhAsrResult
 */

const SENTENCE_SPLIT = /[。！？!?；;\n]+/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Map a sentence/segment-like object into a cue-shaped record (ms).
 * @param {any} item
 * @param {number} index
 */
function mapTimedItem(item, index) {
  if (typeof item === 'string') {
    // Let normalizeCues parse plain timed lines.
    return item;
  }
  if (!item || typeof item !== 'object') {
    throw new Error(`ASR item[${index}] 非法：需要对象或带时间轴文本`);
  }

  if (Number.isFinite(item.begin_time) || Number.isFinite(item.start_ms)) {
    const startMs = Number(
      item.startMs ?? item.start_ms ?? item.begin_time,
    );
    const endMs = Number(
      item.endMs ?? item.end_ms ?? item.end_time,
    );
    const text = String(item.text ?? item.source ?? '').trim();
    /** @type {any} */
    const cue = { startMs, endMs, text };
    const translation = item.translation ?? item.target;
    if (translation != null && String(translation).trim()) {
      cue.translation = String(translation).trim();
    }
    return cue;
  }

  // start/end seconds or startMs/endMs / clock strings — normalizeCues understands these.
  /** @type {any} */
  const cue = { ...item };
  if (cue.text == null && cue.source != null) cue.text = cue.source;
  return cue;
}

/**
 * @param {any[]} list
 * @param {string} source
 * @returns {ParseRhAsrResult}
 */
function finalizeList(list, source) {
  const mapped = list.map((item, index) => mapTimedItem(item, index));
  const cues = normalizeCues(mapped);
  return { cues, source };
}

/**
 * Equal-split untimed text across durationMs.
 * @param {string} text
 * @param {number} durationMs
 * @returns {ParseRhAsrResult}
 */
function weakSplitText(text, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('弱对齐需要正数 durationMs（--duration-ms）');
  }
  const pieces = String(text)
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  if (pieces.length === 0) {
    throw new Error('弱对齐文本为空：无法切分出有效句子');
  }
  const slice = durationMs / pieces.length;
  const cues = pieces.map((piece, index) => {
    const startMs = Math.round(index * slice);
    const endMs = index === pieces.length - 1
      ? Math.round(durationMs)
      : Math.round((index + 1) * slice);
    // Guard zero-width from rounding
    const safeEnd = endMs <= startMs ? startMs + 1 : endMs;
    return { startMs, endMs: safeEnd, text: piece };
  });
  // Ensure last ends exactly at durationMs when possible
  if (cues.length) {
    const last = cues[cues.length - 1];
    if (last.endMs < durationMs) last.endMs = Math.round(durationMs);
    if (last.endMs <= last.startMs) last.endMs = last.startMs + 1;
  }
  return {
    cues: normalizeCues(cues),
    needsReview: true,
    source: 'weak-split',
  };
}

/**
 * Extract untimed text blob from common wrappers.
 * @param {unknown} raw
 * @returns {string | null}
 */
function extractUntimedText(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // If it looks like JSON, caller already tried parse; treat as prose.
    return trimmed;
  }
  if (isPlainObject(raw) && typeof raw.text === 'string' && raw.text.trim()) {
    // Only treat as untimed when no timed collections present.
    if (Array.isArray(raw.segments) || Array.isArray(raw.sentences) || Array.isArray(raw.cues)) {
      return null;
    }
    if (isPlainObject(raw.result)) return null;
    return raw.text.trim();
  }
  return null;
}

/**
 * Parse RunningHub / Confucius-like ASR JSON/text into normalized cues.
 * @param {unknown} raw
 * @param {{ durationMs?: number }} [options]
 * @returns {ParseRhAsrResult}
 */
export function parseRhAsrOutput(raw, options = {}) {
  let value = raw;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        // fall through as untimed prose
        return weakSplitText(trimmed, options.durationMs);
      }
    } else {
      return weakSplitText(trimmed, options.durationMs);
    }
  }

  if (Array.isArray(value)) {
    const allStrings = value.every((item) => typeof item === 'string');
    const result = finalizeList(value, allStrings ? 'plain-passthrough' : 'array');
    return result;
  }

  if (!isPlainObject(value)) {
    throw new Error('不支持的 ASR 输入：需要 JSON 对象、数组或文本');
  }

  // Nested result wrapper
  if (isPlainObject(value.result)) {
    const inner = value.result;
    if (Array.isArray(inner.segments) || Array.isArray(inner.sentences) || Array.isArray(inner.cues)) {
      const nested = parseRhAsrOutput(inner, options);
      return {
        cues: nested.cues,
        needsReview: nested.needsReview,
        source: 'result',
      };
    }
  }

  if (Array.isArray(value.segments)) {
    return finalizeList(value.segments, 'segments');
  }

  if (Array.isArray(value.sentences)) {
    return finalizeList(value.sentences, 'sentences');
  }

  if (Array.isArray(value.cues)) {
    return finalizeList(value.cues, 'plain-passthrough');
  }

  const untimed = extractUntimedText(value);
  if (untimed != null) {
    return weakSplitText(untimed, options.durationMs);
  }

  throw new Error('不支持的 ASR 格式 / unsupported ASR shape（需要 segments、sentences、result、cues、数组或 text+durationMs）');
}

/**
 * Immutably apply cue patches by index.
 * @param {SubtitleCue[]} cues
 * @param {CuePatch[]} patches
 * @returns {SubtitleCue[]}
 */
export function applyCuePatches(cues, patches) {
  if (!Array.isArray(cues)) throw new Error('applyCuePatches 需要 cues 数组');
  if (!Array.isArray(patches)) throw new Error('applyCuePatches 需要 patches 数组');

  const next = cues.map((cue) => ({ ...cue }));

  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') {
      throw new Error('patch 非法：需要对象');
    }
    const index = Number(patch.index);
    if (!Number.isInteger(index) || index < 0 || index >= next.length) {
      throw new Error(`patch index 越界 / out of range：${patch.index}`);
    }

    const cue = { ...next[index] };
    if (patch.text !== undefined) cue.text = String(patch.text).trim();
    if (patch.translation !== undefined) {
      const t = String(patch.translation).trim();
      if (t) cue.translation = t;
      else delete cue.translation;
    }
    if (patch.startMs !== undefined) cue.startMs = Number(patch.startMs);
    if (patch.endMs !== undefined) cue.endMs = Number(patch.endMs);

    if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs)) {
      throw new Error(`cue[${index}] 时间戳非有限数`);
    }
    if (cue.endMs <= cue.startMs) {
      throw new Error(`cue[${index}] inverted duration: endMs (${cue.endMs}) must be > startMs (${cue.startMs})`);
    }
    if (!cue.text) {
      throw new Error(`cue[${index}] empty text`);
    }

    next[index] = cue;
  }

  return next;
}
