/**
 * Pure MV cut-point gate: phrase ends, breaths, and vocal gaps only.
 * Callers inject lyric cues and/or energy hops; the library does not probe media.
 */

import { isVocalActiveHop } from './mv-lipsync-prep.mjs';

export const CUT_GATE_TOLERANCE_SEC = 0.12;
const DEFAULT_HOP_SEC = 0.25;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function asNumber(value) {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function inferHopSec(hops, hopSec) {
  if (isFiniteNumber(hopSec) && hopSec > 0) return hopSec;
  if (
    Array.isArray(hops) &&
    hops.length >= 2 &&
    isFiniteNumber(hops[1]?.t) &&
    isFiniteNumber(hops[0]?.t) &&
    hops[1].t > hops[0].t
  ) {
    return hops[1].t - hops[0].t;
  }
  return DEFAULT_HOP_SEC;
}

function normalizeHops(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.hops)) return input.hops;
  return [];
}

function cueNumber(row, keys) {
  if (!row || typeof row !== 'object') return NaN;
  for (const key of keys) {
    const n = asNumber(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function cueText(row) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of ['text', 'lyrics', 'line', 'lyric']) {
    if (typeof row[key] === 'string' && row[key].trim()) return row[key].trim();
  }
  return undefined;
}

/**
 * @param {unknown} [input]
 * @returns {import('./mv-cut-gate.d.ts').LyricCue[]}
 */
export function parseLyricCues(input) {
  let rows = [];
  if (Array.isArray(input)) rows = input;
  else if (input && typeof input === 'object') {
    if (Array.isArray(input.lyrics)) rows = input.lyrics;
    else if (Array.isArray(input.cues)) rows = input.cues;
    else if (Array.isArray(input.lines)) rows = input.lines;
  }
  /** @type {import('./mv-cut-gate.d.ts').LyricCue[]} */
  const cues = [];
  for (const row of rows) {
    const startSec = cueNumber(row, ['startSec', 'start', 'start_time', 'from']);
    const endSec = cueNumber(row, ['endSec', 'end', 'end_time', 'to']);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;
    const text = cueText(row);
    const cue = { startSec, endSec };
    if (text) cue.text = text;
    cues.push(cue);
  }
  cues.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  return cues;
}

/**
 * @param {unknown} [hopsInput]
 * @param {{ hopSec?: number }} [opts]
 * @returns {import('./mv-cut-gate.d.ts').VocalRun[]}
 */
export function findVocalRuns(hopsInput, opts = {}) {
  const hops = normalizeHops(hopsInput).filter(
    (h) => h && typeof h === 'object' && isFiniteNumber(h.t),
  );
  hops.sort((a, b) => a.t - b.t);
  if (!hops.length) return [];
  const hopSec = inferHopSec(hops, opts.hopSec);
  const flags = hops.map((h) => isVocalActiveHop(h));
  /** @type {import('./mv-cut-gate.d.ts').VocalRun[]} */
  const runs = [];
  let startIdx = 0;
  for (let i = 1; i <= hops.length; i++) {
    if (i < hops.length && flags[i] === flags[startIdx]) continue;
    runs.push({
      startSec: hops[startIdx].t,
      endSec: hops[i - 1].t + hopSec,
      active: flags[startIdx],
    });
    startIdx = i;
  }
  return runs;
}

function parseCutList(input) {
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { numbers: [], raw: [] };
    if (text.startsWith('[')) {
      try {
        return parseCutList(JSON.parse(text));
      } catch {
        return { numbers: [], raw: [input], invalid: true };
      }
    }
    return parseCutList(text.split(/[,，\s]+/).filter(Boolean));
  }
  if (input == null) return { numbers: [], raw: [] };
  if (!Array.isArray(input)) return { numbers: [], raw: [input], invalid: true };
  const raw = input;
  const numbers = raw.map((item) => asNumber(item));
  return { numbers, raw };
}

function durationFromEvidence(lyrics, hops, hopSec, explicit) {
  if (isFiniteNumber(explicit) && explicit >= 0) return explicit;
  let duration = 0;
  for (const cue of lyrics) duration = Math.max(duration, cue.endSec);
  if (Array.isArray(hops) && hops.length) {
    const last = hops[hops.length - 1];
    if (isFiniteNumber(last?.t)) duration = Math.max(duration, last.t + hopSec);
  }
  return duration > 0 ? duration : undefined;
}

function nearestBoundary(t, boundaries) {
  if (!boundaries.length) return t;
  let best = boundaries[0];
  let bestDist = Math.abs(t - best);
  for (const b of boundaries) {
    const dist = Math.abs(t - b);
    if (dist < bestDist - 1e-12) {
      best = b;
      bestDist = dist;
    } else if (Math.abs(dist - bestDist) <= 1e-12 && b > best) {
      // tie → snap later
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

function assessment({ t, ok, kind, snappedT, code, reason }) {
  const out = { t, ok, kind, snappedT, reason };
  if (code) out.code = code;
  return out;
}

/**
 * @param {unknown} tInput
 * @param {import('./mv-cut-gate.d.ts').CutClassifyContext} [ctx]
 * @returns {import('./mv-cut-gate.d.ts').CutAssessment}
 */
export function classifyCutPoint(tInput, ctx = {}) {
  const t = asNumber(tInput);
  const lyrics = parseLyricCues(ctx.lyrics);
  const hops = normalizeHops(ctx.hops).filter(
    (h) => h && typeof h === 'object' && isFiniteNumber(h.t),
  );
  hops.sort((a, b) => a.t - b.t);
  const hopSec = inferHopSec(hops, ctx.hopSec);
  const toleranceSec =
    isFiniteNumber(ctx.toleranceSec) && ctx.toleranceSec >= 0
      ? ctx.toleranceSec
      : CUT_GATE_TOLERANCE_SEC;
  const hopTol = hops.length ? Math.max(toleranceSec, hopSec / 2) : toleranceSec;
  const durationSec = durationFromEvidence(lyrics, hops, hopSec, ctx.durationSec);

  if (!Number.isFinite(t) || t < 0) {
    return assessment({
      t: Number.isFinite(t) ? t : NaN,
      ok: false,
      kind: 'invalid',
      snappedT: 0,
      code: 'INVALID_CUT',
      reason: '切点不是有效的非负秒数。',
    });
  }

  if (isFiniteNumber(durationSec) && t > durationSec + toleranceSec + 1e-9) {
    return assessment({
      t,
      ok: false,
      kind: 'invalid',
      snappedT: durationSec,
      code: 'OUT_OF_RANGE',
      reason: `切点 ${t.toFixed(3)}s 超出音频时长 ${durationSec.toFixed(3)}s。`,
    });
  }

  const songBoundaries = [0];
  if (isFiniteNumber(durationSec)) songBoundaries.push(durationSec);
  const onSongEdge = songBoundaries.some((b) => Math.abs(t - b) <= toleranceSec + 1e-9);
  if (onSongEdge) {
    const snappedT = nearestBoundary(t, songBoundaries);
    return assessment({
      t,
      ok: true,
      kind: 'song_edge',
      snappedT,
      reason: `切点落在曲首/曲尾（${snappedT.toFixed(3)}s）。`,
    });
  }

  if (lyrics.length) {
    const boundaries = [];
    for (const cue of lyrics) {
      boundaries.push(cue.startSec, cue.endSec);
    }
    const near = boundaries.find((b) => Math.abs(t - b) <= toleranceSec + 1e-9);
    if (near != null) {
      const snappedT = nearestBoundary(t, boundaries);
      return assessment({
        t,
        ok: true,
        kind: 'phrase_end',
        snappedT,
        reason: `切点对齐歌词句界 ${snappedT.toFixed(3)}s。`,
      });
    }
    const inside = lyrics.find((cue) => t > cue.startSec + toleranceSec && t < cue.endSec - toleranceSec);
    if (inside) {
      const snappedT = nearestBoundary(t, [inside.startSec, inside.endSec]);
      return assessment({
        t,
        ok: false,
        kind: 'mid_lyric',
        snappedT,
        code: 'MID_LYRIC',
        reason: `切点 ${t.toFixed(3)}s 落在歌词句中（${inside.startSec.toFixed(2)}–${inside.endSec.toFixed(2)}s），应改到句界 ${snappedT.toFixed(3)}s。`,
      });
    }
    return assessment({
      t,
      ok: true,
      kind: 'vocal_gap',
      snappedT: t,
      reason: `切点落在乐句之间的人声空白（${t.toFixed(3)}s）。`,
    });
  }

  if (hops.length) {
    const runs = findVocalRuns(hops, { hopSec });
    const active = runs.filter((r) => r.active);
    const boundaries = [0];
    if (isFiniteNumber(durationSec)) boundaries.push(durationSec);
    for (const run of active) boundaries.push(run.startSec, run.endSec);
    const uniqueBoundaries = [...new Set(boundaries.map((b) => Number(b.toFixed(6))))];
    const near = uniqueBoundaries.find((b) => Math.abs(t - b) <= hopTol + 1e-9);
    if (near != null) {
      const snappedT = nearestBoundary(t, uniqueBoundaries);
      return assessment({
        t,
        ok: true,
        kind: Math.abs(snappedT) <= hopTol || (isFiniteNumber(durationSec) && Math.abs(snappedT - durationSec) <= hopTol)
          ? 'song_edge'
          : 'vocal_gap',
        snappedT,
        reason: `切点对齐人声能量谷/段界 ${snappedT.toFixed(3)}s。`,
      });
    }
    const inside = active.find((run) => t > run.startSec + hopTol && t < run.endSec - hopTol);
    if (inside) {
      const snappedT = nearestBoundary(t, [inside.startSec, inside.endSec]);
      return assessment({
        t,
        ok: false,
        kind: 'mid_lyric',
        snappedT,
        code: 'MID_LYRIC',
        reason: `切点 ${t.toFixed(3)}s 落在连续人声段内部（${inside.startSec.toFixed(2)}–${inside.endSec.toFixed(2)}s），应改到能量谷 ${snappedT.toFixed(3)}s。`,
      });
    }
    return assessment({
      t,
      ok: true,
      kind: 'vocal_gap',
      snappedT: t,
      reason: `切点落在人声空白或间奏（${t.toFixed(3)}s）。`,
    });
  }

  return assessment({
    t,
    ok: false,
    kind: 'invalid',
    snappedT: t,
    code: 'NO_EVIDENCE',
    reason: '没有歌词时间码，也没有人声能量 hops，无法判断切点是否落在句界。',
  });
}

function issueFromCut(cut) {
  if (!cut.code) return null;
  return {
    code: cut.code,
    severity: 'error',
    message: cut.reason,
    t: cut.t,
    snappedT: cut.snappedT,
  };
}

/**
 * @param {import('./mv-cut-gate.d.ts').CutCheckInput} [input]
 * @returns {import('./mv-cut-gate.d.ts').CutCheckReport}
 */
export function checkMvCuts(input = {}) {
  const toleranceSec =
    isFiniteNumber(input.toleranceSec) && input.toleranceSec >= 0
      ? input.toleranceSec
      : CUT_GATE_TOLERANCE_SEC;
  const lyrics = parseLyricCues(input.lyrics);
  const hops = normalizeHops(input.hops).filter(
    (h) => h && typeof h === 'object' && isFiniteNumber(h.t),
  );
  hops.sort((a, b) => a.t - b.t);
  const hopSec = inferHopSec(hops, input.hopSec);
  const durationSec = durationFromEvidence(lyrics, hops, hopSec, input.durationSec);
  const parsed = parseCutList(input.cuts);
  /** @type {import('./mv-cut-gate.d.ts').CutCheckIssue[]} */
  const issues = [];
  /** @type {import('./mv-cut-gate.d.ts').CutAssessment[]} */
  const cuts = [];

  const hasEvidence = lyrics.length > 0 || hops.length > 0;
  const hasFiniteCut = parsed.numbers.some((n) => Number.isFinite(n));
  if (parsed.invalid || !hasFiniteCut) {
    issues.push({
      code: 'NO_CUTS',
      severity: 'error',
      message: '未提供可解析的切点（需要秒数数组或逗号分隔的时间）。',
    });
    return {
      ok: false,
      toleranceSec,
      hopSec: hops.length ? hopSec : undefined,
      durationSec,
      reason: issues[0].message,
      cuts: [],
      snappedCuts: [],
      issues,
    };
  }

  if (!hasEvidence) {
    issues.push({
      code: 'NO_EVIDENCE',
      severity: 'error',
      message: '没有歌词时间码，也没有人声能量 hops，无法判断切点是否落在句界。',
    });
  }

  const accepted = [];
  parsed.numbers.forEach((t, index) => {
    if (!Number.isFinite(t) || t < 0) {
      const cut = assessment({
        t: Number.isFinite(t) ? t : NaN,
        ok: false,
        kind: 'invalid',
        snappedT: 0,
        code: 'INVALID_CUT',
        reason: '切点不是有效的非负秒数。',
      });
      cuts.push(cut);
      issues.push(issueFromCut(cut));
      return;
    }
    const dup = accepted.find((prev) => Math.abs(prev - t) <= toleranceSec + 1e-9);
    if (dup != null) {
      const cut = assessment({
        t,
        ok: false,
        kind: 'invalid',
        snappedT: dup,
        code: 'DUPLICATE_CUT',
        reason: `切点 ${t.toFixed(3)}s 与已有切点 ${dup.toFixed(3)}s 重复（容差 ${toleranceSec}s）。`,
      });
      cuts.push(cut);
      issues.push(issueFromCut(cut));
      return;
    }
    accepted.push(t);
    const cut = hasEvidence
      ? classifyCutPoint(t, {
          lyrics,
          hops,
          durationSec,
          toleranceSec,
          hopSec,
        })
      : assessment({
          t,
          ok: false,
          kind: 'invalid',
          snappedT: t,
          code: 'NO_EVIDENCE',
          reason: '没有歌词时间码，也没有人声能量 hops，无法判断切点是否落在句界。',
        });
    cuts.push(cut);
    const issue = issueFromCut(cut);
    if (issue) issues.push(issue);
    void index;
  });

  const ok = issues.length === 0 && cuts.every((c) => c.ok);
  const reason = ok
    ? `切点均落在句界、呼吸或人声空白（容差 ${toleranceSec}s），校验通过。`
    : issues.map((i) => i.message).join('；');
  return {
    ok,
    toleranceSec,
    hopSec: hops.length ? hopSec : undefined,
    durationSec,
    reason,
    cuts,
    snappedCuts: cuts.map((c) => c.snappedT),
    issues,
  };
}
