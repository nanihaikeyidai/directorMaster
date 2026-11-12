import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LIPSYNC_WORKFLOW_ID,
  listLipsyncWorkflows,
  planLipsyncFinalize,
  resolveLipsyncWorkflow,
} from '../lib/mv-lipsync-finalize.mjs';
import { buildLipsyncTrialPlan } from '../lib/mv-lipsync-prep.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');

const XUNFENG_ID = '2089048490512052225';
const PIXEL_ID = '2087128116820013058';

function vocalHops(n = 80) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 0.25,
    rmsDb: -20,
    midDb: -18,
    bassDb: -28,
  }));
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// --- registry + default ---
{
  assert.equal(DEFAULT_LIPSYNC_WORKFLOW_ID, XUNFENG_ID);
  const list = listLipsyncWorkflows();
  assert.ok(list.length >= 2);
  assert.equal(list[0].id, XUNFENG_ID);
  assert.equal(list[0].isDefault, true);
  assert.match(list[0].name, /迅风/);
  const pixel = list.find((item) => item.id === PIXEL_ID);
  assert.ok(pixel, 'registry should include 像素幻想');
  assert.match(pixel.name, /像素幻想/);
  assert.notEqual(pixel.isDefault, true);
}

// --- resolve: omitted / blank → default 迅风 ---
{
  for (const input of [undefined, '', '   ']) {
    const resolved = resolveLipsyncWorkflow(input);
    assert.equal(resolved.ok, true, `expected ok for ${JSON.stringify(input)}`);
    assert.equal(resolved.id, XUNFENG_ID);
    assert.equal(resolved.isDefault, true);
    assert.match(resolved.name, /迅风/);
    assert.match(resolved.reason, /默认|迅风/);
  }
}

// --- resolve: aliases ---
{
  for (const alias of ['xunfeng', 'XunFeng', '迅风', '迅风幻影', '迅风幻影自动版', XUNFENG_ID]) {
    const resolved = resolveLipsyncWorkflow(alias);
    assert.equal(resolved.ok, true, `expected ok for ${alias}`);
    assert.equal(resolved.id, XUNFENG_ID);
    assert.match(resolved.name, /迅风/);
  }
  for (const alias of ['pixel-fantasy', 'pixel', '像素幻想', PIXEL_ID]) {
    const resolved = resolveLipsyncWorkflow(alias);
    assert.equal(resolved.ok, true, `expected ok for ${alias}`);
    assert.equal(resolved.id, PIXEL_ID);
    assert.match(resolved.name, /像素幻想/);
    assert.equal(resolved.isDefault, false);
  }
}

// --- resolve: custom numeric id allowed; junk rejected ---
{
  const custom = resolveLipsyncWorkflow('2110000000000000001');
  assert.equal(custom.ok, true);
  assert.equal(custom.id, '2110000000000000001');
  assert.equal(custom.custom, true);
  assert.match(custom.reason, /自定义|custom/i);

  const bad = resolveLipsyncWorkflow('not-a-workflow');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /工作流/);
  assert.match(bad.reason, /迅风|像素幻想|xunfeng|pixel-fantasy/);
}

// --- buildLipsyncTrialPlan fills default workflow when omitted ---
{
  const plan = buildLipsyncTrialPlan({
    hops: vocalHops(),
    person: { path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.workflowId, XUNFENG_ID);
  assert.equal(plan.workflow?.ok, true);
  assert.equal(plan.workflow?.id, XUNFENG_ID);
  assert.match(plan.workflow?.name || '', /迅风/);
}

{
  const plan = buildLipsyncTrialPlan({
    hops: vocalHops(),
    person: { path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 },
    workflowId: '像素幻想',
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.workflowId, PIXEL_ID);
  assert.match(plan.workflow?.name || '', /像素幻想/);
}

{
  const plan = buildLipsyncTrialPlan({
    hops: vocalHops(),
    person: { path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 },
    workflowId: 'nope',
  });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /工作流/);
  assert.equal(plan.workflow?.ok, false);
}

// --- finalize: missing video / missing audio / generated master ---
{
  const noVideo = planLipsyncFinalize({
    audioPath: 'camilla-vocal.wav',
    audioSource: 'original',
  });
  assert.equal(noVideo.ok, false);
  assert.equal(noVideo.mux, null);
  assert.match(noVideo.reason, /视频|成片/);

  const noAudio = planLipsyncFinalize({
    videoPath: 'trial.mp4',
  });
  assert.equal(noAudio.ok, false);
  assert.equal(noAudio.mux, null);
  assert.match(noAudio.reason, /原曲|封装/);

  const generated = planLipsyncFinalize({
    videoPath: 'trial.mp4',
    audioPath: 'model-track.wav',
    audioSource: 'generated',
  });
  assert.equal(generated.ok, false);
  assert.equal(generated.mux, null);
  assert.match(generated.reason, /原曲|生成音轨|封装/);
}

// --- finalize: happy path uses original audio and default 迅风 ---
{
  const plan = planLipsyncFinalize({
    videoPath: '/tmp/nightly-trial.mp4',
    audioPath: '/tmp/camilla-vocal-15s.wav',
    startSec: 12,
    endSec: 27,
    sourceAudioDuration: 15,
    videoDuration: 15,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.workflow.id, XUNFENG_ID);
  assert.match(plan.workflow.name, /迅风/);
  assert.equal(plan.compose.ok, true);
  assert.ok(plan.mux);
  assert.deepEqual(plan.mux.videoPaths, ['/tmp/nightly-trial.mp4']);
  assert.equal(plan.mux.audioPath, '/tmp/camilla-vocal-15s.wav');
  assert.equal(plan.mux.audioSource, 'original');
  assert.equal(plan.mux.startSec, 12);
  assert.equal(plan.mux.endSec, 27);
  assert.match(plan.mux.outPath, /nightly-trial-original-audio\.mp4$/);
  assert.match(plan.reason, /原曲|封装|通过/);
}

// --- finalize: explicit outPath + pixel-fantasy alias ---
{
  const plan = planLipsyncFinalize({
    videoPaths: ['clip.mp4'],
    audioPath: 'song.wav',
    outPath: 'out/final.mp4',
    workflowId: 'pixel-fantasy',
    audioSource: 'original',
    sourceAudioDuration: 15,
    videoDuration: 15,
    startSec: 0,
    endSec: 15,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.workflow.id, PIXEL_ID);
  assert.equal(plan.mux.outPath, 'out/final.mp4');
}

// --- CLI help + dry-run ---
{
  const help = runCli([]);
  assert.match(help.stdout + help.stderr, /mv-lipsync-finalize/);
}

{
  const result = runCli([
    'mv-lipsync-finalize',
    '--video', 'trial.mp4',
    '--audio', 'vocal.wav',
    '--start', '0',
    '--end', '15',
    '--dry-run',
    '--json',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.ok, true);
  assert.equal(plan.workflow.id, XUNFENG_ID);
  assert.equal(plan.mux.audioSource, 'original');
  assert.match(plan.mux.outPath, /trial-original-audio\.mp4$/);
}

{
  const result = runCli([
    'mv-lipsync-finalize',
    '--video', 'trial.mp4',
    '--dry-run',
    '--json',
  ]);
  assert.equal(result.status, 1);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.ok, false);
  assert.equal(plan.mux, null);
}

console.log('test-mv-lipsync-finalize: ok');
