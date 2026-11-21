import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRhAccount } from '../lib/mv-lipsync-preflight.mjs';
import {
  mapUiAccount,
  buildMvGenerateUiManifest,
  planMvGenerateUiPreflight,
  formatMvGenerateEstimateLabel,
} from '../lib/mv-generate-ui-preflight.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const segments = [
  { index: 1, duration: 15, start: 0, end: 15 },
  { index: 2, duration: 7.5, start: 15, end: 22.5 },
];
const prompts = ['p one', 'p two'];
const visualAssets = [
  { id: 'face-1', name: 'face', path: '/a/face.jpg', mediaType: 'image', category: '人物' },
  { id: 'bed-track', name: 'bed', path: '/a/bed.wav', mediaType: 'audio' },
];

const uiInput = (over = {}) => ({
  segments,
  prompts,
  visualAssets,
  account: { coins: 540, walletBalance: '5' },
  ...over,
});

// --- mapUiAccount ---
{
  assert.equal(mapUiAccount(null), null);
  assert.equal(mapUiAccount(undefined), null);
  const mapped = mapUiAccount({ coins: 0, walletBalance: '-0.013' });
  assert.equal(mapped.remainCoins, 0);
  assert.equal(mapped.remainMoney, '-0.013');
  const acc = normalizeRhAccount(mapped);
  assert.equal(acc.remainCoins, 0);
  assert.equal(acc.remainMoney, -0.013);
}

// --- manifest: placeholders, filter audio, path fallback, indexes subset ---
{
  const all = buildMvGenerateUiManifest({ segments, prompts, visualAssets });
  assert.equal(all.segments.length, 2);
  assert.deepEqual(all.segments.map((s) => s.path), ['ui://segment-audio', 'ui://segment-audio']);
  assert.equal(all.segments[1].prompt, 'p two');
  assert.equal(all.visualAssets.length, 1);
  assert.equal(all.visualAssets[0].path, '/a/face.jpg');

  const subset = buildMvGenerateUiManifest({ segments, prompts, visualAssets, indexes: [1] });
  assert.equal(subset.segments.length, 1);
  assert.equal(subset.segments[0].index, 2);
  assert.equal(subset.segments[0].prompt, 'p two');
  assert.equal(subset.segments[0].duration, 7.5);

  const noPath = buildMvGenerateUiManifest({
    segments: [segments[0]],
    prompts: ['p'],
    visualAssets: [{ id: 'still-B', mediaType: 'image' }, { mediaType: 'image' }],
  });
  assert.equal(noPath.visualAssets[0].path, 'still-B');
  assert.equal(noPath.visualAssets[1].path, 'ui://picture');
}

// --- estimate 15s+7.5s @ 24 coins/sec = 540 ---
{
  const plan = planMvGenerateUiPreflight(uiInput());
  assert.equal(plan.go, true);
  assert.equal(plan.estimate.total, 540);
  assert.deepEqual(plan.estimate.perSegment.map((s) => s.coins), [360, 180]);
}

// --- input failures keep codes + segment labels; UI audio placeholder is not MISSING_AUDIO ---
{
  const noPrompt = planMvGenerateUiPreflight(uiInput({ prompts: ['p one', '  '] }));
  assert.equal(noPrompt.go, false);
  assert.ok(noPrompt.codes.includes('MISSING_PROMPT'));
  assert.match(noPrompt.reason, /seg02|第\s*2|SEG\s*0?2/i);

  const noPics = planMvGenerateUiPreflight(uiInput({ visualAssets: [{ mediaType: 'audio', path: 'x' }] }));
  assert.equal(noPics.go, false);
  assert.ok(noPics.codes.includes('NO_PICTURES'));
  assert.match(noPics.reason, /参考图|人物|场景/);

  const tooLong = planMvGenerateUiPreflight(uiInput({
    segments: [{ index: 1, duration: 16 }, segments[1]],
  }));
  assert.equal(tooLong.go, false);
  assert.ok(tooLong.codes.includes('SEGMENT_TOO_LONG'));
  assert.match(tooLong.reason, /seg01|15/);

  assert.ok(!planMvGenerateUiPreflight(uiInput()).codes.includes('MISSING_AUDIO'));
}

// --- budget / account ---
{
  const broke = planMvGenerateUiPreflight(uiInput({ account: { coins: 0 } }));
  assert.equal(broke.go, false);
  assert.ok(broke.codes.includes('INSUFFICIENT_COINS'));

  const exact = planMvGenerateUiPreflight(uiInput({ account: { coins: 540, walletBalance: '1' } }));
  assert.equal(exact.go, true);

  const missing = planMvGenerateUiPreflight(uiInput({ account: undefined }));
  assert.equal(missing.go, false);
  assert.ok(missing.codes.includes('NO_ACCOUNT'));

  const nulled = planMvGenerateUiPreflight(uiInput({ account: null }));
  assert.equal(nulled.go, false);
  assert.ok(nulled.codes.includes('NO_ACCOUNT'));
}

// --- indexes subset only bills those segments ---
{
  const plan = planMvGenerateUiPreflight(uiInput({ indexes: [1], account: { coins: 180 } }));
  assert.equal(plan.go, true);
  assert.equal(plan.estimate.total, 180);
  assert.equal(plan.estimate.perSegment.length, 1);
}

// --- Chinese estimate labels ---
{
  assert.equal(formatMvGenerateEstimateLabel(null, { loading: true }), '预估 … · 钱包读取中');
  const broke = planMvGenerateUiPreflight(uiInput({ account: { coins: 0, walletBalance: '-0.013' } }));
  const brokeLabel = formatMvGenerateEstimateLabel(broke);
  assert.match(brokeLabel, /预估 540 币（2 段）/);
  assert.match(brokeLabel, /钱包 0 币/);
  assert.match(brokeLabel, /余额不足/);
  const go = planMvGenerateUiPreflight(uiInput({ account: { coins: 540 } }));
  const goLabel = formatMvGenerateEstimateLabel(go);
  assert.match(goLabel, /预估 540 币（2 段）/);
  assert.match(goLabel, /钱包 540 币/);
}

// --- points billing: mapUiAccount, spendable balance, 积分 labels ---
{
  const mapped = mapUiAccount({ coins: 0, points: 1939.39, walletBalance: '-0.013' });
  assert.equal(mapped.remainCoins, 0);
  assert.equal(mapped.remainPoint, 1939.39);
  const acc = normalizeRhAccount(mapped);
  assert.equal(acc.remainPoint, 1939.39);
  assert.equal(acc.remainCoins, 0);
  assert.equal(acc.remainMoney, -0.013);

  const go = planMvGenerateUiPreflight(uiInput({ account: { coins: 0, points: 540, walletBalance: '-0.013' } }));
  assert.equal(go.go, true);
  assert.equal(go.estimate.total, 540);
  const goLabel = formatMvGenerateEstimateLabel(go);
  assert.match(goLabel, /预估 540 积分（2 段）/);
  assert.match(goLabel, /钱包 540 积分/);

  const short = planMvGenerateUiPreflight(uiInput({ account: { coins: 99999, points: 539 } }));
  assert.equal(short.go, false);
  assert.ok(short.codes.includes('INSUFFICIENT_COINS'));
  const shortLabel = formatMvGenerateEstimateLabel(short);
  assert.match(shortLabel, /积分/);
  assert.match(shortLabel, /539/);
  assert.match(shortLabel, /余额不足/);
}

// --- UI lib has no node: imports ---
{
  const src = readFileSync(path.join(repoRoot, 'lib/mv-generate-ui-preflight.mjs'), 'utf8');
  assert.ok(!/from ['"]node:/.test(src));
}

// --- page wiring ---
{
  const page = readFileSync(path.join(repoRoot, 'app/mv/page.tsx'), 'utf8');
  assert.match(page, /from "\.\.\/\.\.\/lib\/mv-generate-ui-preflight\.mjs"/);
  assert.match(page, /planMvGenerateUiPreflight/);
  assert.match(page, /formatMvGenerateEstimateLabel/);

  const fullStart = page.indexOf('async function generateFullMv(');
  assert.ok(fullStart >= 0, 'missing generateFullMv');
  const fullBody = page.slice(fullStart, page.indexOf('function openBatch(', fullStart));
  assert.match(fullBody, /预估/, 'generateFullMv success notice must include coin estimate');

  const enqueueStart = page.search(/async function enqueueGeneration\(/);
  assert.ok(enqueueStart >= 0, 'missing enqueueGeneration');
  const enqueueBody = page.slice(enqueueStart, page.indexOf('async function drainGenerationQueue(', enqueueStart));
  assert.match(enqueueBody, /async function enqueueGeneration\(/, 'enqueueGeneration must be awaitable to refresh the wallet');
  assert.match(enqueueBody, /provider === "runninghub"/);
  assert.match(enqueueBody, /await refreshRhAccount\(/);
  assert.match(enqueueBody, /planMvGenerateUiPreflight\(/);
  assert.match(enqueueBody, /setNotice\(\s*plan\.reason\s*\)/);
  assert.match(enqueueBody, /if\s*\(\s*!plan\.go\s*\)/);
  const reviewChangePos = enqueueBody.search(/markSubmitted|updateGenerationQueue/);
  const gateReturnPos = enqueueBody.search(/if\s*\(\s*!plan\.go\s*\)[\s\S]{0,200}return/);
  assert.ok(gateReturnPos >= 0, 'runninghub preflight must return before enqueue');
  assert.ok(reviewChangePos < 0 || gateReturnPos < reviewChangePos, 'must not change review/queue state when preflight blocks');

  const cloudStart = page.indexOf('async function generateCloud(');
  assert.ok(cloudStart >= 0, 'missing generateCloud');
  const cloudBody = page.slice(cloudStart, page.indexOf('async function generateFullMv(', cloudStart));
  const preflightPos = cloudBody.indexOf('planMvGenerateUiPreflight(');
  const postPos = cloudBody.indexOf('/api/local/runninghub/jobs');
  assert.ok(preflightPos >= 0, 'generateCloud must run UI preflight');
  assert.ok(postPos >= 0, 'generateCloud must still post jobs after a passing preflight');
  assert.ok(preflightPos < postPos, 'generateCloud must preflight before the first jobs POST');
  assert.match(cloudBody, /throw new Error\(\s*plan\.reason\s*\)|throw new Error\(plan\.reason\)/);

  assert.match(page, /refreshRhAccount[\s\S]{0,800}return (data|null)/);

  const toolbar = page.slice(page.indexOf('云端批量生成'), page.indexOf('合并视频'));
  assert.match(page, /formatMvGenerateEstimateLabel\(/);
  assert.match(page, /mv-generate-estimate/);

  const footerStart = page.indexOf('<footer><div><small>执行方式</small>');
  assert.ok(footerStart >= 0, 'missing batch modal footer');
  const footer = page.slice(footerStart, page.indexOf('</footer>', footerStart) + 9);
  assert.match(footer, /batchProvider === "runninghub"/);
  assert.match(footer, /formatMvGenerateEstimateLabel|batchGenerate|planMvGenerateUiPreflight/);
  assert.match(footer, /disabled=\{[^}]*batchSelection/);
  assert.match(footer, /title=/);

  assert.match(page, /points\?: number/);
  assert.match(page, /rhAccount\?\.points|rhAccount\.points/);
  assert.match(page, /消耗 \$\{formatRhCoins\(entry\.costCoins\)\} \$\{/);
}

// --- plugin passes points through and prefers chargedPoint ---
{
  const plugin = readFileSync(path.join(repoRoot, 'vite-plugins/runninghub.ts'), 'utf8');
  assert.match(plugin, /points:\s*Number\(\s*data\.remainPoint\s*\)/);
  assert.match(plugin, /pickRhJobCost|chargedPoint/);
  const cloud = readFileSync(path.join(repoRoot, 'lib/mv-cloud-generate.mjs'), 'utf8');
  assert.match(cloud, /pickRhJobCost|chargedPoint/);
  assert.match(cloud, /remainPoint/);
}

// --- client bundle safety for the new lib ---
{
  const seen = new Set();
  const offenders = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:')) offenders.push(`${path.relative(repoRoot, file)} -> ${spec}`);
      else if (spec.startsWith('.') && /\.m?js$/.test(spec)) visit(path.resolve(path.dirname(file), spec));
    }
  };
  visit(path.join(repoRoot, 'lib/mv-generate-ui-preflight.mjs'));
  assert.deepEqual(offenders, [], `UI preflight imports node builtins: ${offenders.join(', ')}`);
}

console.log('test-mv-generate-ui-preflight ok');
