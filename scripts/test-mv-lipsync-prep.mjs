import assert from 'node:assert/strict';
import {
  isVocalActiveHop,
  selectVocalSegment,
  assessFaceCloseUpRef,
  buildLipsyncTrialPlan,
} from '../lib/mv-lipsync-prep.mjs';

function hopsFrom(pattern, hopSec = 0.25) {
  // pattern: 'V' = vocal-active, 'I' = instrumental/bass-dominant, 'S' = silence
  const out = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    const t = i * hopSec;
    if (ch === 'S') out.push({ t, rmsDb: -60, midDb: -70, bassDb: -65 });
    else if (ch === 'I') out.push({ t, rmsDb: -18, midDb: -28, bassDb: -12 }); // bass >> mid
    else if (ch === 'V') out.push({ t, rmsDb: -16, midDb: -14, bassDb: -18 }); // mid >= bass-3
    else throw new Error('bad pattern ' + ch);
  }
  return out;
}

// --- isVocalActiveHop ---
assert.equal(isVocalActiveHop({ t: 0, rmsDb: -16, midDb: -14, bassDb: -18 }), true);
assert.equal(isVocalActiveHop({ t: 0, rmsDb: -18, midDb: -28, bassDb: -12 }), false);
assert.equal(isVocalActiveHop({ t: 0, rmsDb: -50, midDb: -10, bassDb: -12 }), false);

// --- selectVocalSegment: all instrumental → refuse ---
{
  const hops = hopsFrom('I'.repeat(80)); // 20s
  const r = selectVocalSegment(hops, { targetDurationSec: 15, minDurationSec: 10, minVocalActiveRatio: 0.35 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /人声|器乐|无人声/);
}

// --- selectVocalSegment: vocal block wins ---
{
  // 5s instrumental + 16s vocal + rest instrumental (hop 0.25 → 4 hops/sec)
  const hops = hopsFrom('I'.repeat(20) + 'V'.repeat(64) + 'I'.repeat(20));
  const r = selectVocalSegment(hops, { targetDurationSec: 15, minDurationSec: 10, minVocalActiveRatio: 0.35 });
  assert.equal(r.ok, true);
  assert.ok(r.durationSec >= 10);
  assert.ok(r.vocalActiveRatio >= 0.35);
  assert.ok(r.startSec >= 4.5 && r.startSec <= 6.5, 'start near vocal onset, got ' + r.startSec);
  assert.ok(r.endSec - r.startSec >= 14.5, 'prefer ~15s window');
}

// --- assessFaceCloseUpRef ---
{
  const crop = assessFaceCloseUpRef({ path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 });
  assert.equal(crop.ok, true);
  assert.ok(crop.score >= 0.5);

  const scene = assessFaceCloseUpRef({
    path: '/x/scene-wide-beach.jpg',
    width: 1920,
    height: 1080,
    centerSkinFraction: 0.05,
  });
  assert.equal(scene.ok, false);

  const faceBox = assessFaceCloseUpRef({
    path: '/x/portrait.png',
    width: 1000,
    height: 1000,
    faceHeightRatio: 0.4,
  });
  assert.equal(faceBox.ok, true);
}

// --- buildLipsyncTrialPlan ---
{
  const bad = buildLipsyncTrialPlan({
    hops: hopsFrom('I'.repeat(80)),
    person: { path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 },
    workflowId: '2089048490512052225',
  });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /人声|器乐|无人声/);

  const goodHops = hopsFrom('V'.repeat(80));
  const good = buildLipsyncTrialPlan({
    hops: goodHops,
    person: { path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 },
    workflowId: '2089048490512052225',
  });
  assert.equal(good.ok, true);
  assert.equal(good.workflowId, '2089048490512052225');
  assert.equal(good.audio.ok, true);
  assert.equal(good.person.ok, true);
}

{
  const goodHops = hopsFrom('V'.repeat(80));
  const badPerson = buildLipsyncTrialPlan({
    hops: goodHops,
    person: { path: '/x/scene-establishing.jpg', width: 1920, height: 1080, centerSkinFraction: 0.04 },
    workflowId: '2089048490512052225',
  });
  assert.equal(badPerson.ok, false);
  assert.match(badPerson.reason, /近脸|特写|人脸|参考/);
}

console.log('test-mv-lipsync-prep: ok');
