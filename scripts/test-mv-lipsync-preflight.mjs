import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LIPSYNC_MIN_COINS,
  checkLipsyncBudget,
  checkLipsyncDailyQuota,
  normalizeRhAccount,
  planLipsyncPreflight,
  pickRhJobCost,
  recordLipsyncAttempt,
} from '../lib/mv-lipsync-preflight.mjs';
import { buildLipsyncTrialPlan } from '../lib/mv-lipsync-prep.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');
const libPath = path.join(repoRoot, 'lib/mv-lipsync-preflight.mjs');

const vocalHops = (n = 80) => Array.from({ length: n }, (_, i) => ({ t: i * 0.25, rmsDb: -20, midDb: -18, bassDb: -28 }));
const silentHops = (n = 80) => Array.from({ length: n }, (_, i) => ({ t: i * 0.25, rmsDb: -70, midDb: -72, bassDb: -70 }));
const goodPerson = { path: '/x/ref-crop.jpg', width: 768, height: 1200, centerSkinFraction: 0.2 };
const D = '2026-11-18';

// 1. account normalize + zero wallet
{
  assert.equal(DEFAULT_LIPSYNC_MIN_COINS, 400);
  const acc = normalizeRhAccount({ code: 0, data: { remainCoins: '0', remainMoney: '-0.0130', apiType: 'NORMAL' } });
  assert.deepEqual(acc, { remainCoins: 0, remainMoney: -0.013, apiType: 'NORMAL' });
  assert.deepEqual(normalizeRhAccount({ remainCoins: '6650' }).remainCoins, 6650);
  assert.equal(normalizeRhAccount(null), null);
  const b = checkLipsyncBudget({ account: acc });
  assert.equal(b.ok, false);
  assert.equal(b.code, 'INSUFFICIENT_COINS');
  assert.match(b.reason, /0/);
  assert.match(b.reason, /400/);
}
// 2. enough coins / custom threshold / missing account
{
  assert.equal(checkLipsyncBudget({ account: { remainCoins: 6650 } }).ok, true);
  assert.equal(checkLipsyncBudget({ account: { remainCoins: 500 }, minCoins: 600 }).code, 'INSUFFICIENT_COINS');
  assert.equal(checkLipsyncBudget({ account: null }).code, 'NO_ACCOUNT');
}
// 3. daily quota
{
  const q0 = checkLipsyncDailyQuota({ ledger: [], date: D });
  assert.equal(q0.ok, true); assert.equal(q0.attemptKind, 'first');
  const t1 = [{ date: D, status: 'failed', failureKind: 'technical' }];
  const q1 = checkLipsyncDailyQuota({ ledger: t1, date: D });
  assert.equal(q1.ok, true); assert.equal(q1.attemptKind, 'retry');
  const t2 = [...t1, { date: D, status: 'failed', failureKind: 'technical' }];
  assert.equal(checkLipsyncDailyQuota({ ledger: t2, date: D }).code, 'RETRY_EXHAUSTED');
  assert.equal(checkLipsyncDailyQuota({ ledger: [{ date: D, status: 'success' }], date: D }).code, 'DAILY_SUCCESS_REACHED');
  assert.equal(checkLipsyncDailyQuota({ ledger: [{ date: D, status: 'failed', failureKind: 'selection' }], date: D }).code, 'NON_TECH_FAILURE');
  assert.equal(checkLipsyncDailyQuota({ ledger: [{ date: D, status: 'failed', failureKind: 'reference' }], date: D }).code, 'NON_TECH_FAILURE');
  const other = [{ date: '2026-11-17', status: 'success' }];
  assert.equal(checkLipsyncDailyQuota({ ledger: other, date: D }).ok, true);
}
// 4. record immutability + validation
{
  const base = [];
  const next = recordLipsyncAttempt(base, { date: D, status: 'success', taskId: 't1' });
  assert.equal(base.length, 0);
  assert.equal(next.length, 1);
  assert.equal(next[0].status, 'success');
  assert.throws(() => recordLipsyncAttempt(base, { date: D, status: 'weird' }), /status/);
  assert.throws(() => recordLipsyncAttempt(base, { date: D, status: 'failed' }), /failureKind/);
  assert.throws(() => recordLipsyncAttempt(base, { date: 'bad', status: 'success' }), /date/);
}
// 5. combined plan
{
  const badTrial = buildLipsyncTrialPlan({ hops: silentHops(), person: goodPerson });
  assert.equal(badTrial.ok, false);
  const p = planLipsyncPreflight({ trialPlan: badTrial, account: { remainCoins: 0 }, ledger: [], date: D });
  assert.equal(p.go, false); assert.equal(p.mode, 'skip');
  assert.ok(p.codes.includes('TRIAL_GATE'));
  assert.ok(p.codes.includes('INSUFFICIENT_COINS'));
  assert.match(p.reason, /币/);
  const goodTrial = buildLipsyncTrialPlan({ hops: vocalHops(), person: goodPerson });
  const ok = planLipsyncPreflight({ trialPlan: goodTrial, account: { remainCoins: 6650 }, ledger: [], date: D });
  assert.equal(ok.go, true); assert.equal(ok.mode, 'go'); assert.deepEqual(ok.codes, []);
  assert.equal(ok.checks.quota.attemptKind, 'first');
  assert.equal(ok.workflowId, goodTrial.workflowId);
}
// 6. CLI
{
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lipsync-preflight-'));
  const hopsPath = path.join(dir, 'hops.json');
  writeFileSync(hopsPath, JSON.stringify(vocalHops()));
  const accZero = path.join(dir, 'acc0.json');
  writeFileSync(accZero, JSON.stringify({ code: 0, data: { remainCoins: '0', remainMoney: '-0.0130', apiType: 'NORMAL' } }));
  const accRich = path.join(dir, 'acc1.json');
  writeFileSync(accRich, JSON.stringify({ code: 0, data: { remainCoins: '6650', apiType: 'NORMAL' } }));
  const env = { ...process.env, RUNNINGHUB_API_KEY: '' };
  const common = ['--hops-json', hopsPath, '--center-skin', '0.2', '--date', D, '--json'];
  const run = (args) => spawnSync(process.execPath, [cliPath, 'mv-lipsync-preflight', ...args], { encoding: 'utf8', env });
  const r0 = run([...common, '--account-json', accZero]);
  assert.equal(r0.status, 1, r0.stderr);
  assert.match(r0.stdout, /INSUFFICIENT_COINS/);
  const r1 = run([...common, '--account-json', accRich]);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.equal(JSON.parse(r1.stdout).go, true);
  const r2 = run(common);
  assert.equal(r2.status, 1);
  assert.match(r2.stdout, /NO_ACCOUNT/);
  // ledger write then quota blocks
  const ledgerPath = path.join(dir, 'ledger.json');
  const w = spawnSync(process.execPath, [cliPath, 'mv-lipsync-ledger', '--ledger', ledgerPath, '--status', 'success', '--task-id', 'abc', '--date', D], { encoding: 'utf8', env });
  assert.equal(w.status, 0, w.stderr);
  assert.equal(JSON.parse(readFileSync(ledgerPath, 'utf8')).length, 1);
  const r3 = run([...common, '--account-json', accRich, '--ledger', ledgerPath]);
  assert.equal(r3.status, 1);
  assert.match(r3.stdout, /DAILY_SUCCESS_REACHED/);

  const PIXEL_ID = '2087128116820013058';
  const accPointsOk = path.join(dir, 'acc-points-132.json');
  writeFileSync(accPointsOk, JSON.stringify({ remainCoins: 0, remainMoney: -0.013, remainPoint: 132.36, apiType: 'NORMAL' }));
  const accPointsShort = path.join(dir, 'acc-points-102.json');
  writeFileSync(accPointsShort, JSON.stringify({ remainCoins: 0, remainMoney: -0.013, remainPoint: 102, apiType: 'NORMAL' }));
  const r10 = run([...common, '--duration', '10', '--workflow-id', PIXEL_ID, '--account-json', accPointsOk]);
  assert.equal(r10.status, 0, r10.stdout + r10.stderr);
  const parsed10 = JSON.parse(r10.stdout);
  assert.equal(parsed10.go, true);
  assert.equal(parsed10.checks.budget.minCoins, 103);
  assert.match(parsed10.reason, /10s/);
  const r10no = run([...common, '--duration', '10', '--workflow-id', PIXEL_ID, '--account-json', accPointsShort]);
  assert.equal(r10no.status, 1, r10no.stdout + r10no.stderr);
  assert.match(r10no.stdout, /INSUFFICIENT_COINS/);
  assert.match(r10no.stdout, /单次 10s 试片门槛 103/);
  assert.doesNotMatch(r10no.stdout, /15s 试片门槛/);
}
// 7. browser-safe lib
{
  const src = readFileSync(libPath, 'utf8');
  assert.doesNotMatch(src, /from ['"]node:/);
}
// 8. remainPoint / 积分 spendable balance + cost recording
{
  const official = { code: 0, data: { remainCoins: '0', remainMoney: '-0.0130', remainPoint: 1939.39, apiType: 'NORMAL' } };
  const acc = normalizeRhAccount(official);
  assert.equal(acc.remainCoins, 0);
  assert.equal(acc.remainMoney, -0.013);
  assert.equal(acc.remainPoint, 1939.39);
  assert.equal(acc.apiType, 'NORMAL');
  const stringPoints = normalizeRhAccount({ remainCoins: 0, remainPoint: '1939.39' });
  assert.equal(stringPoints.remainPoint, 1939.39);
  const legacy = normalizeRhAccount({ code: 0, data: { remainCoins: '0', remainMoney: '-0.0130', apiType: 'NORMAL' } });
  assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'remainPoint'), false);

  const funded = checkLipsyncBudget({ account: official });
  assert.equal(funded.ok, true);
  assert.equal(funded.code, null);
  assert.match(funded.reason, /积分/);
  assert.match(funded.reason, /1939/);

  const emptyPoints = checkLipsyncBudget({ account: { remainCoins: 0, remainMoney: -0.013, remainPoint: 0 } });
  assert.equal(emptyPoints.ok, false);
  assert.equal(emptyPoints.code, 'INSUFFICIENT_COINS');
  assert.match(emptyPoints.reason, /0/);
  assert.match(emptyPoints.reason, /400/);
  assert.match(emptyPoints.reason, /积分/);

  const leftoverCoins = checkLipsyncBudget({ account: { remainCoins: 99999, remainPoint: 0 } });
  assert.equal(leftoverCoins.ok, false);
  assert.equal(leftoverCoins.code, 'INSUFFICIENT_COINS');

  const goodTrial = buildLipsyncTrialPlan({ hops: vocalHops(), person: goodPerson });
  const go = planLipsyncPreflight({ trialPlan: goodTrial, account: official, ledger: [], date: D });
  assert.equal(go.go, true);
  assert.equal(go.mode, 'go');
  assert.match(go.reason, /积分/);

  const billed = pickRhJobCost({ chargedPoint: 312, consumeCoins: 356, settleMode: 'POINT' });
  assert.equal(billed.costCoins, 312);
  assert.equal(billed.source, 'chargedPoint');
  const wrapped = pickRhJobCost({ data: [{ consumeCoins: '356' }] });
  assert.equal(wrapped.costCoins, 356);
  assert.equal(wrapped.source, 'consumeCoins');
}
console.log('mv-lipsync-preflight ok');
