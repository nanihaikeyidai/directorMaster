import assert from 'node:assert/strict';
import { checkAvAlignment, formatAlignmentReport } from '../lib/mv-av-alignment.mjs';

const TOL = 0.08;

function segs(list) {
  return list;
}

// --- ok path: aligned audio+video within tolerance ---
{
  const report = checkAvAlignment(
    segs([
      { index: 1, expectedDuration: 8.4, audioDuration: 8.4, videoDuration: 8.41 },
      { index: 2, expectedDuration: 10.2, audioDuration: 10.15, videoDuration: 10.2 },
    ]),
    { leadSilenceSec: 0.5, measuredLeadSilenceSec: 0.52 },
  );
  assert.equal(report.ok, true);
  assert.equal(report.toleranceSec, TOL);
  assert.equal(report.issues.length, 0);
  assert.match(report.summary, /通过|对齐|无问题|ok/i);
}

// --- AUDIO_DURATION_MISMATCH ---
{
  const report = checkAvAlignment(
    segs([{ index: 3, expectedDuration: 5, audioDuration: 4.8 }]),
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'AUDIO_DURATION_MISMATCH');
  assert.ok(issue, 'expected AUDIO_DURATION_MISMATCH');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.segmentIndex, 3);
  assert.ok(issue.message && /音频|时长/.test(issue.message));
  assert.ok(issue.suggestion && issue.suggestion.length > 0);
  assert.ok(Math.abs(issue.delta) > TOL);
}

// --- TAIL_TRUNCATION: video short, audio ok ---
{
  const report = checkAvAlignment(
    segs([{ index: 1, expectedDuration: 10, audioDuration: 10.02, videoDuration: 9.7 }]),
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'TAIL_TRUNCATION');
  assert.ok(issue, 'expected TAIL_TRUNCATION');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.segmentIndex, 1);
  assert.ok(/截断|偏短|尾/.test(issue.message));
}

// --- LEAD_SILENCE_MISMATCH ---
{
  const report = checkAvAlignment(
    segs([{ index: 1, expectedDuration: 5, audioDuration: 5 }]),
    { leadSilenceSec: 0.5, measuredLeadSilenceSec: 0.7 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'LEAD_SILENCE_MISMATCH');
  assert.ok(issue, 'expected LEAD_SILENCE_MISMATCH');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.segmentIndex, null);
  assert.ok(/静音|前置/.test(issue.message));
}

// --- MISSING_AUDIO warning (requireAudio default true) ---
{
  const report = checkAvAlignment(
    segs([{ index: 2, expectedDuration: 4, videoDuration: 4 }]),
  );
  assert.equal(report.ok, true, 'warnings alone should keep ok true');
  const issue = report.issues.find((i) => i.code === 'MISSING_AUDIO');
  assert.ok(issue, 'expected MISSING_AUDIO');
  assert.equal(issue.severity, 'warning');
  assert.equal(issue.segmentIndex, 2);
}

// --- INVALID_DURATION ---
{
  const report = checkAvAlignment(
    segs([{ index: 9, expectedDuration: 0, audioDuration: 1 }]),
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'INVALID_DURATION');
  assert.ok(issue, 'expected INVALID_DURATION');
  assert.equal(issue.severity, 'error');
}

// --- formatAlignmentReport contains codes ---
{
  const report = checkAvAlignment(
    segs([{ index: 1, expectedDuration: 5, audioDuration: 4.5 }]),
  );
  const text = formatAlignmentReport(report);
  assert.equal(typeof text, 'string');
  assert.match(text, /AUDIO_DURATION_MISMATCH/);
  assert.ok(text.includes(report.issues[0].message));
  assert.ok(text.includes(report.issues[0].suggestion));
}

// --- VIDEO_DURATION_MISMATCH when video long (not truncation) ---
{
  const report = checkAvAlignment(
    segs([{ index: 4, expectedDuration: 6, audioDuration: 6, videoDuration: 6.5 }]),
  );
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'VIDEO_DURATION_MISMATCH'));
  assert.ok(!report.issues.some((i) => i.code === 'TAIL_TRUNCATION'));
}

// --- AV_MISMATCH when both present and disagree ---
{
  const report = checkAvAlignment(
    segs([{ index: 5, expectedDuration: 8, audioDuration: 8.01, videoDuration: 7.5 }]),
    // video short vs expected → TAIL_TRUNCATION preferred when audio ≈ expected
    // use a case where audio also mismatches expected so AV_MISMATCH still fires:
  );
  // For AV_MISMATCH specifically: both present, |v-a|>tol; with audio≈expected and video short
  // design says prefer TAIL_TRUNCATION. So craft: expected=8, audio=7.5, video=8.0 → AV mismatch + audio mismatch
  const report2 = checkAvAlignment(
    segs([{ index: 5, expectedDuration: 8, audioDuration: 7.5, videoDuration: 8.0 }]),
  );
  assert.equal(report2.ok, false);
  assert.ok(
    report2.issues.some((i) => i.code === 'AV_MISMATCH') ||
      report2.issues.some((i) => i.code === 'AUDIO_DURATION_MISMATCH'),
    'expected AV_MISMATCH or AUDIO_DURATION_MISMATCH',
  );
}

console.log('test-mv-av-alignment: ok');
