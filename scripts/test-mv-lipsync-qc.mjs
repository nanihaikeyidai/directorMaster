import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LIPSYNC_QC_MIN_CLOSEUP_RATIO,
  DEFAULT_LIPSYNC_QC_MIN_FRAMES,
  assessOutputFrameCloseUp,
  planLipsyncQc,
} from '../lib/mv-lipsync-qc.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
  });
}

function midFrame(tSec, extra = {}) {
  return { tSec, width: 1280, height: 736, faceHeightRatio: 0.12, ...extra };
}

function closeFrame(tSec, extra = {}) {
  return { tSec, width: 1280, height: 736, faceHeightRatio: 0.4, ...extra };
}

// --- defaults ---
{
  assert.equal(DEFAULT_LIPSYNC_QC_MIN_CLOSEUP_RATIO, 0.6);
  assert.equal(DEFAULT_LIPSYNC_QC_MIN_FRAMES, 3);
}

// --- output frame: ignore path close-up hints; require geometry ---
{
  const namedOnly = assessOutputFrameCloseUp({
    path: '/out/frame-close-up-03.png',
    width: 1280,
    height: 736,
  });
  assert.equal(namedOnly.ok, false);
  assert.ok(namedOnly.score < 0.25);
  assert.match(namedOnly.reason, /几何|人脸|近脸/);

  const namedCrop = assessOutputFrameCloseUp({
    path: '/out/ref-crop-frame.jpg',
    width: 1280,
    height: 736,
  });
  assert.equal(namedCrop.ok, false);

  const byFace = assessOutputFrameCloseUp({
    path: '/out/wide-name.png',
    width: 1280,
    height: 736,
    faceHeightRatio: 0.4,
  });
  assert.equal(byFace.ok, true);
  assert.ok(byFace.score >= 0.25);

  const portraitSkin = assessOutputFrameCloseUp({
    path: '/out/frame-01.png',
    width: 768,
    height: 1200,
    centerSkinFraction: 0.2,
  });
  assert.equal(portraitSkin.ok, true);

  const landscapeSkinOnly = assessOutputFrameCloseUp({
    path: '/out/frame-02.png',
    width: 1280,
    height: 736,
    centerSkinFraction: 0.2,
  });
  assert.equal(landscapeSkinOnly.ok, false);

  const invalid = assessOutputFrameCloseUp({ width: 0, height: 736 });
  assert.equal(invalid.ok, false);
}

// --- missing / too few frames ---
{
  const empty = planLipsyncQc();
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'MISSING_FRAMES');
  assert.match(empty.reason, /帧/);

  const few = planLipsyncQc({ frames: [closeFrame(0), closeFrame(1)] });
  assert.equal(few.ok, false);
  assert.equal(few.code, 'MISSING_FRAMES');
  assert.equal(few.frameCount, 2);
}

// --- vocal 7/10 close-ups pass (11/26-style) ---
{
  const frames = [
    closeFrame(0), closeFrame(1), closeFrame(2),
    midFrame(3), midFrame(4), midFrame(5),
    closeFrame(6), closeFrame(7), closeFrame(8), closeFrame(9),
  ];
  const report = planLipsyncQc({ frames });
  assert.equal(report.ok, true);
  assert.equal(report.purpose, 'vocal');
  assert.equal(report.frameCount, 10);
  assert.equal(report.closeUpCount, 7);
  assert.equal(report.closeUpRatio, 0.7);
  assert.equal(report.minCloseUpRatio, 0.6);
  assert.equal(report.code, undefined);
  assert.match(report.reason, /近脸/);
  assert.equal(report.frames.length, 10);
  assert.equal(report.frames[0].ok, true);
  assert.equal(report.frames[3].ok, false);
}

// --- all mid-shots fail coverage ---
{
  const frames = Array.from({ length: 10 }, (_, i) => midFrame(i));
  const report = planLipsyncQc({ frames });
  assert.equal(report.ok, false);
  assert.equal(report.code, 'LOW_CLOSEUP_COVERAGE');
  assert.equal(report.closeUpCount, 0);
  assert.equal(report.closeUpRatio, 0);
  assert.match(report.reason, /覆盖|中景|近脸/);
}

// --- instrumental does not require close-ups ---
{
  const frames = Array.from({ length: 5 }, (_, i) => ({
    tSec: i,
    width: 1920,
    height: 1080,
    faceHeightRatio: 0.05,
  }));
  const report = planLipsyncQc({ frames, purpose: 'instrumental' });
  assert.equal(report.ok, true);
  assert.equal(report.purpose, 'instrumental');
  assert.equal(report.closeUpCount, 0);
  assert.match(report.reason, /伴奏|无人声|不要求/);
}

// --- CLI ---
{
  const dir = mkdtempSync(path.join(tmpdir(), 'mv-lipsync-qc-'));
  try {
    const passPath = path.join(dir, 'pass.json');
    const failPath = path.join(dir, 'fail.json');
    writeFileSync(passPath, JSON.stringify({
      frames: [
        closeFrame(0), closeFrame(1), closeFrame(2),
        midFrame(3), midFrame(4), midFrame(5),
        closeFrame(6), closeFrame(7), closeFrame(8), closeFrame(9),
      ],
    }));
    writeFileSync(failPath, JSON.stringify({
      frames: Array.from({ length: 10 }, (_, i) => midFrame(i)),
    }));

    const missing = runCli(['mv-lipsync-qc', '--json']);
    assert.notEqual(missing.status, 0);

    const okRun = runCli(['mv-lipsync-qc', '--frames-json', passPath, '--json']);
    assert.equal(okRun.status, 0, okRun.stderr || okRun.stdout);
    const okJson = JSON.parse(okRun.stdout);
    assert.equal(okJson.ok, true);
    assert.equal(okJson.closeUpCount, 7);

    const badRun = runCli(['mv-lipsync-qc', '--frames-json', failPath, '--json']);
    assert.equal(badRun.status, 1);
    const badJson = JSON.parse(badRun.stdout);
    assert.equal(badJson.ok, false);
    assert.equal(badJson.code, 'LOW_CLOSEUP_COVERAGE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('test-mv-lipsync-qc: ok');
