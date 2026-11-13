import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildComposeSegments,
  normalizeComposeAudioMode,
  normalizeComposePurpose,
  planMvComposeGate,
} from '../lib/mv-compose-gate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');

const happy = {
  audioMode: 'source',
  purpose: 'export',
  trimStart: 0,
  trimEnd: 16,
  sourceAudioPath: 'song.wav',
  sourceAudioDuration: 90,
  cuts: [8],
  videos: ['seg-01.mp4', 'seg-02.mp4'],
  segments: [
    { index: 1, startSec: 0, endSec: 8, videoPath: 'seg-01.mp4', videoDuration: 8 },
    { index: 2, startSec: 8, endSec: 16, videoPath: 'seg-02.mp4', videoDuration: 8 },
  ],
};

// --- normalize helpers ---
assert.equal(normalizeComposeAudioMode(), 'source');
assert.equal(normalizeComposeAudioMode(''), 'source');
assert.equal(normalizeComposeAudioMode('original'), 'source');
assert.equal(normalizeComposeAudioMode('音乐原声'), 'source');
assert.equal(normalizeComposeAudioMode('video'), 'video');
assert.equal(normalizeComposeAudioMode('generated'), 'video');
assert.equal(normalizeComposeAudioMode('视频原声'), 'video');
assert.equal(normalizeComposeAudioMode('both'), 'both');
assert.equal(normalizeComposeAudioMode('双音轨'), 'both');

assert.equal(normalizeComposePurpose({ purpose: 'preview' }), 'preview');
assert.equal(normalizeComposePurpose({ purpose: '预览' }), 'preview');
assert.equal(normalizeComposePurpose({ purpose: 'final' }), 'export');
assert.equal(normalizeComposePurpose({ purpose: '成片' }), 'export');
assert.equal(normalizeComposePurpose({ audioMode: 'both' }), 'preview');
assert.equal(normalizeComposePurpose({}), 'export');

// --- buildComposeSegments from cuts + trim ---
{
  const segs = buildComposeSegments({
    trimStart: 2,
    trimEnd: 18,
    cuts: [10, 1, 17.9],
    videos: ['a.mp4', 'b.mp4'],
  });
  assert.equal(segs.length, 2);
  assert.equal(segs[0].index, 1);
  assert.equal(segs[0].startSec, 2);
  assert.equal(segs[0].endSec, 10);
  assert.equal(segs[0].videoPath, 'a.mp4');
  assert.equal(segs[1].startSec, 10);
  assert.equal(segs[1].endSec, 18);
  assert.equal(segs[1].videoPath, 'b.mp4');
}

// notes-like segments without times fall back to cuts
{
  const segs = buildComposeSegments({
    segments: [{ kind: 'vocal', lyrics: 'hello' }, { kind: 'vocal' }],
    trimStart: 0,
    trimEnd: 16,
    cuts: [8],
    videos: ['a.mp4', 'b.mp4'],
  });
  assert.equal(segs.length, 2);
  assert.equal(segs[0].startSec, 0);
  assert.equal(segs[1].endSec, 16);
}

// --- 1. Happy official export ---
{
  const plan = planMvComposeGate(happy);
  assert.equal(plan.ok, true);
  assert.equal(plan.purpose, 'export');
  assert.equal(plan.audioMode, 'source');
  assert.equal(plan.requireOriginalAudio, true);
  assert.equal(plan.compose.ok, true);
  assert.equal(plan.alignment === null || plan.alignment.ok === true, true);
  assert.match(plan.reason, /可以合成|通过|原曲/);
}

// --- 2. Default purpose/audioMode is official export ---
{
  const plan = planMvComposeGate({
    segments: happy.segments,
    sourceAudioPath: 'song.wav',
    trimStart: 0,
    trimEnd: 16,
    sourceAudioDuration: 90,
  });
  assert.equal(plan.purpose, 'export');
  assert.equal(plan.audioMode, 'source');
  assert.equal(plan.ok, true);
}

// --- 3. Preview both requires original evidence and passes ---
{
  const plan = planMvComposeGate({
    ...happy,
    audioMode: 'both',
    purpose: undefined,
  });
  assert.equal(plan.purpose, 'preview');
  assert.equal(plan.audioMode, 'both');
  assert.equal(plan.requireOriginalAudio, true);
  assert.equal(plan.ok, true);
}

// --- 4. Official export missing original audio ---
{
  const plan = planMvComposeGate({
    segments: happy.segments.map(({ videoDuration, ...rest }) => rest),
    audioMode: 'source',
    purpose: 'export',
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.compose.issues.some((i) => i.code === 'MISSING_SOURCE_AUDIO'));
  assert.ok(/[\u4e00-\u9fff]/.test(plan.reason), 'Chinese reason');
}

// --- 5. Official export with generated master override is blocked ---
{
  const plan = planMvComposeGate({
    ...happy,
    audioSource: 'generated',
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.compose.issues.some((i) => i.code === 'GENERATED_AUDIO_MASTER'));
}

// --- 6. QC video export without source audio still ok ---
{
  const plan = planMvComposeGate({
    segments: happy.segments,
    audioMode: 'video',
    purpose: 'export',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.requireOriginalAudio, false);
  assert.match(plan.reason, /不是原曲母带|试听|视频原声/);
}

// --- 7. Missing segment hole ---
{
  const plan = planMvComposeGate({
    audioMode: 'source',
    purpose: 'export',
    sourceAudioPath: 'song.wav',
    trimStart: 0,
    trimEnd: 16,
    segments: [
      { index: 1, startSec: 0, endSec: 8, videoPath: 'a.mp4' },
      { index: 3, startSec: 8, endSec: 16, videoPath: 'c.mp4' },
    ],
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.compose.issues.some((i) => i.code === 'MISSING_SEGMENT'));
}

// --- 8. Duplicate video paths ---
{
  const plan = planMvComposeGate({
    ...happy,
    segments: [
      { index: 1, startSec: 0, endSec: 8, videoPath: 'same.mp4' },
      { index: 2, startSec: 8, endSec: 16, videoPath: 'same.mp4' },
    ],
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.compose.issues.some((i) => i.code === 'DUPLICATE_VIDEO'));
}

// --- 9. Trim window is the expected mux duration, not the full song ---
{
  const plan = planMvComposeGate({
    ...happy,
    sourceAudioDuration: 90,
    trimStart: 0,
    trimEnd: 16,
  });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.compose.issues.some((i) => i.code === 'TOTAL_DURATION_MISMATCH'), false);
}

// --- 10. Alignment mismatch fails the gate ---
{
  const plan = planMvComposeGate({
    ...happy,
    segments: [
      { index: 1, startSec: 0, endSec: 8, videoPath: 'seg-01.mp4', videoDuration: 10 },
      { index: 2, startSec: 8, endSec: 16, videoPath: 'seg-02.mp4', videoDuration: 8 },
    ],
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.alignment && plan.alignment.ok === false);
  assert.ok(plan.alignment.issues.some((i) => i.code === 'VIDEO_DURATION_MISMATCH'));
  assert.ok(plan.reason.includes(plan.alignment.summary) || /时长|对齐|不匹配/.test(plan.reason));
}

// --- 11. Videos shorter than implied segments → MISSING_VIDEO ---
{
  const plan = planMvComposeGate({
    trimStart: 0,
    trimEnd: 24,
    cuts: [8, 16],
    videos: ['a.mp4', 'b.mp4'],
    sourceAudioPath: 'song.wav',
    sourceAudioDuration: 24,
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.compose.issues.some((i) => i.code === 'MISSING_VIDEO'));
}

// --- CLI ---
function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
}

{
  const help = runCli([]);
  assert.match(help.stdout + help.stderr, /mv-compose-gate/);
}

{
  const okFix = path.join(repoRoot, 'examples/mv-compose-gate-ok.json');
  const result = runCli(['mv-compose-gate', '--manifest', okFix, '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.ok, true);
}

{
  const badFix = path.join(repoRoot, 'examples/mv-compose-gate-bad.json');
  const result = runCli(['mv-compose-gate', '--manifest', badFix, '--json']);
  assert.equal(result.status, 1, 'bad fixture should exit 1');
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.ok, false);
}

// --- Source assertions: API hard-gate before ffmpeg, UI pre-check ---
{
  const runtimeSrc = readFileSync(path.join(repoRoot, 'vite-plugins/local-runtime.ts'), 'utf8');
  assert.match(runtimeSrc, /planMvComposeGate/);
  const composeFn = runtimeSrc.slice(runtimeSrc.indexOf('async function composeMvVideos'));
  const gatePos = composeFn.indexOf('planMvComposeGate');
  const ffmpegPos = composeFn.indexOf('execFileAsync("ffmpeg"');
  assert.ok(gatePos >= 0, 'composeMvVideos must call planMvComposeGate');
  assert.ok(ffmpegPos > gatePos, 'gate must run before ffmpeg');
  assert.match(runtimeSrc, /status, 400[\s\S]{0,200}compose|send\(res, 400/);
}

{
  const pageSrc = readFileSync(path.join(repoRoot, 'app/mv/page.tsx'), 'utf8');
  assert.match(pageSrc, /planMvComposeGate/);
  assert.match(pageSrc, /from ["'][^"']*mv-compose-gate/);
  // pre-check before the three compose fetches
  const fetchRe = /fetch\(["']\/api\/local\/mv\/compose["']/g;
  const fetches = [];
  let m;
  while ((m = fetchRe.exec(pageSrc))) fetches.push(m.index);
  assert.ok(fetches.length >= 3, `expected >=3 compose fetches, got ${fetches.length}`);
  for (const idx of fetches) {
    const windowStart = Math.max(0, idx - 800);
    const before = pageSrc.slice(windowStart, idx);
    assert.match(before, /planMvComposeGate/, 'compose fetch must be preceded by a gate pre-check');
  }
}

console.log('test-mv-compose-gate: ok');
