import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MV_COINS_PER_SEC,
  estimateMvGenerateCoins,
  validateMvGenerateInputs,
  planMvGeneratePreflight,
} from '../lib/mv-generate-preflight.mjs';
import { runMvGenerate } from '../lib/mv-cloud-generate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const rich = { code: 0, data: { remainCoins: '540', remainMoney: '5', apiType: 'NORMAL' } };
const broke = { code: 0, data: { remainCoins: '0', remainMoney: '-0.0130', apiType: 'NORMAL' } };

// 1. estimate
{
  assert.equal(DEFAULT_MV_COINS_PER_SEC, 24);
  const e = estimateMvGenerateCoins(manifest().segments);
  assert.equal(e.total, 540);
  assert.deepEqual(e.perSegment.map((s) => s.coins), [360, 180]);
  const e2 = estimateMvGenerateCoins([{ index: 1 }, { index: 2, duration: 'x' }]);
  assert.equal(e2.total, 720);
  assert.equal(e2.perSegment[0].assumed, true);
  assert.equal(estimateMvGenerateCoins(manifest().segments, { coinsPerSec: 10 }).total, 225);
}

// 2. inputs
{
  assert.equal(validateMvGenerateInputs(manifest(), { exists: allExist }).ok, true);
  const noPrompt = manifest();
  noPrompt.segments[1].prompt = '  ';
  const r = validateMvGenerateInputs(noPrompt, { exists: allExist });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === 'MISSING_PROMPT' && /seg02/.test(i.reason)));
  const missingFiles = validateMvGenerateInputs(manifest(), { exists: (p) => !/s2\.wav|face/.test(p) });
  const codes = missingFiles.issues.map((i) => i.code);
  assert.ok(codes.includes('MISSING_AUDIO'));
  assert.ok(codes.includes('MISSING_PICTURE'));
  const long = manifest();
  long.segments[0].duration = 15.6;
  assert.ok(validateMvGenerateInputs(long, { exists: allExist }).issues.some((i) => i.code === 'SEGMENT_TOO_LONG'));
  assert.ok(validateMvGenerateInputs(manifest({ segments: [] }), { exists: allExist }).issues.some((i) => i.code === 'NO_SEGMENTS'));
  assert.ok(validateMvGenerateInputs(manifest({ visualAssets: [] }), { exists: allExist }).issues.some((i) => i.code === 'NO_PICTURES'));
}

// 3. budget plan
{
  const go = planMvGeneratePreflight({ manifest: manifest(), account: rich, exists: allExist });
  assert.equal(go.go, true);
  assert.equal(go.estimate.total, 540);
  const z = planMvGeneratePreflight({ manifest: manifest(), account: broke, exists: allExist });
  assert.equal(z.go, false);
  assert.deepEqual(z.codes, ['INSUFFICIENT_COINS']);
  assert.match(z.reason, /0 币/);
  assert.match(z.reason, /540/);
  const reserve = planMvGeneratePreflight({ manifest: manifest(), account: rich, exists: allExist, reserveCoins: 1 });
  assert.equal(reserve.go, false);
  const none = planMvGeneratePreflight({ manifest: manifest(), exists: allExist });
  assert.deepEqual(none.codes, ['NO_ACCOUNT']);
  const skipBudget = planMvGeneratePreflight({ manifest: manifest(), exists: allExist, requireAccount: false });
  assert.equal(skipBudget.go, true);
  assert.equal(skipBudget.budget, null);
}

// 4. runMvGenerate --watch rejects before any upload/create
const tmp = mkdtempSync(path.join(os.tmpdir(), 'mvgen-pre-'));
const wfPath = path.join(tmp, 'wf.json');
writeFileSync(wfPath, JSON.stringify({ nodes: [] }));
const files = ['song.wav', 's1.wav', 's2.wav', 'face.jpg'].map((f) => { const p = path.join(tmp, f); writeFileSync(p, 'x'); return p; });
const realManifest = (over = {}) => ({
  projectId: 'p1',
  sourcePath: files[0],
  visualAssets: [{ path: files[3], mediaType: 'image' }],
  segments: [
    { index: 1, duration: 15, path: files[1], prompt: 'p one' },
    { index: 2, duration: 7.5, path: files[2], prompt: 'p two' },
  ],
  ...over,
});
const stub = (account) => {
  const calls = { upload: 0, create: 0, account: 0 };
  return {
    calls,
    rh: {
      callRh: async (_b, _k, endpoint) => {
        if (endpoint.includes('accountStatus')) { calls.account += 1; return account; }
        calls.create += 1; return { code: 999 };
      },
      uploadRh: async () => { calls.upload += 1; return 'x'; },
    },
  };
};
{
  const s = stub(broke);
  await assert.rejects(
    runMvGenerate({ manifest: realManifest(), projectFile: path.join(tmp, 'project.json'), apiKey: 'abc', watch: true, dryRun: false, workflowTemplatePath: wfPath, rh: s.rh }),
    /INSUFFICIENT_COINS|低于/,
  );
  assert.equal(s.calls.upload, 0);
  assert.equal(s.calls.create, 0);
  assert.equal(s.calls.account, 1);
  assert.ok(existsSync(path.join(tmp, 'cloud-out', 'generate-preflight.json')));
}
{
  const s = stub(rich);
  const m = realManifest();
  m.segments[1].prompt = '';
  await assert.rejects(
    runMvGenerate({ manifest: m, projectFile: path.join(tmp, 'project.json'), apiKey: 'abc', watch: true, dryRun: false, workflowTemplatePath: wfPath, rh: s.rh }),
    /MISSING_PROMPT|seg02/,
  );
  assert.equal(s.calls.upload, 0);
  assert.equal(s.calls.create, 0);
}

// 5. dry-run writes preflight, no network
{
  const s = stub(rich);
  const out = path.join(tmp, 'dry');
  const res = await runMvGenerate({ manifest: realManifest(), projectFile: path.join(tmp, 'project.json'), dryRun: true, outDir: out, rh: s.rh });
  assert.equal(res.dryRun, true);
  assert.equal(res.preflight.estimate.total, 540);
  assert.equal(res.preflight.budget, null);
  assert.equal(s.calls.account + s.calls.upload + s.calls.create, 0);
  const saved = JSON.parse(readFileSync(path.join(out, 'generate-preflight.json'), 'utf8'));
  assert.equal(saved.inputs.ok, true);
  const withAcc = await runMvGenerate({ manifest: realManifest(), projectFile: path.join(tmp, 'project.json'), dryRun: true, outDir: out, account: broke, rh: s.rh });
  assert.deepEqual(withAcc.preflight.codes, ['INSUFFICIENT_COINS']);
}

// 6. lib has no node: imports
{
  const src = readFileSync(path.join(repoRoot, 'lib/mv-generate-preflight.mjs'), 'utf8');
  assert.ok(!/from ['"]node:/.test(src));
}

// 7. remainPoint spendable; leftover coins must not bypass
{
  const pointsExact = { code: 0, data: { remainCoins: '0', remainMoney: '-0.0130', remainPoint: 540, apiType: 'NORMAL' } };
  const go = planMvGeneratePreflight({ manifest: manifest(), account: pointsExact, exists: allExist });
  assert.equal(go.go, true);
  assert.equal(go.estimate.total, 540);
  assert.match(go.reason, /积分/);

  const pointsShort = { code: 0, data: { remainCoins: '99999', remainMoney: '5', remainPoint: 539, apiType: 'NORMAL' } };
  const no = planMvGeneratePreflight({ manifest: manifest(), account: pointsShort, exists: allExist });
  assert.equal(no.go, false);
  assert.ok(no.codes.includes('INSUFFICIENT_COINS'));
  assert.match(no.reason, /539/);
  assert.match(no.reason, /积分/);
}

console.log('test-mv-generate-preflight ok');
