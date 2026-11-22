import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planMvCutGate } from '../lib/mv-cut-gate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');
const hopsFixture = path.join(repoRoot, 'examples/mv-cut-hops.json');
const lyricsFixture = path.join(repoRoot, 'examples/mv-cut-lyrics.json');

const sampleLyrics = [
  { startSec: 2, endSec: 6, text: 'first phrase' },
  { startSec: 10, endSec: 14, text: 'second phrase' },
];
const happyCuts = [0, 2, 6, 10, 14, 16];

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const next = src.slice(start + 1).search(/\nfunction |\nasync function /);
  return next >= 0 ? src.slice(start, start + 1 + next) : src.slice(start);
}

// --- Happy lyrics: pass, appliedCuts equal the valid input cuts ---
{
  const plan = planMvCutGate({
    cuts: happyCuts,
    lyrics: sampleLyrics,
    durationSec: 16,
  });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'pass');
  assert.deepEqual(plan.appliedCuts, happyCuts);
  assert.deepEqual(plan.inputCuts, happyCuts);
  assert.equal(plan.report.ok, true, plan.report.reason);
  assert.ok(hasChinese(plan.reason), plan.reason);
}

// Same happy path also holds with the shipped fixtures.
{
  const lyrics = JSON.parse(readFileSync(lyricsFixture, 'utf8'));
  const hops = JSON.parse(readFileSync(hopsFixture, 'utf8'));
  const plan = planMvCutGate({
    cuts: happyCuts,
    lyrics,
    hops,
    durationSec: 16,
  });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'pass');
  assert.deepEqual(plan.appliedCuts, happyCuts);
}

// --- Mid-lyric without snap: block, Chinese reason mentions snap suggestion ---
{
  const plan = planMvCutGate({
    cuts: [3.5],
    lyrics: sampleLyrics,
    durationSec: 16,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.mode, 'block');
  assert.ok(hasChinese(plan.reason), plan.reason);
  assert.ok(
    plan.reason.includes('2') && /吸附|建议|snap|--snap-cuts|句界/.test(plan.reason),
    plan.reason,
  );
  assert.ok(plan.report.issues.some((issue) => issue.code === 'MID_LYRIC'));
  assert.deepEqual(plan.report.snappedCuts, [2]);
  assert.notDeepEqual(plan.appliedCuts, plan.report.snappedCuts);
  assert.ok(
    !plan.appliedCuts.length || plan.appliedCuts[0] === 3.5,
    `appliedCuts must not silently become snapped list: ${JSON.stringify(plan.appliedCuts)}`,
  );
}

// --- Mid-lyric with snap: apply phrase boundaries and re-check would pass ---
{
  const plan = planMvCutGate({
    cuts: [3.5],
    lyrics: sampleLyrics,
    durationSec: 16,
    snap: true,
  });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'snap');
  assert.deepEqual(plan.appliedCuts, [2]);
  assert.equal(plan.report.ok, true, plan.report.reason);
  assert.ok(hasChinese(plan.reason), plan.reason);
  assert.ok(/吸附|句界|空白/.test(plan.reason), plan.reason);
}

// --- Snap that collapses two mid-lyric cuts onto the same boundary ---
{
  const plan = planMvCutGate({
    cuts: [3.0, 3.4],
    lyrics: sampleLyrics,
    durationSec: 16,
    snap: true,
  });
  assert.equal(plan.ok, false, plan.reason);
  assert.equal(plan.mode, 'block');
  assert.ok(hasChinese(plan.reason), plan.reason);
  assert.ok(plan.report.issues.some((issue) => issue.code === 'DUPLICATE_CUT') || /重复/.test(plan.reason));
}

// --- Cuts present but neither lyrics nor hops ---
{
  const plan = planMvCutGate({ cuts: [2, 6], durationSec: 16 });
  assert.equal(plan.ok, false);
  assert.equal(plan.mode, 'block');
  assert.ok(plan.report.issues.some((issue) => issue.code === 'NO_EVIDENCE'), JSON.stringify(plan.report.issues));
  assert.ok(hasChinese(plan.reason), plan.reason);
}

// --- Empty cuts + short duration: skip, single segment may pass ---
{
  const plan = planMvCutGate({ cuts: [], durationSec: 12 });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'skip');
  assert.deepEqual(plan.appliedCuts, []);
  assert.ok(hasChinese(plan.reason), plan.reason);
  assert.ok(/无需切点|单段可过/.test(plan.reason), plan.reason);
}

// --- Empty cuts + long duration: still skip; 15s rule left to mv-cut ---
{
  const plan = planMvCutGate({ cuts: [], durationSec: 90 });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.mode, 'skip');
  assert.deepEqual(plan.appliedCuts, []);
  assert.ok(hasChinese(plan.reason), plan.reason);
}

// --- CLI help lists the new mv-cut flags on the mv-cut line ---
{
  const result = spawnSync(process.execPath, [cliPath, 'help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const text = `${result.stdout}\n${result.stderr}`;
  const mvCutLine = text.split('\n').find((line) => /mv-cut\s+--audio/.test(line));
  assert.ok(mvCutLine, 'expected an mv-cut help line');
  assert.match(mvCutLine, /--lyrics/);
  assert.match(mvCutLine, /--hops-json/);
  assert.match(mvCutLine, /--snap-cuts/);
}

// --- Source inspection: mvCut() calls the gate before segment-export ffmpeg,
// and the default path probes hops when lyrics / hops-json are absent.
{
  const src = readFileSync(cliPath, 'utf8');
  const mvCutSrc = extractFunction(src, 'mvCut');
  const gatePos = mvCutSrc.indexOf('planMvCutGate');
  assert.ok(gatePos >= 0, 'mvCut() must call planMvCutGate');
  const ffmpegPositions = [];
  const ffmpegRe = /execFileSync\(\s*['"]ffmpeg['"]/g;
  let match;
  while ((match = ffmpegRe.exec(mvCutSrc))) ffmpegPositions.push(match.index);
  assert.ok(ffmpegPositions.length >= 1, 'expected ffmpeg segment export in mvCut()');
  assert.ok(
    ffmpegPositions.every((pos) => pos > gatePos),
    'planMvCutGate must run before any execFileSync(ffmpeg) that exports segments',
  );
  assert.match(mvCutSrc, /probeEnergyHops/);
  const lyricsPos = mvCutSrc.search(/option\(\s*['"]lyrics['"]/);
  const hopsJsonPos = mvCutSrc.search(/option\(\s*['"]hops-json['"]/);
  const probePos = mvCutSrc.indexOf('probeEnergyHops');
  assert.ok(lyricsPos >= 0 && hopsJsonPos >= 0 && probePos >= 0);
  assert.ok(
    probePos > lyricsPos && probePos > hopsJsonPos,
    'default path should probe hops only after checking --lyrics / --hops-json',
  );
  assert.match(mvCutSrc, /planLyricPhraseSegments/);
  assert.match(mvCutSrc, /notesFromLyricSegments/);
  const planPos = mvCutSrc.indexOf('planLyricPhraseSegments');
  assert.ok(planPos > lyricsPos && planPos < gatePos, 'auto lyric segmentation must run after --lyrics and before planMvCutGate');
}

console.log('test-mv-cut-apply: ok');
