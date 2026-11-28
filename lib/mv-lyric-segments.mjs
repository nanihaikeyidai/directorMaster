/**
 * Plan MV generation segments from timed lyric cues.
 * Vocal phrases are packed up to maxSegmentSec without cutting mid-line;
 * gaps of at least minInstrumentalSec become instrumental wide coverage.
 */
import { parseLyricCues } from "./mv-cut-gate.mjs";

export const DEFAULT_MAX_SEGMENT_SEC = 15;
export const DEFAULT_MIN_INSTRUMENTAL_SEC = 2;
const MIN_SEGMENT_SEC = 0.25;

function round3(value) {
  return Number(Number(value).toFixed(3));
}

export function singingCoverageNote(lyricsText = "", phraseEndsSec = []) {
  return {
    kind: "vocal",
    lyrics: String(lyricsText || "").trim(),
    shotType: "lead",
    coverage: "singing-closeup",
    direction: "有人声演唱：镜头完全固定，优先脸部近景与半身弹唱特写，合理换景别，不用场地远景。",
    phraseEndsSec: Array.isArray(phraseEndsSec) ? phraseEndsSec.map(round3) : [],
  };
}

export function instrumentalCoverageNote() {
  return {
    kind: "instrumental",
    lyrics: "",
    shotType: "wide",
    coverage: "instrumental-wide",
    direction: "无人声：只排场地远景或琴弦/演奏镜头，不对歌手脸；嘴巴自然闭合，不要做演唱口型。",
    phraseEndsSec: [],
  };
}

function makeInstrumental(start, end) {
  return {
    start: round3(start),
    end: round3(end),
    duration: round3(end - start),
    ...instrumentalCoverageNote(),
    phrases: [],
  };
}

function pushInstrumentalChunks(segments, start, end, maxSegmentSec) {
  let cursor = start;
  while (end - cursor > maxSegmentSec + 1e-6) {
    segments.push(makeInstrumental(cursor, cursor + maxSegmentSec));
    cursor += maxSegmentSec;
  }
  if (end - cursor >= MIN_SEGMENT_SEC) segments.push(makeInstrumental(cursor, end));
}

/**
 * @param {{ lyrics?: unknown, durationSec?: number, maxSegmentSec?: number, minInstrumentalSec?: number }} input
 */
export function planLyricPhraseSegments(input = {}) {
  const cues = parseLyricCues(input.lyrics);
  const durationSec = Number(input.durationSec);
  const maxSegmentSec = Number(input.maxSegmentSec) > 0 ? Number(input.maxSegmentSec) : DEFAULT_MAX_SEGMENT_SEC;
  const minInstrumentalSec = Number.isFinite(Number(input.minInstrumentalSec))
    ? Math.max(0, Number(input.minInstrumentalSec))
    : DEFAULT_MIN_INSTRUMENTAL_SEC;
  const empty = { ok: false, cuts: [], notes: [], segments: [], durationSec: Number.isFinite(durationSec) ? durationSec : 0 };

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ...empty, reason: "缺少有效的歌曲时长，无法按语句分段" };
  }
  if (!cues.length) {
    return { ...empty, reason: "没有可用的歌词时间轴，无法按语句分段", durationSec };
  }

  const clamped = cues
    .map((cue) => ({
      ...cue,
      startSec: Math.max(0, Math.min(durationSec, cue.startSec)),
      endSec: Math.max(0, Math.min(durationSec, cue.endSec)),
    }))
    .filter((cue) => cue.endSec - cue.startSec >= 0.05);

  if (!clamped.length) {
    return { ...empty, reason: "歌词时间轴与歌曲时长没有交集，无法按语句分段", durationSec };
  }

  const tooLong = clamped.find((cue) => cue.endSec - cue.startSec > maxSegmentSec + 1e-6);
  if (tooLong) {
    return {
      ...empty,
      durationSec,
      reason: `单句歌词 ${tooLong.startSec.toFixed(3)}–${tooLong.endSec.toFixed(3)}s 超过 ${maxSegmentSec} 秒上限，无法在句中切开`,
    };
  }

  const segments = [];
  let cursor = 0;
  let index = 0;
  while (index < clamped.length) {
    const cue = clamped[index];
    if (cue.startSec - cursor >= minInstrumentalSec) {
      pushInstrumentalChunks(segments, cursor, cue.startSec, maxSegmentSec);
      cursor = cue.startSec;
    }

    const packStart = cursor;
    const packed = [cue];
    let packEnd = Math.max(cursor, cue.endSec);
    let nextIndex = index + 1;
    while (nextIndex < clamped.length) {
      const next = clamped[nextIndex];
      if (next.startSec - packEnd >= minInstrumentalSec) break;
      if (next.endSec - packStart > maxSegmentSec + 1e-6) break;
      packed.push(next);
      packEnd = Math.max(packEnd, next.endSec);
      nextIndex += 1;
    }

    const nextBoundary = nextIndex < clamped.length ? clamped[nextIndex].startSec : durationSec;
    if (nextBoundary - packEnd < minInstrumentalSec) {
      packEnd = Math.min(nextBoundary, packStart + maxSegmentSec);
    }
    if (packEnd - packStart < MIN_SEGMENT_SEC) {
      return { ...empty, durationSec, reason: `按语句分段后出现短于 ${MIN_SEGMENT_SEC} 秒的片段` };
    }

    const lyricsText = packed.map((item) => item.text || "").filter(Boolean).join("\n");
    const duration = packEnd - packStart;
    const phraseEndsSec = packed
      .map((item) => round3(item.endSec - packStart))
      .filter((time) => time > 0.05 && time < duration - 0.05);

    segments.push({
      start: round3(packStart),
      end: round3(packEnd),
      duration: round3(duration),
      ...singingCoverageNote(lyricsText, phraseEndsSec),
      phrases: packed,
    });
    cursor = packEnd;
    index = nextIndex;
  }

  if (durationSec - cursor >= minInstrumentalSec) {
    pushInstrumentalChunks(segments, cursor, durationSec, maxSegmentSec);
  } else if (durationSec - cursor >= MIN_SEGMENT_SEC && segments.length) {
    const last = segments[segments.length - 1];
    if (durationSec - last.start <= maxSegmentSec + 1e-6) {
      last.end = round3(durationSec);
      last.duration = round3(durationSec - last.start);
    } else {
      pushInstrumentalChunks(segments, cursor, durationSec, maxSegmentSec);
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
    reason: `已按 ${clamped.length} 句歌词分成 ${segments.length} 段`,
    cuts,
    notes,
    segments: indexed,
    durationSec,
  };
}

/**
 * Fill notes for already chosen cut points from overlapping lyric cues.
 * @param {number[]} points  including 0 and duration
 */
export function notesFromLyricSegments(pointsInput, lyrics) {
  const points = (Array.isArray(pointsInput) ? pointsInput : []).map(Number).filter((value) => Number.isFinite(value));
  const cues = parseLyricCues(lyrics);
  if (points.length < 2) return [];
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const overlapping = cues.filter((cue) => cue.endSec > start + 0.05 && cue.startSec < end - 0.05);
    if (!overlapping.length) return instrumentalCoverageNote();
    const lyricsText = overlapping.map((cue) => cue.text || "").filter(Boolean).join("\n");
    const phraseEndsSec = overlapping
      .map((cue) => round3(cue.endSec - start))
      .filter((time) => time > 0.05 && time < end - start - 0.05);
    return singingCoverageNote(lyricsText, phraseEndsSec);
  });
}
