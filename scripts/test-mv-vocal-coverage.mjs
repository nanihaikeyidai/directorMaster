import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instrumentalCoverageNote } from '../lib/mv-lyric-segments.mjs';
import {
  DEFAULT_MAX_SEGMENT_SEC,
  DEFAULT_MIN_INSTRUMENTAL_SEC,
  planVocalCoverageSegments,
  regionsFromEnergyHops,
  regionsFromVocalMap,
} from '../lib/mv-vocal-coverage.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');
const camillaMap = JSON.parse(
  readFileSync(path.join(repoRoot, 'examples/mv-vocal-map-camilla.json'), 'utf8'),
);

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
}

assert.equal(DEFAULT_MAX_SEGMENT_SEC, 15);
assert.equal(DEFAULT_MIN_INSTRUMENTAL_SEC, 2);

const closedMouthNote = instrumentalCoverageNote();
assert.equal(closedMouthNote.kind, 'instrumental');
assert.equal(closedMouthNote.coverage, 'instrumental-wide');
assert.match(closedMouthNote.direction, /远景|演奏|琴弦/);
assert.match(closedMouthNote.direction, /闭合|口型/);
assert.match(closedMouthNote.direction, /不对歌手脸/);

{
  const empty = planVocalCoverageSegments({ regions: [], durationSec: 0 });
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /时长/);
  assert.deepEqual(empty.cuts, []);
  assert.deepEqual(empty.segments, []);
}

{
  const noRegions = planVocalCoverageSegments({ durationSec: 20, regions: [] });
  assert.equal(noRegions.ok, false);
  assert.match(noRegions.reason, /区域|人声/);
}

// Synthetic: intro inst, vocal with a short breath packed in, long inst, final vocal.
{
  const planned = planVocalCoverageSegments({
    durationSec: 30,
    regions: [
      { start: 0, end: 5, vocal: false },
      { start: 5, end: 12, vocal: true },
      { start: 12, end: 12.8, vocal: false },
      { start: 12.8, end: 20, vocal: true },
      { start: 20, end: 25, vocal: false },
      { start: 25, end: 30, vocal: true },
    ],
  });
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.cuts, [5, 20, 25]);
  assert.equal(planned.segments.length, 4);
  assert.equal(planned.notes.length, 4);
  assert.equal(planned.segments[0].kind, 'instrumental');
  assert.equal(planned.segments[0].start, 0);
  assert.equal(planned.segments[0].end, 5);
  assert.equal(planned.segments[0].coverage, 'instrumental-wide');
  assert.match(planned.notes[0].direction, /闭合|口型/);
  assert.equal(planned.segments[1].kind, 'vocal');
  assert.equal(planned.segments[1].start, 5);
  assert.equal(planned.segments[1].end, 20);
  assert.equal(planned.segments[1].coverage, 'singing-closeup');
  assert.match(planned.notes[1].direction, /近景|特写|口型/);
  assert.equal(planned.segments[2].kind, 'instrumental');
  assert.equal(planned.segments[2].start, 20);
  assert.equal(planned.segments[2].end, 25);
  assert.equal(planned.segments[3].kind, 'vocal');
  assert.equal(planned.segments[3].start, 25);
  assert.equal(planned.segments[3].end, 30);
  assert.ok(planned.segments.every((seg) => seg.duration <= 15 + 1e-6));
  assert.ok(
    planned.segments
      .filter((seg) => seg.kind === 'instrumental')
      .every((seg) => seg.duration >= 2 - 1e-6),
  );
}

// Continuous vocal longer than maxSegmentSec splits at the cap.
{
  const planned = planVocalCoverageSegments({
    durationSec: 40,
    regions: [{ start: 0, end: 40, vocal: true }],
  });
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.cuts, [15, 30]);
  assert.equal(planned.segments.length, 3);
  assert.ok(planned.segments.every((seg) => seg.kind === 'vocal'));
  assert.equal(planned.segments[0].cutReason, 'max-duration');
  assert.equal(planned.segments[1].cutReason, 'max-duration');
  assert.equal(planned.segments[0].end, 15);
  assert.equal(planned.segments[2].end, 40);
}

// regionsFromEnergyHops collapses adjacent hops with the same vocal flag.
{
  const hops = [
    { t: 0, rmsDb: -40, midDb: -40, bassDb: -20 },
    { t: 0.25, rmsDb: -40, midDb: -40, bassDb: -20 },
    { t: 0.5, rmsDb: -10, midDb: -12, bassDb: -30 },
    { t: 0.75, rmsDb: -10, midDb: -12, bassDb: -30 },
    { t: 1.0, rmsDb: -40, midDb: -40, bassDb: -20 },
  ];
  const regions = regionsFromEnergyHops(hops, { hopSec: 0.25 });
  assert.ok(regions.length >= 2);
  assert.equal(regions[0].vocal, false);
  const vocal = regions.find((row) => row.vocal);
  assert.ok(vocal);
  assert.ok(vocal.start >= 0.5 - 1e-6);
  assert.ok(vocal.end <= 1.0 + 1e-6);
}

// Camilla 2026-11-28 vocal map: intro/outro and the 3.22s mid-song gap are instrumental.
{
  const regions = regionsFromVocalMap(camillaMap);
  const planned = planVocalCoverageSegments({
    regions,
    durationSec: camillaMap.duration,
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.segments[0].kind, 'instrumental');
  assert.equal(planned.segments[0].start, 0);
  assert.equal(planned.segments[0].end, 7.01);
  const midInst = planned.segments.find(
    (seg) => seg.kind === 'instrumental' && Math.abs(seg.start - 181.9) < 0.02,
  );
  assert.ok(midInst, 'expected 181.9–185.12 instrumental segment');
  assert.ok(Math.abs(midInst.end - 185.12) < 0.02);
  const last = planned.segments[planned.segments.length - 1];
  assert.equal(last.kind, 'instrumental');
  assert.ok(Math.abs(last.start - 214.92) < 0.02);
  assert.ok(Math.abs(last.end - camillaMap.duration) < 0.05 || last.end === 223.33);
  assert.ok(planned.segments.every((seg) => seg.duration <= 15 + 1e-6));
  assert.ok(
    planned.segments
      .filter((seg) => seg.kind === 'instrumental')
      .every((seg) => seg.duration >= 2 - 1e-6),
  );
  assert.ok(planned.notes.every((note) => note.kind !== 'instrumental' || /闭合|口型/.test(note.direction)));
}

// CLI
{
  const dir = mkdtempSync(path.join(tmpdir(), 'mv-vocal-coverage-'));
  try {
    const missing = runCli(['mv-vocal-plan', '--json']);
    assert.notEqual(missing.status, 0);

    const okRun = runCli([
      'mv-vocal-plan',
      '--map',
      path.join(repoRoot, 'examples/mv-vocal-map-camilla.json'),
      '--json',
    ]);
    assert.equal(okRun.status, 0, okRun.stderr || okRun.stdout);
    const okJson = JSON.parse(okRun.stdout);
    assert.equal(okJson.ok, true);
    assert.equal(okJson.segments[0].kind, 'instrumental');
    assert.equal(okJson.segments[0].end, 7.01);

    const simpleMap = path.join(dir, 'simple.json');
    writeFileSync(
      simpleMap,
      JSON.stringify({
        duration: 10,
        regions: [
          { start: 0, end: 3, vocal: false },
          { start: 3, end: 10, vocal: true },
        ],
      }),
    );
    const simple = runCli(['mv-vocal-plan', '--map', simpleMap, '--json']);
    assert.equal(simple.status, 0, simple.stderr || simple.stdout);
    const simpleJson = JSON.parse(simple.stdout);
    assert.deepEqual(simpleJson.cuts, [3]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('test-mv-vocal-coverage: ok');
