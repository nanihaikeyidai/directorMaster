import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CUT_GATE_TOLERANCE_SEC,
  checkMvCuts,
  classifyCutPoint,
  findVocalRuns,
  parseLyricCues,
} from '../lib/mv-cut-gate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');
const hopsFixture = path.join(repoRoot, 'examples/mv-cut-hops.json');
const lyricsFixture = path.join(repoRoot, 'examples/mv-cut-lyrics.json');

function vocalHop(t) {
  return { t, rmsDb: -20, midDb: -25, bassDb: -30 };
}
function quietHop(t) {
  return { t, rmsDb: -50, midDb: -55, bassDb: -52 };
}
function hopsFromRanges(ranges, durationSec = 16, hopSec = 0.25) {
  const hops = [];
  for (let t = 0; t < durationSec - 1e-9; t += hopSec) {
    const active = ranges.some(([start, end]) => t >= start && t < end);
    hops.push(active ? vocalHop(Number(t.toFixed(4))) : quietHop(Number(t.toFixed(4))));
  }
  return hops;
}

const sampleHops = hopsFromRanges([
  [2, 6],
  [10, 14],
]);
const sampleLyrics = [
  { startSec: 2, endSec: 6, text: 'first phrase' },
  { startSec: 10, endSec: 14, text: 'second phrase' },
];

assert.equal(CUT_GATE_TOLERANCE_SEC, 0.12);

// --- parseLyricCues: aliases and invalid rows ---
{
  const parsed = parseLyricCues({
    cues: [
      { start: 1, end: 2, lyrics: 'a' },
      { start_time: 3, end_time: 4, line: 'b' },
      { startSec: 5, endSec: 4, text: 'dropped' },
      { startSec: 'x', endSec: 8 },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { startSec: 1, endSec: 2, text: 'a' });
  assert.deepEqual(parsed[1], { startSec: 3, endSec: 4, text: 'b' });
  assert.deepEqual(parseLyricCues(null), []);
}

// --- findVocalRuns merges active / inactive spans ---
{
  const runs = findVocalRuns(sampleHops, { hopSec: 0.25 });
  const active = runs.filter((r) => r.active);
  assert.equal(active.length, 2);
  assert.ok(Math.abs(active[0].startSec - 2) < 1e-9, String(active[0].startSec));
  assert.ok(Math.abs(active[0].endSec - 6) < 1e-9, String(active[0].endSec));
  assert.ok(Math.abs(active[1].startSec - 10) < 1e-9);
  assert.ok(Math.abs(active[1].endSec - 14) < 1e-9);
}

// --- lyric happy path: phrase boundaries and inter-phrase gap ---
{
  const report = checkMvCuts({
    cuts: [0, 2, 6, 10, 14, 16],
    lyrics: sampleLyrics,
    durationSec: 16,
  });
  assert.equal(report.ok, true, report.reason);
  assert.equal(report.toleranceSec, 0.12);
  assert.equal(report.issues.length, 0);
  assert.deepEqual(report.snappedCuts, [0, 2, 6, 10, 14, 16]);
  assert.equal(report.cuts[0].kind, 'song_edge');
  assert.equal(report.cuts[1].kind, 'phrase_end');
  assert.equal(report.cuts[2].kind, 'phrase_end');
  assert.ok(['vocal_gap', 'breath', 'phrase_end'].includes(report.cuts[3].kind) || report.cuts[3].ok);
  assert.equal(report.cuts.at(-1).kind, 'song_edge');
  assert.match(report.reason, /通过|句界|合法/);
}

// --- mid-lyric: interior of a line fails and snaps to nearer boundary ---
{
  const report = checkMvCuts({ cuts: [3.5], lyrics: sampleLyrics, durationSec: 16 });
  assert.equal(report.ok, false);
  const issue = report.issues.find((i) => i.code === 'MID_LYRIC');
  assert.ok(issue, 'expected MID_LYRIC');
  assert.equal(issue.severity, 'error');
  assert.ok(/[\u4e00-\u9fff]/.test(issue.message), 'Chinese message');
  assert.equal(report.cuts[0].ok, false);
  assert.equal(report.cuts[0].kind, 'mid_lyric');
  // 3.5 is 1.5s from 2.0 and 2.5s from 6.0 → snap to 2.0
  assert.equal(report.cuts[0].snappedT, 2);
  assert.equal(report.snappedCuts[0], 2);
}

// --- mid-lyric tie snaps later (to phrase end) ---
{
  const classified = classifyCutPoint(4, {
    lyrics: sampleLyrics,
    durationSec: 16,
    toleranceSec: 0.12,
  });
  assert.equal(classified.ok, false);
  assert.equal(classified.kind, 'mid_lyric');
  assert.equal(classified.snappedT, 6);
}

// --- 120ms tolerance: 5.88 near 6.00 is ok; 4.00 still mid-lyric ---
{
  const near = checkMvCuts({ cuts: [5.88], lyrics: sampleLyrics, durationSec: 16 });
  assert.equal(near.ok, true, near.reason);
  assert.equal(near.cuts[0].kind, 'phrase_end');
  const mid = checkMvCuts({ cuts: [4.0], lyrics: sampleLyrics, durationSec: 16 });
  assert.equal(mid.ok, false);
  assert.equal(mid.cuts[0].code, 'MID_LYRIC');
}

// --- hops only: boundaries and instrumental gaps pass; mid-run fails ---
{
  const okReport = checkMvCuts({ cuts: [0, 2, 6, 8, 10, 14, 16], hops: sampleHops, durationSec: 16 });
  assert.equal(okReport.ok, true, okReport.reason);
  assert.ok(okReport.cuts.every((c) => c.ok));
  const mid = checkMvCuts({ cuts: [4], hops: sampleHops, durationSec: 16 });
  assert.equal(mid.ok, false);
  assert.equal(mid.cuts[0].kind, 'mid_lyric');
  assert.equal(mid.cuts[0].code, 'MID_LYRIC');
  assert.equal(mid.cuts[0].snappedT, 6);
  assert.ok(/能量|人声|句/.test(mid.reason + mid.cuts[0].reason));
}

// --- lyrics take priority over hops when both exist ---
{
  const report = checkMvCuts({
    cuts: [3.5],
    lyrics: sampleLyrics,
    hops: sampleHops,
    durationSec: 16,
  });
  assert.equal(report.ok, false);
  assert.equal(report.cuts[0].snappedT, 2);
}

// --- input errors ---
{
  for (const cuts of [undefined, [], null, 'nope', { x: 1 }]) {
    const report = checkMvCuts({ cuts, lyrics: sampleLyrics, durationSec: 16 });
    assert.equal(report.ok, false, `expected NO_CUTS for ${JSON.stringify(cuts)}`);
    assert.ok(report.issues.some((i) => i.code === 'NO_CUTS'), JSON.stringify(report.issues));
  }
}
{
  const report = checkMvCuts({ cuts: [2, 6] });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'NO_EVIDENCE'));
}
{
  const report = checkMvCuts({ cuts: [2, 2.05], lyrics: sampleLyrics, durationSec: 16, toleranceSec: 0.12 });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'DUPLICATE_CUT'));
}
{
  const report = checkMvCuts({ cuts: [20], lyrics: sampleLyrics, durationSec: 16 });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'OUT_OF_RANGE'));
}
{
  const report = checkMvCuts({ cuts: [-1, 'abc'], lyrics: sampleLyrics, durationSec: 16 });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'INVALID_CUT'));
}

// --- CLI: phrase-boundary cuts exit 0 ---
{
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'mv-cut-check',
      '--cuts',
      '0,2,6,10,14,16',
      '--lyrics',
      lyricsFixture,
      '--hops-json',
      hopsFixture,
      '--duration',
      '16',
      '--json',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true, result.stdout);
}

// --- CLI: mid-lyric exit 1 ---
{
  const result = spawnSync(
    process.execPath,
    [cliPath, 'mv-cut-check', '--cuts', '4', '--lyrics', lyricsFixture, '--duration', '16', '--json'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'MID_LYRIC'));
}

// --- help lists mv-cut-check ---
{
  const result = spawnSync(process.execPath, [cliPath, 'help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mv-cut-check/);
}

console.log('test-mv-cut-gate: ok');
