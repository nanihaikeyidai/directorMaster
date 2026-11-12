/**
 * Pure MV pre-compose checker.
 * Callers supply cut points, probed durations, and audio-source evidence;
 * this module does not run ffmpeg/ffprobe.
 */

import path from 'node:path';

const DEFAULT_TOLERANCE_SEC = 0.08;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFinitePositive(value) {
  return isFiniteNumber(value) && value > 0;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeVideoPath(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return path.normalize(trimmed).replace(/\\/g, '/');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyPath(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {unknown} raw
 * @param {number} fallbackIndex
 */
function normalizeSegment(raw, fallbackIndex) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const indexRaw = src.index != null ? Number(src.index) : fallbackIndex;
  const startRaw = src.startSec ?? src.start;
  const endRaw = src.endSec ?? src.end;
  const expectedRaw = src.expectedDuration ?? src.duration;
  const videoDurationRaw = src.videoDuration;
  const startSec =
    startRaw === undefined || startRaw === null || startRaw === ''
      ? undefined
      : Number(startRaw);
  const endSec =
    endRaw === undefined || endRaw === null || endRaw === ''
      ? undefined
      : Number(endRaw);
  let expectedDuration;
  if (expectedRaw !== undefined && expectedRaw !== null && expectedRaw !== '') {
    expectedDuration = Number(expectedRaw);
  } else if (isFiniteNumber(startSec) && isFiniteNumber(endSec)) {
    expectedDuration = endSec - startSec;
  }
  const videoDuration =
    videoDurationRaw === undefined || videoDurationRaw === null || videoDurationRaw === ''
      ? undefined
      : Number(videoDurationRaw);
  return {
    index: Number.isFinite(indexRaw) ? indexRaw : fallbackIndex,
    startSec,
    endSec,
    expectedDuration,
    videoDuration,
    videoPath: typeof src.videoPath === 'string' ? src.videoPath : undefined,
  };
}

/**
 * @param {ReturnType<typeof normalizeSegment>[]} segments
 * @returns {{ normalized: ReturnType<typeof normalizeSegment>[], zeroBased: boolean }}
 */
function normalizeIndices(segments) {
  const indices = segments.map((s) => s.index);
  const zeroBased = indices.some((i) => i === 0);
  if (!zeroBased) return { normalized: segments, zeroBased: false };
  return {
    zeroBased: true,
    normalized: segments.map((s) => ({ ...s, index: s.index + 1 })),
  };
}

/**
 * @param {object} issue
 */
function issue(fields) {
  return {
    segmentIndex: null,
    ...fields,
  };
}

/**
 * @param {unknown} input
 * @param {object} [options]
 */
export function checkMvCompose(input, options = {}) {
  const inputIsArray = Array.isArray(input);
  const inputObj = !inputIsArray && input && typeof input === 'object' ? input : {};

  const toleranceSec =
    typeof options.durationToleranceSec === 'number' &&
    Number.isFinite(options.durationToleranceSec) &&
    options.durationToleranceSec >= 0
      ? options.durationToleranceSec
      : DEFAULT_TOLERANCE_SEC;

  const sourceAudioDuration =
    options.sourceAudioDuration !== undefined
      ? options.sourceAudioDuration
      : inputObj.sourceAudioDuration;
  const sourceAudioPath =
    options.sourceAudioPath !== undefined
      ? options.sourceAudioPath
      : inputObj.sourceAudioPath;
  const audioSource =
    options.audioSource !== undefined
      ? options.audioSource
      : inputObj.audioSource !== undefined
        ? inputObj.audioSource
        : inputObj.muxedAudioSource;
  const requireOriginalAudio = options.requireOriginalAudio !== false;
  const requireVideo = options.requireVideo !== false;

  /** @type {object[]} */
  const issues = [];

  const rawSegments = inputIsArray ? input : inputObj.segments;
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    issues.push(
      issue({
        code: 'NO_SEGMENTS',
        severity: 'error',
        message: '没有可合成的视频段（segments 为空或不是数组）',
        suggestion: '请提供按时间轴排列的非空 segments 数组后再做合成校验。',
      }),
    );
  }

  const providedSourceDuration = sourceAudioDuration !== undefined && sourceAudioDuration !== null && sourceAudioDuration !== '';
  const sourceDurationNumber = providedSourceDuration ? Number(sourceAudioDuration) : undefined;
  if (providedSourceDuration && !isFinitePositive(sourceDurationNumber)) {
    issues.push(
      issue({
        code: 'INVALID_DURATION',
        severity: 'error',
        message: `原曲时长无效（${String(sourceAudioDuration)}）`,
        suggestion: '请探测原曲得到正有限秒数后再做总时长校验。',
        actual: typeof sourceAudioDuration === 'number' ? sourceAudioDuration : sourceDurationNumber,
      }),
    );
  }

  const list = Array.isArray(rawSegments)
    ? rawSegments.map((seg, i) => normalizeSegment(seg, i + 1))
    : [];

  for (const seg of list) {
    const label = seg.index ?? '?';
    if (seg.startSec !== undefined && !isFiniteNumber(seg.startSec)) {
      issues.push(
        issue({
          code: 'INVALID_DURATION',
          severity: 'error',
          segmentIndex: seg.index ?? null,
          message: `第 ${label} 段起始时间无效（${String(seg.startSec)}）`,
          suggestion: '请检查切点计划中的 start / startSec，确保为有限秒数。',
          actual: seg.startSec,
        }),
      );
    }
    if (seg.endSec !== undefined && !isFiniteNumber(seg.endSec)) {
      issues.push(
        issue({
          code: 'INVALID_DURATION',
          severity: 'error',
          segmentIndex: seg.index ?? null,
          message: `第 ${label} 段结束时间无效（${String(seg.endSec)}）`,
          suggestion: '请检查切点计划中的 end / endSec，确保为有限秒数。',
          actual: seg.endSec,
        }),
      );
    }
    if (
      isFiniteNumber(seg.startSec) &&
      isFiniteNumber(seg.endSec) &&
      seg.endSec < seg.startSec
    ) {
      issues.push(
        issue({
          code: 'INVALID_DURATION',
          severity: 'error',
          segmentIndex: seg.index ?? null,
          message: `第 ${label} 段结束时间早于起始时间（start ${seg.startSec}s，end ${seg.endSec}s）`,
          suggestion: '请修正切点，确保 endSec ≥ startSec，且该段时长为正。',
          expected: seg.startSec,
          actual: seg.endSec,
          delta: seg.endSec - seg.startSec,
        }),
      );
    }
    if (seg.expectedDuration !== undefined && !isFinitePositive(seg.expectedDuration)) {
      issues.push(
        issue({
          code: 'INVALID_DURATION',
          severity: 'error',
          segmentIndex: seg.index ?? null,
          message: `第 ${label} 段期望时长无效（${String(seg.expectedDuration)}）`,
          suggestion: '请检查 expectedDuration / duration，或由 end−start 得到正有限秒数。',
          actual: seg.expectedDuration,
        }),
      );
    }
    if (seg.videoDuration !== undefined && !isFinitePositive(seg.videoDuration)) {
      issues.push(
        issue({
          code: 'INVALID_DURATION',
          severity: 'error',
          segmentIndex: seg.index ?? null,
          message: `第 ${label} 段视频时长无效（${String(seg.videoDuration)}）`,
          suggestion: '请重新探测生成视频，确认 ffprobe 返回正有限秒数。',
          actual: seg.videoDuration,
        }),
      );
    }
  }

  if (list.length > 0) {
    const { normalized } = normalizeIndices(list);
    const seen = new Map();
    for (const seg of normalized) {
      const prev = seen.get(seg.index);
      if (prev) {
        issues.push(
          issue({
            code: 'DUPLICATE_SEGMENT',
            severity: 'error',
            segmentIndex: seg.index,
            message: `段号 ${seg.index} 重复出现`,
            suggestion: '请为每一段使用唯一且连续的段号，去掉或重新编号重复段。',
          }),
        );
      } else {
        seen.set(seg.index, seg);
      }
    }

    const uniqueIndices = [...seen.keys()].sort((a, b) => a - b);
    const maxIndex = uniqueIndices.length ? uniqueIndices[uniqueIndices.length - 1] : 0;
    const minIndex = uniqueIndices.length ? uniqueIndices[0] : 1;
    if (uniqueIndices.length > 0) {
      const missing = [];
      const startAt = 1;
      for (let i = startAt; i <= Math.max(maxIndex, uniqueIndices.length); i++) {
        if (!seen.has(i)) missing.push(i);
      }
      // Holes only: a complete 1..n with duplicates is DUPLICATE_SEGMENT, not a missing index.
      const hole = minIndex !== 1 || maxIndex !== uniqueIndices.length || missing.length > 0;
      if (hole) {
        const shown = missing.length ? missing : [minIndex > 1 ? 1 : maxIndex];
        issues.push(
          issue({
            code: 'MISSING_SEGMENT',
            severity: 'error',
            segmentIndex: shown[0] ?? null,
            message: `段号不连续，缺少第 ${shown.join('、')} 段（存在空洞）`,
            suggestion: '请补齐缺失段，或重新编号使段号成为连续的 1..n。',
          }),
        );
      }
    }

    const inputOrderBroken = list.some((seg, i) => {
      if (i === 0) return false;
      const prev = list[i - 1];
      if (seg.index < prev.index) return true;
      if (isFiniteNumber(seg.startSec) && isFiniteNumber(prev.startSec) && seg.startSec < prev.startSec) {
        return true;
      }
      return false;
    });
    if (inputOrderBroken) {
      const firstBad = list.find((seg, i) => {
        if (i === 0) return false;
        const prev = list[i - 1];
        return seg.index < prev.index || (
          isFiniteNumber(seg.startSec) &&
          isFiniteNumber(prev.startSec) &&
          seg.startSec < prev.startSec
        );
      });
      issues.push(
        issue({
          code: 'SEGMENT_ORDER',
          severity: 'error',
          segmentIndex: firstBad?.index ?? null,
          message: '视频段输入顺序与段号或起始时间升序不一致',
          suggestion: '请按段号（及 startSec）升序排列后再合成，避免切点错位。',
        }),
      );
    }

    const pathOwners = new Map();
    for (const seg of normalized) {
      const key = normalizeVideoPath(seg.videoPath);
      if (!key) continue;
      if (pathOwners.has(key)) {
        issues.push(
          issue({
            code: 'DUPLICATE_VIDEO',
            severity: 'error',
            segmentIndex: seg.index,
            message: `第 ${seg.index} 段与第 ${pathOwners.get(key)} 段使用了同一成片路径（${key}）`,
            suggestion: '请为每段指定不同的视频文件，去掉重复路径后再合成。',
          }),
        );
      } else {
        pathOwners.set(key, seg.index);
      }
    }

    const byIndex = [...normalized].sort((a, b) => a.index - b.index);
    for (let i = 1; i < byIndex.length; i++) {
      const prev = byIndex[i - 1];
      const next = byIndex[i];
      const canCompare =
        isFiniteNumber(prev.startSec) &&
        isFiniteNumber(prev.endSec) &&
        isFiniteNumber(next.startSec) &&
        isFiniteNumber(next.endSec);
      if (!canCompare) continue;
      if (next.startSec < prev.endSec - toleranceSec) {
        const delta = next.startSec - prev.endSec;
        issues.push(
          issue({
            code: 'TIMELINE_OVERLAP',
            severity: 'error',
            segmentIndex: next.index,
            message: `第 ${next.index} 段与第 ${prev.index} 段时间轴重叠 ${Math.abs(delta).toFixed(3)}s（前段结束 ${prev.endSec}s，后段开始 ${next.startSec}s）`,
            suggestion: '请调整切点使相邻段首尾相接，重叠须 ≤ 容差（默认 80ms）。',
            expected: prev.endSec,
            actual: next.startSec,
            delta,
          }),
        );
      } else if (next.startSec > prev.endSec + toleranceSec) {
        const delta = next.startSec - prev.endSec;
        issues.push(
          issue({
            code: 'TIMELINE_GAP',
            severity: 'error',
            segmentIndex: next.index,
            message: `第 ${prev.index} 段与第 ${next.index} 段之间存在 ${delta.toFixed(3)}s 空洞（前段结束 ${prev.endSec}s，后段开始 ${next.startSec}s）`,
            suggestion: '请补齐中间缺失的镜头或修正切点，使相邻段在容差内首尾相接。',
            expected: prev.endSec,
            actual: next.startSec,
            delta,
          }),
        );
      }
    }

    if (requireVideo) {
      for (const seg of normalized) {
        const hasPath = isNonEmptyPath(seg.videoPath);
        const hasDuration = isFinitePositive(seg.videoDuration);
        if (!hasPath && !hasDuration) {
          issues.push(
            issue({
              code: 'MISSING_VIDEO',
              severity: 'error',
              segmentIndex: seg.index,
              message: `第 ${seg.index} 段缺少视频（未提供 videoPath 或正数 videoDuration）`,
              suggestion: '请为该段填入生成视频路径或探测到的视频时长；或关闭 --require-video 仅做其它检查。',
            }),
          );
        }
      }
    }
  }

  let expectedTotalDuration;
  if (list.length > 0) {
    const { normalized } = normalizeIndices(list);
    const byIndex = [...normalized].sort((a, b) => a.index - b.index);
    const first = byIndex[0];
    const last = byIndex[byIndex.length - 1];
    if (isFiniteNumber(first?.startSec) && isFiniteNumber(last?.endSec)) {
      expectedTotalDuration = last.endSec - first.startSec;
    } else {
      let sum = 0;
      let counted = 0;
      for (const seg of byIndex) {
        if (isFinitePositive(seg.expectedDuration)) {
          sum += seg.expectedDuration;
          counted += 1;
        } else if (isFiniteNumber(seg.startSec) && isFiniteNumber(seg.endSec) && seg.endSec > seg.startSec) {
          sum += seg.endSec - seg.startSec;
          counted += 1;
        }
      }
      if (counted > 0) expectedTotalDuration = sum;
    }
  }

  let actualTotalDuration;
  if (isFinitePositive(sourceDurationNumber)) {
    actualTotalDuration = sourceDurationNumber;
  } else if (list.length > 0) {
    const videoSum = list.reduce((acc, seg) => acc + (isFinitePositive(seg.videoDuration) ? seg.videoDuration : 0), 0);
    const videoCount = list.filter((seg) => isFinitePositive(seg.videoDuration)).length;
    if (videoCount > 0) actualTotalDuration = videoSum;
  }

  if (
    isFinitePositive(sourceDurationNumber) &&
    isFiniteNumber(expectedTotalDuration) &&
    Math.abs(expectedTotalDuration - sourceDurationNumber) > toleranceSec
  ) {
    const delta = expectedTotalDuration - sourceDurationNumber;
    issues.push(
      issue({
        code: 'TOTAL_DURATION_MISMATCH',
        severity: 'error',
        message: `期望总时长与原曲时长偏差 ${delta.toFixed(3)}s（时间轴 ${expectedTotalDuration}s，原曲 ${sourceDurationNumber}s）`,
        suggestion: '请检查切点是否覆盖整首原曲，或补齐/裁切视频段使总时长误差 ≤ 容差（默认 80ms）。',
        expected: expectedTotalDuration,
        actual: sourceDurationNumber,
        delta,
      }),
    );
  }

  const hasPathEvidence = isNonEmptyPath(sourceAudioPath);
  const hasDurationEvidence = isFinitePositive(sourceDurationNumber);
  const hasOriginalEvidence = hasPathEvidence || hasDurationEvidence || audioSource === 'original';

  if (audioSource === 'generated') {
    issues.push(
      issue({
        code: 'GENERATED_AUDIO_MASTER',
        severity: 'error',
        message: '成片母带音轨来自模型生成，而不是原曲',
        suggestion: '请用原始音乐作为唯一母带音轨重新封装（muxOriginalAudio），不要保留生成音轨。',
      }),
    );
  } else if (audioSource === 'unknown') {
    if (hasPathEvidence || hasDurationEvidence) {
      issues.push(
        issue({
          code: 'UNKNOWN_AUDIO_MASTER',
          severity: 'warning',
          message: '音轨来源标记为未知，但已提供原曲路径或时长',
          suggestion: '请将 audioSource 标为 original，并确认合成时用原曲覆盖生成音轨。',
        }),
      );
    } else if (requireOriginalAudio) {
      issues.push(
        issue({
          code: 'UNKNOWN_AUDIO_MASTER',
          severity: 'error',
          message: '音轨来源未知，且没有原曲路径或时长作为证据',
          suggestion: '请提供 sourceAudioPath 或 sourceAudioDuration，并将 audioSource 标为 original。',
        }),
      );
    }
  }

  if (requireOriginalAudio && !hasOriginalEvidence) {
    issues.push(
      issue({
        code: 'MISSING_SOURCE_AUDIO',
        severity: 'error',
        message: '缺少原曲作为唯一母带音轨的证据（无路径、无正时长，且未标记为 original）',
        suggestion: '请提供 sourceAudioPath 或 sourceAudioDuration，或将 audioSource 设为 original。',
      }),
    );
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const ok = errorCount === 0;
  const countLabel = list.length ? `${list.length} 段` : '0 段';
  const durationBits = [];
  if (isFiniteNumber(expectedTotalDuration)) durationBits.push(`期望总时长 ${expectedTotalDuration}s`);
  if (isFiniteNumber(actualTotalDuration)) {
    durationBits.push(
      isFinitePositive(sourceDurationNumber)
        ? `原曲 ${actualTotalDuration}s`
        : `视频合计 ${actualTotalDuration}s`,
    );
  }
  const durationText = durationBits.length ? `，${durationBits.join('，')}` : '';

  let summary;
  if (ok && warningCount === 0) {
    summary = `合成校验通过（${countLabel}${durationText}，容差 ${toleranceSec}s，无问题）`;
  } else if (ok) {
    summary = `合成校验通过，但有 ${warningCount} 条警告（${countLabel}${durationText}，容差 ${toleranceSec}s）`;
  } else {
    const mainCodes = [...new Set(issues.filter((i) => i.severity === 'error').map((i) => i.code))];
    summary =
      `合成校验未通过：${errorCount} 条错误` +
      (warningCount ? `，${warningCount} 条警告` : '') +
      (mainCodes.length ? `（${mainCodes.join('、')}）` : '') +
      `（容差 ${toleranceSec}s）`;
  }

  /** @type {object} */
  const report = { ok, toleranceSec, issues, summary };
  if (isFiniteNumber(expectedTotalDuration)) report.expectedTotalDuration = expectedTotalDuration;
  if (isFiniteNumber(actualTotalDuration)) report.actualTotalDuration = actualTotalDuration;
  return report;
}

/**
 * @param {{ ok?: boolean, toleranceSec?: number, issues?: object[], summary?: string, expectedTotalDuration?: number, actualTotalDuration?: number }} report
 * @returns {string}
 */
export function formatComposeReport(report) {
  const lines = [];
  lines.push(report?.summary || (report?.ok ? '合成校验通过' : '合成校验未通过'));
  if (report?.toleranceSec != null) lines.push(`toleranceSec=${report.toleranceSec}`);
  lines.push(`ok=${report?.ok}`);
  if (report?.expectedTotalDuration != null) {
    lines.push(`expectedTotalDuration=${report.expectedTotalDuration}`);
  }
  if (report?.actualTotalDuration != null) {
    lines.push(`actualTotalDuration=${report.actualTotalDuration}`);
  }
  if (!report?.issues?.length) {
    lines.push('(无 issues)');
    return lines.join('\n');
  }
  for (const item of report.issues) {
    const seg = item.segmentIndex == null ? '全局' : `SEG ${item.segmentIndex}`;
    lines.push(`[${item.severity}] ${item.code} @ ${seg}: ${item.message}`);
    if (item.suggestion) lines.push(`  建议: ${item.suggestion}`);
    if (item.expected != null || item.actual != null || item.delta != null) {
      lines.push(
        `  expected=${item.expected ?? '-'} actual=${item.actual ?? '-'} delta=${item.delta ?? '-'}`,
      );
    }
  }
  return lines.join('\n');
}
