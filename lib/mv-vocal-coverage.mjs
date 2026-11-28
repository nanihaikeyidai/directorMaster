/**
 * Plan MV segments from a vocal / instrumental activity map.
 * Long no-vocal regions become wide, closed-mouth coverage;
 * short gaps are treated as phrase breaths and absorbed into vocal packs.
 */
import { isVocalActiveHop } from "./mv-energy-hops.mjs";
import { singingCoverageNote, instrumentalCoverageNote } from "./mv-lyric-segments.mjs";

export const DEFAULT_MAX_SEGMENT_SEC = 15;
export const DEFAULT_MIN_INSTRUMENTAL_SEC = 2;
const MIN_SEGMENT_SEC = 0.25;
const DEFAULT_HOP_SEC = 0.25;

function round3(value) {
  return Number(Number(value).toFixed(3));
}

export function regionsFromVocalMap(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.regions) ? raw.regions : [];
  return list
    .map((row) => ({
      start: Number(row?.start ?? row?.startSec),
      end: Number(row?.end ?? row?.endSec),
      vocal: Boolean(row?.vocal ?? row?.isVocal),
    }))
    .filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start);
}

export function regionsFromEnergyHops(hops, opts = {}) {
  const list = Array.isArray(hops) ? hops : [];
  const hopSec = Number.isFinite(opts.hopSec) && opts.hopSec > 0 ? Number(opts.hopSec) : DEFAULT_HOP_SEC;
  const labeled = [];
  for (const hop of list) {
    const t = Number(hop?.t);
    if (!Number.isFinite(t)) continue;
    const vocal = typeof opts.isVocal === "function" ? Boolean(opts.isVocal(hop)) : isVocalActiveHop(hop, opts);
    labeled.push({ start: t, end: t + hopSec, vocal });
  }
  labeled.sort((a, b) => a.start - b.start);
  const regions = [];
  for (const row of labeled) {
    const last = regions[regions.length - 1];
    if (last && last.vocal === row.vocal && row.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, row.end);
    } else {
      regions.push({ start: row.start, end: row.end, vocal: row.vocal });
    }
  }
  return regions;
}

function normalizeRegions(regions, durationSec) {
  const clamped = regionsFromVocalMap({ regions })
    .map((row) => ({
      start: Math.max(0, Math.min(durationSec, row.start)),
      end: Math.max(0, Math.min(durationSec, row.end)),
      vocal: row.vocal,
    }))
    .filter((row) => row.end - row.start >= 0.01)
    .sort((a, b) => a.start - b.start || Number(b.vocal) - Number(a.vocal));

  const filled = [];
  let cursor = 0;
  for (const row of clamped) {
    if (row.start > cursor + 0.01) {
      filled.push({ start: cursor, end: row.start, vocal: false });
    }
    const start = Math.max(row.start, filled.length ? filled[filled.length - 1].end : cursor, cursor);
    if (row.end - start >= 0.01) filled.push({ start, end: row.end, vocal: row.vocal });
    cursor = Math.max(cursor, row.end);
  }
  if (durationSec - cursor >= 0.01) filled.push({ start: cursor, end: durationSec, vocal: false });

  const merged = [];
  for (const row of filled) {
    const last = merged[merged.length - 1];
    if (last && last.vocal === row.vocal && Math.abs(row.start - last.end) < 1e-6) {
      last.end = row.end;
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

function makeInstrumental(start, end) {
  return {
    start: round3(start),
    end: round3(end),
    duration: round3(end - start),
    ...instrumentalCoverageNote(),
    cutReason: "instrumental-gap",
  };
}

function makeVocal(start, end, cutReason) {
  return {
    start: round3(start),
    end: round3(end),
    duration: round3(end - start),
    ...singingCoverageNote(),
    cutReason: cutReason || "vocal-pack",
  };
}

function pushInstrumentalChunks(segments, start, end, maxSegmentSec) {
  let cursor = start;
  while (end - cursor > maxSegmentSec + 1e-6) {
    segments.push(makeInstrumental(cursor, cursor + maxSegmentSec));
    cursor += maxSegmentSec;
  }
  if (end - cursor >= MIN_SEGMENT_SEC) segments.push(makeInstrumental(cursor, end));
  else if (end > cursor && segments.length) {
    const last = segments[segments.length - 1];
    if (last.kind === "instrumental") {
      last.end = round3(end);
      last.duration = round3(end - last.start);
    }
  }
}

export function planVocalCoverageSegments(input = {}) {
  const durationSec = Number(input.durationSec ?? input.duration);
  const maxSegmentSec = Number(input.maxSegmentSec) > 0 ? Number(input.maxSegmentSec) : DEFAULT_MAX_SEGMENT_SEC;
  const minInstrumentalSec = Number.isFinite(Number(input.minInstrumentalSec))
    ? Math.max(0, Number(input.minInstrumentalSec))
    : DEFAULT_MIN_INSTRUMENTAL_SEC;
  const empty = {
    ok: false,
    cuts: [],
    notes: [],
    segments: [],
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
  };

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ...empty, reason: "缺少有效的歌曲时长，无法按人声覆盖分段" };
  }

  const raw = input.regions ?? input.map ?? input;
  const regionList = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? raw.regions : [];
  const parsed = regionsFromVocalMap({ regions: regionList });
  if (!parsed.length) {
    return { ...empty, durationSec, reason: "没有可用的人声/伴奏区域，无法按人声覆盖分段" };
  }
  const regions = normalizeRegions(parsed, durationSec);
  if (!regions.length) {
    return { ...empty, durationSec, reason: "没有可用的人声/伴奏区域，无法按人声覆盖分段" };
  }

  const atoms = regions.map((row) => ({
    start: row.start,
    end: row.end,
    kind:
      row.vocal || row.end - row.start < minInstrumentalSec - 1e-6
        ? row.vocal
          ? "vocal"
          : "breath"
        : "instrumental",
  }));

  const segments = [];
  let i = 0;
  while (i < atoms.length) {
    const atom = atoms[i];
    if (atom.kind === "instrumental") {
      pushInstrumentalChunks(segments, atom.start, atom.end, maxSegmentSec);
      i += 1;
      continue;
    }

    const packStart = atom.start;
    let packEnd = packStart;
    let k = i;
    while (k < atoms.length && atoms[k].kind !== "instrumental") {
      const nextEnd = atoms[k].end;
      if (nextEnd - packStart > maxSegmentSec + 1e-6) break;
      packEnd = nextEnd;
      k += 1;
    }

    if (packEnd - packStart < MIN_SEGMENT_SEC) {
      const cur = atoms[i];
      if (cur.kind === "vocal" && cur.end - packStart > maxSegmentSec + 1e-6) {
        const splitAt = packStart + maxSegmentSec;
        segments.push(makeVocal(packStart, splitAt, "max-duration"));
        atoms[i] = { ...cur, start: splitAt };
        if (atoms[i].end - atoms[i].start < MIN_SEGMENT_SEC) {
          const last = segments[segments.length - 1];
          last.end = round3(atoms[i].end);
          last.duration = round3(atoms[i].end - last.start);
          i += 1;
        }
        continue;
      }
      if (cur.kind === "breath") {
        i += 1;
        continue;
      }
      return { ...empty, durationSec, reason: "按人声覆盖分段后出现短于 " + MIN_SEGMENT_SEC + " 秒的片段" };
    }

    const continuesVocal = k < atoms.length && atoms[k].kind !== "instrumental";
    const cutReason = continuesVocal && packEnd - packStart >= maxSegmentSec - 1e-6 ? "max-duration" : "vocal-pack";
    segments.push(makeVocal(packStart, packEnd, cutReason));

    while (i < atoms.length && atoms[i].end <= packEnd + 1e-6) i += 1;
    if (i < atoms.length && atoms[i].start < packEnd - 1e-6) {
      atoms[i] = { ...atoms[i], start: packEnd };
      if (atoms[i].end - atoms[i].start < 0.01) i += 1;
    }
  }

  const cuts = segments.slice(1).map((segment) => segment.start);
  const notes = segments.map(({ kind, lyrics, shotType, coverage, direction, phraseEndsSec }) => ({
    kind,
    lyrics,
    shotType,
    coverage,
    direction,
    phraseEndsSec,
  }));
  const indexed = segments.map((segment, segmentIndex) => ({
    index: segmentIndex + 1,
    ...segment,
  }));

  return {
    ok: true,
    reason: "已按人声覆盖分成 " + segments.length + " 段",
    cuts,
    notes,
    segments: indexed,
    durationSec,
  };
}
