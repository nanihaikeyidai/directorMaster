/**
 * Browser-safe MV-page helper: import timed lyrics JSON and plan phrase segments.
 * No node: imports. Delegates segment rules to planLyricPhraseSegments.
 */
import { parseLyricCues } from "./mv-cut-gate.mjs";
import { planLyricPhraseSegments } from "./mv-lyric-segments.mjs";

function round3(value) {
  return Number(Number(value).toFixed(3));
}

export function parseLyricImportText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, lyrics: null, reason: "歌词文件是空的，无法按语句分段" };
  try {
    return { ok: true, lyrics: JSON.parse(raw), reason: "" };
  } catch {
    return { ok: false, lyrics: null, reason: "歌词文件不是有效的 JSON，无法按语句分段" };
  }
}

/**
 * @param {{ lyrics?: unknown, durationSec?: number, rangeStart?: number, rangeEnd?: number, maxSegmentSec?: number, minInstrumentalSec?: number }} input
 */
export function planMvLyricImportUi(input = {}) {
  const durationSec = Number(input.durationSec);
  const empty = {
    ok: false,
    cuts: [],
    notes: [],
    segments: [],
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    rangeStart: 0,
    rangeEnd: 0,
    reason: "",
  };

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ...empty, reason: "请先导入音乐，再按歌词语句分段" };
  }

  let rangeStart = Number(input.rangeStart);
  let rangeEnd = Number(input.rangeEnd);
  if (!Number.isFinite(rangeStart)) rangeStart = 0;
  if (!Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) rangeEnd = durationSec;
  rangeStart = Math.max(0, Math.min(durationSec, rangeStart));
  rangeEnd = Math.max(rangeStart, Math.min(durationSec, rangeEnd));
  const windowSec = rangeEnd - rangeStart;
  if (windowSec < 0.25) {
    return { ...empty, rangeStart, rangeEnd, reason: "当前音频选区太短，无法按语句分段" };
  }

  const cues = parseLyricCues(input.lyrics);
  if (!cues.length) {
    return { ...empty, rangeStart, rangeEnd, durationSec, reason: "没有可用的歌词时间轴，无法按语句分段" };
  }

  const shifted = cues.map((cue) => ({
    startSec: cue.startSec - rangeStart,
    endSec: cue.endSec - rangeStart,
    text: cue.text,
  }));

  const planned = planLyricPhraseSegments({
    lyrics: shifted,
    durationSec: windowSec,
    maxSegmentSec: input.maxSegmentSec,
    minInstrumentalSec: input.minInstrumentalSec,
  });

  if (!planned.ok) {
    return { ...empty, rangeStart, rangeEnd, durationSec, reason: planned.reason };
  }

  const cuts = planned.cuts.map((time) => round3(time + rangeStart));
  const segments = planned.segments.map((segment) => ({
    ...segment,
    start: round3(segment.start + rangeStart),
    end: round3(segment.end + rangeStart),
  }));

  return {
    ok: true,
    cuts,
    notes: planned.notes,
    segments,
    durationSec,
    rangeStart,
    rangeEnd,
    reason: planned.reason,
  };
}
