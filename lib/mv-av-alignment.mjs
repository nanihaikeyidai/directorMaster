/**
 * Pure MV audio/video alignment checker.
 * Callers supply measured durations; no ffprobe inside this module.
 */

const DEFAULT_TOLERANCE_SEC = 0.08;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} tol
 */
function exceeds(a, b, tol) {
  return Math.abs(a - b) > tol;
}

/**
 * @typedef {{
 *   index: number,
 *   expectedDuration: number,
 *   audioDuration?: number,
 *   videoDuration?: number,
 * }} AlignmentSegmentInput
 *
 * @typedef {{
 *   durationToleranceSec?: number,
 *   leadSilenceSec?: number,
 *   measuredLeadSilenceSec?: number,
 *   requireAudio?: boolean,
 *   requireVideo?: boolean,
 * }} AlignmentOptions
 *
 * @typedef {{
 *   code: string,
 *   severity: 'error' | 'warning',
 *   segmentIndex: number | null,
 *   message: string,
 *   suggestion: string,
 *   expected?: number,
 *   actual?: number,
 *   delta?: number,
 * }} AlignmentIssue
 *
 * @typedef {{
 *   ok: boolean,
 *   toleranceSec: number,
 *   issues: AlignmentIssue[],
 *   summary: string,
 * }} AlignmentReport
 */

/**
 * @param {AlignmentSegmentInput[]} segments
 * @param {AlignmentOptions} [options]
 * @returns {AlignmentReport}
 */
export function checkAvAlignment(segments, options = {}) {
  const toleranceSec =
    typeof options.durationToleranceSec === 'number' &&
    Number.isFinite(options.durationToleranceSec) &&
    options.durationToleranceSec >= 0
      ? options.durationToleranceSec
      : DEFAULT_TOLERANCE_SEC;
  const requireAudio = options.requireAudio !== false;
  const requireVideo = options.requireVideo === true;

  /** @type {AlignmentIssue[]} */
  const issues = [];
  const list = Array.isArray(segments) ? segments : [];

  for (const seg of list) {
    const index = seg?.index;
    const expected = seg?.expectedDuration;
    const audio = seg?.audioDuration;
    const video = seg?.videoDuration;
    const hasAudio = audio !== undefined && audio !== null;
    const hasVideo = video !== undefined && video !== null;

    // INVALID_DURATION on expected / provided audio / provided video
    if (!isFinitePositive(expected)) {
      issues.push({
        code: 'INVALID_DURATION',
        severity: 'error',
        segmentIndex: index ?? null,
        message: `第 ${index ?? '?'} 段期望时长无效（${String(expected)}）`,
        suggestion: '请检查切点计划中的 expectedDuration / duration，确保为正有限秒数。',
        expected: typeof expected === 'number' ? expected : undefined,
        actual: typeof expected === 'number' ? expected : undefined,
      });
      // still check missing flags below, but skip mismatch math
    }

    if (hasAudio && !isFinitePositive(audio)) {
      issues.push({
        code: 'INVALID_DURATION',
        severity: 'error',
        segmentIndex: index ?? null,
        message: `第 ${index ?? '?'} 段音频时长无效（${String(audio)}）`,
        suggestion: '请重新探测导出的 wav，确认 ffprobe 返回正有限秒数。',
        actual: typeof audio === 'number' ? audio : undefined,
      });
    }

    if (hasVideo && !isFinitePositive(video)) {
      issues.push({
        code: 'INVALID_DURATION',
        severity: 'error',
        segmentIndex: index ?? null,
        message: `第 ${index ?? '?'} 段视频时长无效（${String(video)}）`,
        suggestion: '请重新探测生成视频，确认 ffprobe 返回正有限秒数。',
        actual: typeof video === 'number' ? video : undefined,
      });
    }

    if (!hasAudio && requireAudio) {
      issues.push({
        code: 'MISSING_AUDIO',
        severity: 'warning',
        segmentIndex: index ?? null,
        message: `第 ${index ?? '?'} 段缺少音频时长（未提供 audioDuration）`,
        suggestion: '导出前请探测每段 wav 时长并填入 manifest；或关闭 --require-audio 仅做其它检查。',
      });
    }

    if (!hasVideo && requireVideo) {
      issues.push({
        code: 'MISSING_VIDEO',
        severity: 'warning',
        segmentIndex: index ?? null,
        message: `第 ${index ?? '?'} 段缺少视频时长（未提供 videoDuration）`,
        suggestion: '合成前请探测每段生成视频时长并填入 manifest；或传入 --require-video。',
      });
    }

    const expectedOk = isFinitePositive(expected);
    const audioOk = hasAudio && isFinitePositive(audio);
    const videoOk = hasVideo && isFinitePositive(video);

    if (expectedOk && audioOk && exceeds(audio, expected, toleranceSec)) {
      const delta = audio - expected;
      issues.push({
        code: 'AUDIO_DURATION_MISMATCH',
        severity: 'error',
        segmentIndex: index ?? null,
        message: `第 ${index ?? '?'} 段音频时长与切点期望偏差 ${delta.toFixed(3)}s（期望 ${expected}s，实际 ${audio}s）`,
        suggestion: '请按切点计划重新导出该段 wav，或修正切点后重切；误差须 ≤ 80ms。',
        expected,
        actual: audio,
        delta,
      });
    }

    if (expectedOk && videoOk) {
      const videoShort = expected - video > toleranceSec;
      const audioAligned =
        !audioOk || Math.abs(audio - expected) <= toleranceSec;

      if (videoShort && audioAligned) {
        const delta = video - expected;
        issues.push({
          code: 'TAIL_TRUNCATION',
          severity: 'error',
          segmentIndex: index ?? null,
          message: `第 ${index ?? '?'} 段视频尾部疑似截断：视频比期望短 ${(expected - video).toFixed(3)}s（期望 ${expected}s，视频 ${video}s）`,
          suggestion: '请检查生成任务是否被提前结束，或重新生成该段并确认 total_frames / duration 与切点一致。',
          expected,
          actual: video,
          delta,
        });
      } else if (exceeds(video, expected, toleranceSec)) {
        const delta = video - expected;
        issues.push({
          code: 'VIDEO_DURATION_MISMATCH',
          severity: 'error',
          segmentIndex: index ?? null,
          message: `第 ${index ?? '?'} 段视频时长与切点期望偏差 ${delta.toFixed(3)}s（期望 ${expected}s，实际 ${video}s）`,
          suggestion: '请按切点期望调整生成时长或裁剪视频，使误差 ≤ 80ms。',
          expected,
          actual: video,
          delta,
        });
      }
    }

    if (audioOk && videoOk && exceeds(video, audio, toleranceSec)) {
      // Prefer TAIL_TRUNCATION when already reported for short video + aligned audio
      const alreadyTail = issues.some(
        (i) =>
          i.code === 'TAIL_TRUNCATION' &&
          i.segmentIndex === (index ?? null),
      );
      if (!alreadyTail) {
        const delta = video - audio;
        issues.push({
          code: 'AV_MISMATCH',
          severity: 'error',
          segmentIndex: index ?? null,
          message: `第 ${index ?? '?'} 段音画时长不一致，偏差 ${delta.toFixed(3)}s（音频 ${audio}s，视频 ${video}s）`,
          suggestion: '请统一以切点期望为准：重导出音频或重生成/裁剪视频，使音画时长对齐。',
          expected: audio,
          actual: video,
          delta,
        });
      }
    }
  }

  // Lead silence (project-level)
  const leadExpected = options.leadSilenceSec;
  const leadMeasured = options.measuredLeadSilenceSec;
  if (isFiniteNumber(leadExpected) && isFiniteNumber(leadMeasured)) {
    if (leadExpected < 0 || leadMeasured < 0) {
      issues.push({
        code: 'INVALID_DURATION',
        severity: 'error',
        segmentIndex: null,
        message: `前置静音参数无效（期望 ${leadExpected}s，实测 ${leadMeasured}s）`,
        suggestion: 'leadSilenceSec / measuredLeadSilenceSec 须为非负有限秒数。',
        expected: leadExpected,
        actual: leadMeasured,
      });
    } else if (exceeds(leadMeasured, leadExpected, toleranceSec)) {
      const delta = leadMeasured - leadExpected;
      issues.push({
        code: 'LEAD_SILENCE_MISMATCH',
        severity: 'error',
        segmentIndex: null,
        message: `首段前置静音偏差 ${delta.toFixed(3)}s（期望 ${leadExpected}s，实测 ${leadMeasured}s）`,
        suggestion: '请按 vocalStartOnTrack / leadSilenceSec 重写 SOURCE TRACK 前置静音，或修正标注后重导出 SEG 01。',
        expected: leadExpected,
        actual: leadMeasured,
        delta,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const ok = errorCount === 0;
  let summary;
  if (ok && warningCount === 0) {
    summary = `音画对齐检查通过（容差 ${toleranceSec}s，无问题）`;
  } else if (ok) {
    summary = `音画对齐检查通过，但有 ${warningCount} 条警告（容差 ${toleranceSec}s）`;
  } else {
    summary = `音画对齐检查未通过：${errorCount} 条错误` +
      (warningCount ? `，${warningCount} 条警告` : '') +
      `（容差 ${toleranceSec}s）`;
  }

  return { ok, toleranceSec, issues, summary };
}

/**
 * @param {AlignmentReport} report
 * @returns {string}
 */
export function formatAlignmentReport(report) {
  const lines = [];
  lines.push(report.summary || (report.ok ? '通过' : '未通过'));
  lines.push(`toleranceSec=${report.toleranceSec}`);
  lines.push(`ok=${report.ok}`);
  if (!report.issues?.length) {
    lines.push('(无 issues)');
    return lines.join('\n');
  }
  for (const issue of report.issues) {
    const seg =
      issue.segmentIndex == null ? '全局' : `SEG ${issue.segmentIndex}`;
    lines.push(
      `[${issue.severity}] ${issue.code} @ ${seg}: ${issue.message}`,
    );
    lines.push(`  建议: ${issue.suggestion}`);
    if (issue.expected != null || issue.actual != null || issue.delta != null) {
      lines.push(
        `  expected=${issue.expected ?? '-'} actual=${issue.actual ?? '-'} delta=${issue.delta ?? '-'}`,
      );
    }
  }
  return lines.join('\n');
}
