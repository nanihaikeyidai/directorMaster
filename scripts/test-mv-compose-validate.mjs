import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMvCompose, formatComposeReport } from '../lib/mv-compose-validate.mjs';
import { muxOriginalAudio } from '../lib/mv-cloud-generate.mjs';

const TOL = 0.08;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');

function segs(list) {
  return list;
}

const happySegs = [
  { index: 1, startSec: 0, endSec: 8, videoPath: 'seg-01.mp4', videoDuration: 8 },
  { index: 2, startSec: 8, endSec: 16, videoPath: 'seg-02.mp4', videoDuration: 8 },
];

// --- 1. Happy path: contiguous segments, unique paths, original audio matches total ---
{
  const report = checkMvCompose(
    segs([
      ...happySegs,
      { index: 3, startSec: 16, endSec: 24.05, videoPath: 'seg-03.mp4', videoDuration: 8.05 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 24.05 },
  );
  assert.equal(report.ok, true);
  assert.equal(report.toleranceSec, TOL);
  assert.equal(report.issues.length, 0);
  assert.match(report.summary, /通过|对齐|无问题|ok/i);
}

// --- 2. NO_SEGMENTS: empty or invalid input ---
{
  for (const input of [[], null, undefined, {}, 'nope', { segments: null }]) {
    const report = checkMvCompose(input, { audioSource: 'original', sourceAudioDuration: 8 });
    assert.equal(report.ok, false, `expected ok=false for ${JSON.stringify(input)}`);
    const issue = report.issues.find((i) => i.code === 'NO_SEGMENTS');
    assert.ok(issue, `expected NO_SEGMENTS for ${JSON.stringify(input)}`);
    assert.equal(issue.severity, 'error');
  }
}

// --- 3. DUPLICATE_SEGMENT: two index:1 ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8, videoPath: 'a.mp4', videoDuration: 8 },
      { index: 1, startSec: 8, endSec: 16, videoPath: 'b.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'DUPLICATE_SEGMENT');
  assert.ok(issue, 'expected DUPLICATE_SEGMENT');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.segmentIndex, 1);
  assert.ok(issue.message && /[\u4e00-\u9fff]/.test(issue.message), 'Chinese message');
}

// --- 4. MISSING_SEGMENT: indices 1 and 3 (no 2) ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8, videoPath: 'a.mp4', videoDuration: 8 },
      { index: 3, startSec: 16, endSec: 24, videoPath: 'c.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 24 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'MISSING_SEGMENT');
  assert.ok(issue, 'expected MISSING_SEGMENT');
  assert.equal(issue.severity, 'error');
  assert.ok(
    /缺|空洞/.test(issue.message) || issue.segmentIndex === 2 || /2/.test(issue.message),
    'should mention a hole or segment 2, got ' + issue.message,
  );
}

// --- 5. SEGMENT_ORDER: input order [2,1] with starts 8 then 0 ---
{
  const report = checkMvCompose(
    segs([
      { index: 2, startSec: 8, endSec: 16, videoPath: 'b.mp4', videoDuration: 8 },
      { index: 1, startSec: 0, endSec: 8, videoPath: 'a.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'SEGMENT_ORDER');
  assert.ok(issue, 'expected SEGMENT_ORDER');
  assert.equal(issue.severity, 'error');
}

// --- 6. DUPLICATE_VIDEO: same videoPath on two segments ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8, videoPath: 'same.mp4', videoDuration: 8 },
      { index: 2, startSec: 8, endSec: 16, videoPath: 'same.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'DUPLICATE_VIDEO');
  assert.ok(issue, 'expected DUPLICATE_VIDEO');
  assert.equal(issue.severity, 'error');
}

// --- 7. TIMELINE_GAP: seg1 ends 8.0, seg2 starts 8.5 (tol 0.08) ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8.0, videoPath: 'a.mp4', videoDuration: 8 },
      { index: 2, startSec: 8.5, endSec: 16, videoPath: 'b.mp4', videoDuration: 7.5 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'TIMELINE_GAP');
  assert.ok(issue, 'expected TIMELINE_GAP');
  assert.equal(issue.severity, 'error');
}

// --- 8. TIMELINE_OVERLAP: seg2 starts before seg1 ends beyond tol ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8.5, videoPath: 'a.mp4', videoDuration: 8.5 },
      { index: 2, startSec: 8.0, endSec: 16, videoPath: 'b.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'TIMELINE_OVERLAP');
  assert.ok(issue, 'expected TIMELINE_OVERLAP');
  assert.equal(issue.severity, 'error');
}

// --- 9. Tiny abut (8.00 then 8.05) is NOT a gap ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8.0, videoPath: 'a.mp4', videoDuration: 8 },
      { index: 2, startSec: 8.05, endSec: 16, videoPath: 'b.mp4', videoDuration: 7.95 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, true);
  assert.ok(!report.issues.some((i) => i.code === 'TIMELINE_GAP' || i.code === 'TIMELINE_OVERLAP'));
}

// --- 10. TOTAL_DURATION_MISMATCH: sourceAudioDuration 20, timeline 0–10 ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 5, videoPath: 'a.mp4', videoDuration: 5 },
      { index: 2, startSec: 5, endSec: 10, videoPath: 'b.mp4', videoDuration: 5 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 20 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'TOTAL_DURATION_MISMATCH');
  assert.ok(issue, 'expected TOTAL_DURATION_MISMATCH');
  assert.equal(issue.severity, 'error');
  assert.ok(issue.delta != null && Math.abs(issue.delta) > TOL, 'expected delta beyond tolerance');
}

// --- 11. MISSING_SOURCE_AUDIO: default requireOriginalAudio, no evidence ---
{
  const report = checkMvCompose(segs(happySegs));
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'MISSING_SOURCE_AUDIO');
  assert.ok(issue, 'expected MISSING_SOURCE_AUDIO');
  assert.equal(issue.severity, 'error');

  const skipped = checkMvCompose(segs(happySegs), { requireOriginalAudio: false });
  assert.ok(
    !skipped.issues.some((i) => i.code === 'MISSING_SOURCE_AUDIO' && i.severity === 'error'),
    'requireOriginalAudio false should not fail with MISSING_SOURCE_AUDIO',
  );
  assert.equal(skipped.ok, true, 'requireOriginalAudio false should not fail the report by itself');
}

// --- 12. GENERATED_AUDIO_MASTER: error even if path present ---
{
  const report = checkMvCompose(segs(happySegs), {
    audioSource: 'generated',
    sourceAudioPath: 'song.wav',
    sourceAudioDuration: 16,
  });
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'GENERATED_AUDIO_MASTER');
  assert.ok(issue, 'expected GENERATED_AUDIO_MASTER');
  assert.equal(issue.severity, 'error');
  assert.ok(/原曲|母带|生成/.test(issue.message), 'message should mention 原曲/母带/生成');
}

// --- 13. UNKNOWN_AUDIO_MASTER: warning with evidence; error without ---
{
  const warned = checkMvCompose(segs(happySegs), {
    audioSource: 'unknown',
    sourceAudioPath: 'song.wav',
    sourceAudioDuration: 16,
  });
  const warning = warned.issues.find((i) => i.code === 'UNKNOWN_AUDIO_MASTER');
  assert.ok(warning, 'expected UNKNOWN_AUDIO_MASTER warning when path/duration present');
  assert.equal(warning.severity, 'warning');
  assert.equal(warned.ok, true, 'warning alone should keep ok true');

  const failed = checkMvCompose(segs(happySegs), { audioSource: 'unknown' });
  const error = failed.issues.find((i) => i.code === 'UNKNOWN_AUDIO_MASTER');
  assert.ok(error, 'expected UNKNOWN_AUDIO_MASTER error when no evidence');
  assert.equal(error.severity, 'error');
  assert.equal(failed.ok, false);
}

// --- 14. MISSING_VIDEO: default requireVideo, no path/duration ---
{
  const report = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8 },
      { index: 2, startSec: 8, endSec: 16, videoPath: 'b.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'MISSING_VIDEO');
  assert.ok(issue, 'expected MISSING_VIDEO');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.segmentIndex, 1);

  const skipped = checkMvCompose(
    segs([
      { index: 1, startSec: 0, endSec: 8 },
      { index: 2, startSec: 8, endSec: 16, videoPath: 'b.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16, requireVideo: false },
  );
  assert.ok(!skipped.issues.some((i) => i.code === 'MISSING_VIDEO'));
  assert.equal(skipped.ok, true);
}

// --- 15. INVALID_DURATION: end < start or expectedDuration 0/NaN ---
{
  const endBeforeStart = checkMvCompose(
    segs([{ index: 1, startSec: 8, endSec: 3, videoPath: 'a.mp4', videoDuration: 5 }]),
    { requireOriginalAudio: false },
  );
  assert.equal(endBeforeStart.ok, false);
  assert.ok(endBeforeStart.issues.some((i) => i.code === 'INVALID_DURATION' && i.severity === 'error'));

  const zeroExpected = checkMvCompose(
    segs([{ index: 1, startSec: 0, endSec: 8, expectedDuration: 0, videoPath: 'a.mp4', videoDuration: 8 }]),
    { requireOriginalAudio: false },
  );
  assert.equal(zeroExpected.ok, false);
  assert.ok(zeroExpected.issues.some((i) => i.code === 'INVALID_DURATION'));

  const nanExpected = checkMvCompose(
    segs([{ index: 1, startSec: 0, endSec: 8, expectedDuration: Number.NaN, videoPath: 'a.mp4', videoDuration: 8 }]),
    { requireOriginalAudio: false },
  );
  assert.equal(nanExpected.ok, false);
  assert.ok(nanExpected.issues.some((i) => i.code === 'INVALID_DURATION'));
}

// --- 16. formatComposeReport ---
{
  const okReport = checkMvCompose(segs(happySegs), {
    audioSource: 'original',
    sourceAudioDuration: 16,
  });
  const okText = formatComposeReport(okReport);
  assert.equal(typeof okText, 'string');
  assert.ok(okText.trim().length > 0);

  const badReport = checkMvCompose(segs([]));
  const badText = formatComposeReport(badReport);
  assert.ok(
    /NO_SEGMENTS|段/.test(badText) || (badReport.issues[0] && badText.includes(badReport.issues[0].message)),
    'failed report should include a code or Chinese issue text',
  );
}

// --- 17. Aliases: muxedAudioSource, start/end/duration ---
{
  const report = checkMvCompose({
    muxedAudioSource: 'original',
    sourceAudioDuration: 16,
    segments: [
      { index: 1, start: 0, end: 8, duration: 8, videoPath: 'a.mp4', videoDuration: 8 },
      { index: 2, start: 8, end: 16, duration: 8, videoPath: 'b.mp4', videoDuration: 8 },
    ],
  });
  assert.equal(report.ok, true, 'alias input should pass when times add up, issues=' + JSON.stringify(report.issues));
  assert.equal(report.issues.length, 0);
}

// --- 0-based indices normalize and should not be flagged as a hole ---
{
  const report = checkMvCompose(
    segs([
      { index: 0, startSec: 0, endSec: 8, videoPath: 'a.mp4', videoDuration: 8 },
      { index: 1, startSec: 8, endSec: 16, videoPath: 'b.mp4', videoDuration: 8 },
    ]),
    { audioSource: 'original', sourceAudioDuration: 16 },
  );
  assert.equal(report.ok, true, 'valid 0-based list should pass, issues=' + JSON.stringify(report.issues));
  assert.ok(!report.issues.some((i) => i.code === 'MISSING_SEGMENT'));
}

// --- CLI smoke: ok fixture exit 0, bad fixture exit 1 ---
{
  const okSpawn = spawnSync(
    process.execPath,
    [cliPath, 'mv-compose-check', '--manifest', 'examples/mv-compose-fixture.json'],
    { encoding: 'utf8', cwd: repoRoot },
  );
  assert.equal(okSpawn.status, 0, 'CLI ok fixture exit 0, stderr=' + okSpawn.stderr + ' stdout=' + okSpawn.stdout);
  const okParsed = JSON.parse(okSpawn.stdout);
  assert.equal(okParsed.ok, true);

  const badSpawn = spawnSync(
    process.execPath,
    [cliPath, 'mv-compose-check', '--manifest', 'examples/mv-compose-fixture-bad.json'],
    { encoding: 'utf8', cwd: repoRoot },
  );
  assert.equal(badSpawn.status, 1, 'CLI bad fixture exit 1, stderr=' + badSpawn.stderr + ' stdout=' + badSpawn.stdout);
  const badParsed = JSON.parse(badSpawn.stdout);
  assert.equal(badParsed.ok, false);
  assert.ok(
    badParsed.issues.some((i) => i.code === 'MISSING_SEGMENT' || i.code === 'GENERATED_AUDIO_MASTER'),
  );
}

// --- muxOriginalAudio preflight: missing audio / duplicate paths throw before ffmpeg ---
{
  let missingThrew = false;
  try {
    muxOriginalAudio({
      videoPaths: ['seg-01.mp4', 'seg-02.mp4'],
      audioPath: '',
      outPath: path.join(repoRoot, 'tmp-mux-missing.mp4'),
    });
  } catch (error) {
    missingThrew = true;
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(
      /缺少原音频|MISSING_SOURCE_AUDIO|原曲|合成/.test(message),
      'missing audio should fail with existing or compose message, got: ' + message,
    );
    assert.ok(!/concat failed|mux failed/i.test(message), 'must not reach ffmpeg: ' + message);
  }
  assert.ok(missingThrew, 'muxOriginalAudio should throw when audioPath is missing');

  let dupThrew = false;
  try {
    muxOriginalAudio({
      videoPaths: ['same.mp4', 'same.mp4'],
      audioPath: 'song.wav',
      outPath: path.join(repoRoot, 'tmp-mux-dup.mp4'),
    });
  } catch (error) {
    dupThrew = true;
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(/DUPLICATE_VIDEO|重复/.test(message), 'duplicate paths should be rejected, got: ' + message);
    assert.ok(!/concat failed|mux failed/i.test(message), 'must not reach ffmpeg: ' + message);
  }
  assert.ok(dupThrew, 'muxOriginalAudio should throw on duplicate videoPaths');
}

console.log('test-mv-compose-validate: ok');
