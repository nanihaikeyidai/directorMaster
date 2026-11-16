import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeEnergyHops, isVocalActiveHop } from '../lib/mv-energy-hops.mjs';
import { isVocalActiveHop as prepIsVocal } from '../lib/mv-lipsync-prep.mjs';
import { planMvCutPrecheck } from '../lib/mv-cut-precheck.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Synthetic "song": vocal-band tone 1 kHz for [2,6) and [10,14), silence elsewhere.
function synth(sampleRate, durationSec) {
  const n = Math.round(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const on = (t >= 2 && t < 6) || (t >= 10 && t < 14);
    out[i] = on ? 0.3 * Math.sin(2 * Math.PI * 1000 * t) : 0;
  }
  return out;
}

// --- browser-safe module: no node: imports ---
{
  const src = readFileSync(path.join(repoRoot, 'lib/mv-energy-hops.mjs'), 'utf8');
  assert.ok(!/from ['"]node:/.test(src), 'mv-energy-hops must be browser-safe');
  const gate = readFileSync(path.join(repoRoot, 'lib/mv-cut-gate.mjs'), 'utf8');
  assert.ok(!/mv-lipsync-prep/.test(gate), 'mv-cut-gate must not pull node-only mv-lipsync-prep');
  const pre = readFileSync(path.join(repoRoot, 'lib/mv-cut-precheck.mjs'), 'utf8');
  assert.ok(!/from ['"]node:/.test(pre), 'mv-cut-precheck must be browser-safe');
  assert.equal(prepIsVocal, isVocalActiveHop, 'prep re-exports the shared classifier');
}

// --- computeEnergyHops at 16k: hop grid + vocal classification ---
{
  const hops = computeEnergyHops(synth(16000, 16), { sampleRate: 16000, hopSec: 0.25 });
  assert.equal(hops.length, 64);
  assert.equal(hops[1].t, 0.25);
  const active = hops.filter((h) => isVocalActiveHop(h)).map((h) => h.t);
  assert.ok(active.includes(3) && active.includes(12), 'tone hops are vocal-active');
  assert.ok(!active.includes(0) && !active.includes(8), 'silent hops are not');
}

// --- 48 kHz input is resampled so thresholds stay comparable ---
{
  const a = computeEnergyHops(synth(16000, 16), { sampleRate: 16000 });
  const b = computeEnergyHops(synth(48000, 16), { sampleRate: 48000 });
  assert.equal(a.length, b.length);
  const flagsA = a.map((h) => isVocalActiveHop(h));
  const flagsB = b.map((h) => isVocalActiveHop(h));
  const diff = flagsA.filter((f, i) => f !== flagsB[i]).length;
  assert.ok(diff <= 2, `48k vs 16k classification differs on ${diff} hops`);
  assert.ok(Math.abs(a[12].rmsDb - b[12].rmsDb) < 1.5, 'rms comparable across rates');
}

// --- Int16 scale option matches float path ---
{
  const f = synth(16000, 4);
  const i16 = Int16Array.from(f, (x) => Math.round(x * 32767));
  const a = computeEnergyHops(f, { sampleRate: 16000 });
  const b = computeEnergyHops(i16, { sampleRate: 16000, scale: 1 / 32768 });
  assert.ok(Math.abs(a[10].midDb - b[10].midDb) < 0.1);
}

// --- empty / invalid input ---
assert.deepEqual(computeEnergyHops(new Float32Array(0), { sampleRate: 16000 }), []);
assert.deepEqual(computeEnergyHops(null, { sampleRate: 16000 }), []);

const hops = computeEnergyHops(synth(16000, 16), { sampleRate: 16000 });

// --- precheck pass: cuts in vocal gaps ---
{
  const r = planMvCutPrecheck({ cuts: [8], hops, durationSec: 16 });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.mode, 'pass');
  assert.deepEqual(r.cuts, [8]);
}

// --- manual mid-vocal cut is blocked with Chinese reason, cuts unchanged ---
{
  const r = planMvCutPrecheck({ cuts: [4], hops, durationSec: 16 });
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'block');
  assert.deepEqual(r.cuts, [4]);
  assert.match(r.reason, /[\u4e00-\u9fff]/);
}

// --- autoSnap moves mid-vocal cut to a boundary when segments stay legal ---
{
  const r = planMvCutPrecheck({ cuts: [4.9], hops, durationSec: 16, autoSnap: true });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.mode, 'snap');
  assert.equal(r.cuts.length, 1);
  assert.ok(Math.abs(r.cuts[0] - 6) <= 0.25, `snapped to ${r.cuts[0]}`);
}

// --- autoSnap that would make a segment exceed 15 s is blocked ---
{
  const long = computeEnergyHops(synth(16000, 16).map((x, i) => (i / 16000 < 15.5 ? 0.3 * Math.sin(2 * Math.PI * 1000 * i / 16000) : 0)), { sampleRate: 16000 });
  const r = planMvCutPrecheck({ cuts: [8], hops: long, durationSec: 16, autoSnap: true, maxSegmentSec: 15 });
  assert.equal(r.ok, false, r.reason);
  assert.equal(r.mode, 'block');
}

// --- no interior cuts → skip; no hops with cuts → block ---
{
  assert.equal(planMvCutPrecheck({ cuts: [], hops, durationSec: 12 }).mode, 'skip');
  const r = planMvCutPrecheck({ cuts: [8], hops: [], durationSec: 16 });
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'block');
}

// --- trim range: segments measured from trim start/end ---
{
  const r = planMvCutPrecheck({ cuts: [8], hops, durationSec: 16, rangeStart: 1, rangeEnd: 15, autoSnap: true });
  assert.equal(r.ok, true, r.reason);
}

// --- page wiring ---
{
  const page = readFileSync(path.join(repoRoot, 'app/mv/page.tsx'), 'utf8');
  assert.match(page, /from "\.\.\/\.\.\/lib\/mv-cut-precheck\.mjs"/);
  assert.match(page, /from "\.\.\/\.\.\/lib\/mv-energy-hops\.mjs"/);
  for (const fn of ['generatePrompts', 'generateFullMv', 'autoSplit']) {
    const start = page.indexOf(`function ${fn}(`);
    assert.ok(start >= 0, `missing ${fn}`);
    const body = page.slice(start, start + 4000);
    assert.match(body, /runCutPrecheck\(/, `${fn} must run the cut precheck`);
  }
}

// --- client bundle safety: page's lib import graph has no node: builtins ---
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
  visit(path.join(repoRoot, 'app/mv/page.tsx'));
  assert.deepEqual(offenders, [], `client page imports node builtins: ${offenders.join(', ')}`);
}

console.log('test-mv-cut-ui-precheck ok');
