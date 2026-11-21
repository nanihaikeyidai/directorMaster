import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEED_RH_COST_OBSERVATIONS,
  DEFAULT_RH_COST_MARGIN,
  appendCostObservation,
  observationFromSettledJob,
  resolveMvCostPerSec,
  resolveLipsyncMinCost,
} from '../lib/mv-rh-cost-calibrate.mjs';
import { DEFAULT_MV_COINS_PER_SEC, planMvGeneratePreflight } from '../lib/mv-generate-preflight.mjs';
import { planMvGenerateUiPreflight, formatMvGenerateEstimateLabel } from '../lib/mv-generate-ui-preflight.mjs';
import { DEFAULT_LIPSYNC_MIN_COINS, checkLipsyncBudget, planLipsyncPreflight } from '../lib/mv-lipsync-preflight.mjs';
import { runMvGenerate } from '../lib/mv-cloud-generate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIXEL_ID = '2087128116820013058';
const XUNFENG_ID = '2089048490512052225';

const allExist = () => true;
const manifest = (over = {}) => ({
  projectId: 'p1',
  sourcePath: '/a/song.wav',
  visualAssets: [{ path: '/a/face.jpg', mediaType: 'image' }],
  segments: [
    { index: 1, duration: 15, path: '/a/s1.wav', prompt: 'p one' },
    { index: 2, duration: 7.5, path: '/a/s2.wav', prompt: 'p two' },
  ],
  ...over,
});
const pointsAccount = (remainPoint) => ({ remainCoins: 0, remainMoney: -0.013, remainPoint, apiType: 'NORMAL' });

// 1. seed observation and calibrated rates
{
  assert.equal(DEFAULT_RH_COST_MARGIN, 1.25);
  assert.equal(SEED_RH_COST_OBSERVATIONS.length, 1);
  const seed = SEED_RH_COST_OBSERVATIONS[0];
  assert.equal(seed.workflowId, PIXEL_ID);
  assert.equal(seed.durationSec, 15);
  assert.equal(seed.cost, 116.28);
  assert.equal(seed.source, 'chargedPoint');
  assert.equal(seed.settleMode, 'POINT');
  assert.equal(seed.unit, 'points');
  assert.equal(seed.taskId, '2124001118332866561');
  assert.equal(seed.date, '2026-11-21');

  const rate = resolveMvCostPerSec({ unit: 'points', workflowId: PIXEL_ID });
  assert.equal(rate.source, 'calibrated');
  assert.equal(rate.observationCount, 1);
  assert.equal(rate.maxObservedPerSec, 116.28 / 15);
  assert.equal(rate.coinsPerSec, (116.28 / 15) * 1.25);
  assert.equal(rate.margin, 1.25);
  assert.equal(rate.unit, 'points');
  assert.equal(rate.workflowId, PIXEL_ID);
  assert.equal(Math.ceil(15 * rate.coinsPerSec), 146);
  assert.equal(Math.ceil(15 * rate.coinsPerSec) + Math.ceil(7.5 * rate.coinsPerSec), 219);

  const min = resolveLipsyncMinCost({ unit: 'points', workflowId: PIXEL_ID, durationSec: 15 });
  assert.equal(min.source, 'calibrated');
  assert.equal(min.minCoins, 146);
}

// 2. no workflowId / unknown workflowId stay on 24 and 400
{
  assert.equal(DEFAULT_MV_COINS_PER_SEC, 24);
  assert.equal(DEFAULT_LIPSYNC_MIN_COINS, 400);
  const noWf = resolveMvCostPerSec({ unit: 'points' });
  assert.equal(noWf.source, 'default');
  assert.equal(noWf.coinsPerSec, 24);
  assert.equal(noWf.observationCount, 0);

  const unknown = resolveMvCostPerSec({ unit: 'points', workflowId: XUNFENG_ID });
  assert.equal(unknown.source, 'default');
  assert.equal(unknown.coinsPerSec, 24);

  assert.equal(resolveLipsyncMinCost({ unit: 'points' }).minCoins, 400);
  assert.equal(resolveLipsyncMinCost({ unit: 'points', workflowId: XUNFENG_ID }).minCoins, 400);
  assert.equal(resolveLipsyncMinCost({ unit: 'points', workflowId: XUNFENG_ID }).source, 'default');

  const plan = planMvGeneratePreflight({
    manifest: manifest(),
    account: pointsAccount(540),
    exists: allExist,
  });
  assert.equal(plan.go, true);
  assert.equal(plan.estimate.total, 540);
  assert.notEqual(plan.estimate.source, 'calibrated');
}

// 3. generate preflight: pixel + points 219 go / 218 insufficient
{
  const go = planMvGeneratePreflight({
    manifest: manifest(),
    account: pointsAccount(219),
    exists: allExist,
    workflowId: PIXEL_ID,
  });
  assert.equal(go.estimate.total, 219);
  assert.deepEqual(go.estimate.perSegment.map((s) => s.coins), [146, 73]);
  assert.equal(go.estimate.source, 'calibrated');
  assert.equal(go.estimate.observationCount, 1);
  assert.equal(go.go, true);
  assert.match(go.reason, /积分/);

  const no = planMvGeneratePreflight({
    manifest: manifest(),
    account: pointsAccount(218),
    exists: allExist,
    workflowId: PIXEL_ID,
  });
  assert.equal(no.go, false);
  assert.equal(no.estimate.total, 219);
  assert.ok(no.codes.includes('INSUFFICIENT_COINS'));
  assert.match(no.reason, /218/);
  assert.match(no.reason, /积分/);
}

// 4. lipsync min: pixel + points 146 go / 145 insufficient; xunfeng stays 400
{
  const go = checkLipsyncBudget({ account: pointsAccount(146), workflowId: PIXEL_ID });
  assert.equal(go.ok, true);
  assert.equal(go.minCoins, 146);
  assert.match(go.reason, /146/);
  assert.match(go.reason, /按实扣校准/);

  const no = checkLipsyncBudget({ account: pointsAccount(145), workflowId: PIXEL_ID });
  assert.equal(no.ok, false);
  assert.equal(no.code, 'INSUFFICIENT_COINS');
  assert.equal(no.minCoins, 146);
  assert.match(no.reason, /145/);
  assert.match(no.reason, /146/);
  assert.match(no.reason, /按实扣校准/);

  const xunfeng = checkLipsyncBudget({ account: pointsAccount(400), workflowId: XUNFENG_ID });
  assert.equal(xunfeng.ok, true);
  assert.equal(xunfeng.minCoins, 400);
  assert.doesNotMatch(xunfeng.reason, /按实扣校准/);

  const planned = planLipsyncPreflight({
    trialPlan: { ok: true, reason: 'trial ok', workflowId: PIXEL_ID },
    account: pointsAccount(146),
    ledger: [],
    date: '2026-11-22',
  });
  assert.equal(planned.go, true);
  assert.equal(planned.checks.budget.minCoins, 146);
  assert.match(planned.reason, /按实扣校准/);
}

// 5. explicit coinsPerSec / minCoins override calibration
{
  const plan = planMvGeneratePreflight({
    manifest: manifest(),
    account: pointsAccount(540),
    exists: allExist,
    workflowId: PIXEL_ID,
    coinsPerSec: 24,
  });
  assert.equal(plan.estimate.total, 540);
  assert.notEqual(plan.estimate.source, 'calibrated');

  const budget = checkLipsyncBudget({ account: pointsAccount(400), workflowId: PIXEL_ID, minCoins: 400 });
  assert.equal(budget.ok, true);
  assert.equal(budget.minCoins, 400);
  assert.doesNotMatch(budget.reason, /按实扣校准/);
}

// 6. coin-unit account + pixel workflowId still uses 24 (no coin observation)
{
  const plan = planMvGeneratePreflight({
    manifest: manifest(),
    account: { remainCoins: 540, remainMoney: 5, apiType: 'NORMAL' },
    exists: allExist,
    workflowId: PIXEL_ID,
  });
  assert.equal(plan.go, true);
  assert.equal(plan.estimate.total, 540);
  assert.equal(plan.estimate.source, 'default');
  assert.equal(plan.estimate.coinsPerSec, 24);
}

// 7. appendCostObservation validates and dedupes same taskId
{
  const entry = { workflowId: PIXEL_ID, durationSec: 15, cost: 116.28, unit: 'points', source: 'chargedPoint', taskId: 't-dup' };
  const first = appendCostObservation([], entry);
  assert.equal(first.length, 1);
  const second = appendCostObservation(first, { ...entry, cost: 200 });
  assert.equal(second.length, 1);
  assert.equal(second[0].cost, 116.28);
  assert.equal(first.length, 1);
  assert.notEqual(first, second);
  const other = appendCostObservation(first, { ...entry, taskId: 't-other', cost: 90 });
  assert.equal(other.length, 2);
  assert.throws(() => appendCostObservation([], { ...entry, durationSec: 0 }), /duration/);
  assert.throws(() => appendCostObservation([], { ...entry, cost: -1 }), /cost/);
  assert.throws(() => appendCostObservation([], { ...entry, workflowId: '' }), /workflowId/);
  assert.throws(() => appendCostObservation([], { ...entry, unit: 'tokens' }), /unit/);
}

// 8. observationFromSettledJob prefers chargedPoint
{
  const obs = observationFromSettledJob({
    workflowId: PIXEL_ID,
    durationSec: 15,
    chargedPoint: '116.28',
    consumeCoins: 356,
    settleMode: 'POINT',
    taskId: '2124001118332866561',
    date: '2026-11-21',
    workflowName: '像素幻想 MiniMaxH3ReferenceToVideo',
  });
  assert.equal(obs.unit, 'points');
  assert.equal(obs.cost, 116.28);
  assert.equal(obs.source, 'chargedPoint');
  assert.equal(obs.settleMode, 'POINT');
  assert.equal(obs.taskId, '2124001118332866561');
  const coinsOnly = observationFromSettledJob({
    workflowId: PIXEL_ID,
    durationSec: 15,
    consumeCoins: 356,
  });
  assert.equal(coinsOnly.unit, 'coins');
  assert.equal(coinsOnly.cost, 356);
  assert.equal(coinsOnly.source, 'consumeCoins');
  assert.equal(observationFromSettledJob({ workflowId: PIXEL_ID, durationSec: 15 }), null);
}

// 9. UI preflight threading + calibrated label
{
  const uiInput = {
    segments: [
      { index: 1, duration: 15, start: 0, end: 15 },
      { index: 2, duration: 7.5, start: 15, end: 22.5 },
    ],
    prompts: ['p one', 'p two'],
    visualAssets: [{ id: 'face-1', path: '/a/face.jpg', mediaType: 'image' }],
  };
  const go = planMvGenerateUiPreflight({
    ...uiInput,
    account: { coins: 0, points: 219, walletBalance: '-0.013' },
    workflowId: PIXEL_ID,
  });
  assert.equal(go.go, true);
  assert.equal(go.estimate.total, 219);
  assert.equal(go.estimate.source, 'calibrated');
  const goLabel = formatMvGenerateEstimateLabel(go);
  assert.match(goLabel, /预估 219 积分（2 段，按实扣校准）/);
  assert.match(goLabel, /钱包 219 积分/);

  const short = planMvGenerateUiPreflight({
    ...uiInput,
    account: { coins: 0, points: 218 },
    workflowId: PIXEL_ID,
  });
  assert.equal(short.go, false);
  assert.match(formatMvGenerateEstimateLabel(short), /按实扣校准/);
  assert.match(formatMvGenerateEstimateLabel(short), /余额不足/);

  const uncal = planMvGenerateUiPreflight({
    ...uiInput,
    account: { coins: 0, points: 540 },
  });
  assert.equal(uncal.estimate.total, 540);
  assert.doesNotMatch(formatMvGenerateEstimateLabel(uncal), /按实扣校准/);
}

// 10. new lib has no node: import
{
  const src = readFileSync(path.join(repoRoot, 'lib/mv-rh-cost-calibrate.mjs'), 'utf8');
  assert.doesNotMatch(src, /from ['"]node:/);
  assert.doesNotMatch(src, /mv-lipsync-preflight|mv-generate-preflight/);
}

// 11. max rate is used (not average); useSeed false falls back
{
  const extra = appendCostObservation([], {
    workflowId: PIXEL_ID,
    durationSec: 15,
    cost: 200,
    unit: 'points',
    source: 'chargedPoint',
    taskId: 't-higher',
  });
  const rate = resolveMvCostPerSec({ unit: 'points', workflowId: PIXEL_ID, observations: extra });
  assert.equal(rate.observationCount, 2);
  assert.equal(rate.maxObservedPerSec, 200 / 15);
  assert.equal(rate.coinsPerSec, (200 / 15) * 1.25);
  const seededOff = resolveMvCostPerSec({ unit: 'points', workflowId: PIXEL_ID, useSeed: false });
  assert.equal(seededOff.source, 'default');
  assert.equal(seededOff.coinsPerSec, 24);
}

// 12. production wiring: cloud generate + MV page pass workflowId
{
  const cloud = readFileSync(path.join(repoRoot, 'lib/mv-cloud-generate.mjs'), 'utf8');
  assert.match(cloud, /planMvGeneratePreflight\(/);
  assert.match(cloud, /preflightOpts[\s\S]{0,200}workflowId|workflowId,[\s\S]{0,120}planMvGeneratePreflight|planMvGeneratePreflight\(\{[^}]*workflowId/);

  const page = readFileSync(path.join(repoRoot, 'app/mv/page.tsx'), 'utf8');
  const callRe = /planMvGenerateUiPreflight\(\{[\s\S]*?\}\)/g;
  const calls = page.match(callRe) || [];
  assert.ok(calls.length >= 4, `expected UI preflight call sites, got ${calls.length}`);
  for (const call of calls) {
    assert.match(call, /workflowId:\s*cloudWorkflowId/, `missing cloudWorkflowId pass-through in ${call.slice(0, 160)}`);
  }
}

console.log('test-mv-rh-cost-calibrate ok');
