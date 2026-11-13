import { checkAvAlignment, formatAlignmentReport } from './mv-av-alignment.mjs';
import { checkMvCompose, formatComposeReport } from './mv-compose-validate.mjs';

export const COMPOSE_GATE_TOLERANCE_SEC = 0.08;
const CUT_EDGE_MARGIN = 0.2;

function finiteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function nonEmptyString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function normalizeComposeAudioMode(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'video' || raw === 'generated' || raw === '视频原声') return 'video';
  if (raw === 'both' || raw === 'preview' || raw === '双音轨') return 'both';
  return 'source';
}

export function normalizeComposePurpose(input = {}) {
  const raw = String(input?.purpose ?? '').trim().toLowerCase();
  if (raw === 'preview' || raw === '预览') return 'preview';
  if (
    raw === 'export'
    || raw === 'final'
    || raw === 'master'
    || raw === '导出'
    || raw === '成片'
  ) return 'export';
  return normalizeComposeAudioMode(input?.audioMode) === 'both' ? 'preview' : 'export';
}

function segmentHasTimes(segment) {
  if (!segment || typeof segment !== 'object') return false;
  const start = finiteNumber(segment.startSec, segment.start);
  const end = finiteNumber(segment.endSec, segment.end);
  return Number.isFinite(start) && Number.isFinite(end);
}

function normalizeProvidedSegments(raw, videos) {
  return raw.map((segment, index) => {
    const start = finiteNumber(segment?.startSec, segment?.start);
    const end = finiteNumber(segment?.endSec, segment?.end);
    const expectedDuration = finiteNumber(
      segment?.expectedDuration,
      segment?.duration,
      Number.isFinite(start) && Number.isFinite(end) ? end - start : undefined,
    );
    const videoPath = nonEmptyString(
      segment?.videoPath,
      segment?.path,
      segment?.outputPath,
      videos[index],
    );
    const out = {
      index: Number.isFinite(Number(segment?.index)) ? Number(segment.index) : index + 1,
    };
    if (Number.isFinite(start)) out.startSec = start;
    if (Number.isFinite(end)) out.endSec = end;
    if (Number.isFinite(expectedDuration)) out.expectedDuration = expectedDuration;
    if (videoPath) out.videoPath = videoPath;
    const videoDuration = finiteNumber(segment?.videoDuration);
    const audioDuration = finiteNumber(segment?.audioDuration);
    if (Number.isFinite(videoDuration)) out.videoDuration = videoDuration;
    if (Number.isFinite(audioDuration)) out.audioDuration = audioDuration;
    return out;
  });
}

export function buildComposeSegments(input = {}) {
  const videos = Array.isArray(input.videos)
    ? input.videos.map((value) => (value == null ? '' : String(value)))
    : [];
  const raw = Array.isArray(input.segments) ? input.segments.filter(Boolean) : [];
  const trimStart = finiteNumber(input.trimStart);
  const trimEnd = finiteNumber(input.trimEnd);
  const cuts = Array.isArray(input.cuts)
    ? input.cuts.map(Number).filter((value) => Number.isFinite(value))
    : [];

  const timed = raw.filter(segmentHasTimes);
  if (timed.length) {
    return normalizeProvidedSegments(raw, videos);
  }

  if (Number.isFinite(trimStart) && Number.isFinite(trimEnd) && trimEnd > trimStart) {
    const inner = cuts
      .filter((cut) => cut > trimStart + CUT_EDGE_MARGIN && cut < trimEnd - CUT_EDGE_MARGIN)
      .sort((a, b) => a - b);
    const points = [trimStart, ...inner, trimEnd];
    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];
      const videoPath = nonEmptyString(videos[index]);
      const out = {
        index: index + 1,
        startSec: start,
        endSec: end,
        expectedDuration: end - start,
      };
      if (videoPath) out.videoPath = videoPath;
      return out;
    });
  }

  if (videos.length) {
    return videos.map((videoPath, index) => {
      const out = { index: index + 1 };
      if (nonEmptyString(videoPath)) out.videoPath = videoPath;
      return out;
    });
  }

  return [];
}

function muxAudioDuration(input = {}) {
  const start = finiteNumber(input.trimStart);
  const end = finiteNumber(input.trimEnd);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  const duration = finiteNumber(input.muxAudioDuration, input.sourceAudioDuration);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

export function planMvComposeGate(input = {}) {
  const audioMode = normalizeComposeAudioMode(input.audioMode);
  const purpose = normalizeComposePurpose({ ...input, audioMode });
  const segments = buildComposeSegments(input);
  const toleranceSec = Number.isFinite(Number(input.durationToleranceSec))
    ? Number(input.durationToleranceSec)
    : COMPOSE_GATE_TOLERANCE_SEC;

  const officialMaster = purpose === 'export' && audioMode !== 'video';
  const requireOriginalAudio = officialMaster || (purpose === 'preview' && audioMode !== 'video');

  const composeInput = { segments };
  const sourceAudioPath = nonEmptyString(input.sourceAudioPath, input.audioPath);
  if (sourceAudioPath) composeInput.sourceAudioPath = sourceAudioPath;
  const muxDuration = muxAudioDuration(input);
  if (muxDuration !== undefined) composeInput.sourceAudioDuration = muxDuration;

  if (officialMaster && input.audioSource === 'generated') {
    composeInput.audioSource = 'generated';
  } else if (audioMode !== 'video' && (sourceAudioPath || muxDuration !== undefined)) {
    composeInput.audioSource = 'original';
  }

  const compose = checkMvCompose(composeInput, {
    durationToleranceSec: toleranceSec,
    requireOriginalAudio,
    requireVideo: input.requireVideo !== false,
  });

  let alignment = null;
  const measurable = segments.filter((segment) => (
    Number.isFinite(segment.videoDuration) || Number.isFinite(segment.audioDuration)
  ));
  if (measurable.length) {
    const alignmentSegments = segments
      .map((segment) => {
        const expectedDuration = Number.isFinite(segment.expectedDuration)
          ? segment.expectedDuration
          : (Number.isFinite(segment.startSec) && Number.isFinite(segment.endSec)
            ? segment.endSec - segment.startSec
            : undefined);
        if (!Number.isFinite(expectedDuration)) return null;
        const item = { index: segment.index, expectedDuration };
        if (Number.isFinite(segment.videoDuration)) item.videoDuration = segment.videoDuration;
        if (Number.isFinite(segment.audioDuration)) item.audioDuration = segment.audioDuration;
        return item;
      })
      .filter(Boolean);
    if (alignmentSegments.length) {
      const options = {
        durationToleranceSec: toleranceSec,
        requireAudio: false,
        requireVideo: false,
      };
      const leadSilenceSec = finiteNumber(input.leadSilenceSec);
      const measuredLeadSilenceSec = finiteNumber(input.measuredLeadSilenceSec);
      if (leadSilenceSec !== undefined) options.leadSilenceSec = leadSilenceSec;
      if (measuredLeadSilenceSec !== undefined) options.measuredLeadSilenceSec = measuredLeadSilenceSec;
      alignment = checkAvAlignment(alignmentSegments, options);
    }
  }

  const ok = Boolean(compose.ok) && (!alignment || alignment.ok);
  let reason;
  if (ok) {
    if (purpose === 'preview') {
      reason = `预览校验通过：${compose.summary}`;
    } else if (audioMode === 'video') {
      reason = `视频原声导出校验通过（此导出不是原曲母带成片）。${compose.summary}`;
    } else {
      reason = `可以合成完整 MV：${compose.summary}`;
    }
  } else {
    const parts = [];
    if (!compose.ok) parts.push(formatComposeReport(compose) || compose.summary);
    if (alignment && !alignment.ok) parts.push(formatAlignmentReport(alignment) || alignment.summary);
    reason = parts.filter(Boolean).join('\n') || '合成校验未通过，暂不导出。';
  }

  return {
    ok,
    purpose,
    audioMode,
    requireOriginalAudio,
    reason,
    compose,
    alignment,
    segments,
  };
}
