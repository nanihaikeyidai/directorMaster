import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractMusicSignalsFromHops,
} from '../lib/mv-music-signals.mjs';
import {
  recommendMvPromptTemplate,
  MV_PROMPT_TEMPLATES,
} from '../lib/mv-prompt.mjs';

const registered = new Set(Object.keys(MV_PROMPT_TEMPLATES));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'cli/director-master.mjs');

function hop(t, rmsDb, midDb, bassDb) {
  return { t, rmsDb, midDb, bassDb };
}

function series(count, hopSec, factory) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(factory(i, i * hopSec));
  return out;
}

// 1. Synthetic loud vocal-active hops → energy high, vocalDensity dense
{
  const hops = series(20, 0.25, (i, t) => hop(t, -12, -10, -20));
  const r = extractMusicSignalsFromHops(hops);
  assert.ok(r && typeof r === 'object');
  assert.equal(r.signals.energy, 'high');
  assert.equal(r.signals.vocalDensity, 'dense');
  assert.ok(r.derived.vocalActiveRatio >= 0.9, 'vocalActiveRatio should be high, got ' + r.derived.vocalActiveRatio);
  assert.ok(Number.isFinite(r.derived.meanRmsDb));
  assert.ok(r.derived.meanRmsDb > -18);
  assert.ok(Array.isArray(r.reasons) && r.reasons.length >= 1);
  assert.ok(r.reasons.some((x) => /energy=high|能量/.test(x)));
}

// 2. Synthetic quiet / bass-dominant instrumental hops → energy low, vocalDensity sparse
{
  const hops = series(20, 0.25, (i, t) => hop(t, -32, -40, -18));
  const r = extractMusicSignalsFromHops(hops);
  assert.equal(r.signals.energy, 'low');
  assert.equal(r.signals.vocalDensity, 'sparse');
  assert.ok(r.derived.vocalActiveRatio < 0.25);
  assert.ok(r.derived.meanRmsDb < -28);
  assert.ok(r.reasons.some((x) => /energy=low|vocalDensity=sparse|能量|人声/.test(x)));
}

// 3. Mixed / mid-level hops → medium mappings
{
  // mean rms -23 → medium; 3/10 vocal-active → ratio 0.30 → medium
  const hops = series(10, 0.25, (i, t) => {
    if (i < 3) return hop(t, -23, -20, -26); // vocal-active
    return hop(t, -23, -40, -18); // bass-dominant, not vocal-active
  });
  const r = extractMusicSignalsFromHops(hops);
  assert.equal(r.signals.energy, 'medium');
  assert.equal(r.signals.vocalDensity, 'medium');
  assert.ok(r.derived.vocalActiveRatio >= 0.25 && r.derived.vocalActiveRatio < 0.5);
  assert.ok(r.derived.meanRmsDb >= -28 && r.derived.meanRmsDb < -18);
}

// 4. Empty hops → no throw; omit energy/density/bpm; reasons mention 信号不足
{
  const r = extractMusicSignalsFromHops([]);
  assert.ok(r && typeof r === 'object');
  assert.equal(r.signals.energy, undefined);
  assert.equal(r.signals.vocalDensity, undefined);
  assert.equal(r.signals.bpm, undefined);
  assert.equal(r.derived.vocalActiveRatio, 0);
  assert.ok(r.derived.meanRmsDb == null);
  assert.ok(Array.isArray(r.reasons) && r.reasons.some((x) => /信号不足/.test(x)));
}

{
  const r = extractMusicSignalsFromHops(null);
  assert.equal(r.signals.energy, undefined);
  assert.equal(r.derived.vocalActiveRatio, 0);
  assert.ok(r.reasons.some((x) => /信号不足/.test(x)));
}

// 5. extras override extracted energy/hints
{
  const hops = series(16, 0.25, (i, t) => hop(t, -12, -10, -20));
  const r = extractMusicSignalsFromHops(hops, {
    energy: 'low',
    hints: '钢琴抒情',
  });
  assert.equal(r.signals.energy, 'low', 'CLI extras must win over extracted energy');
  assert.equal(r.signals.hints, '钢琴抒情');
  assert.equal(r.signals.vocalDensity, 'dense', 'unoverridden vocalDensity stays extracted');
}

// 6. recommendMvPromptTemplate(extract(...).signals) always returns a registered templateId
{
  const loud = extractMusicSignalsFromHops(series(16, 0.25, (i, t) => hop(t, -12, -10, -20)));
  const rec = recommendMvPromptTemplate(loud.signals);
  assert.ok(registered.has(rec.templateId), 'high+dense must yield registered id, got ' + rec.templateId);
  assert.ok(typeof rec.confidence === 'number');
}

{
  const quiet = extractMusicSignalsFromHops(
    series(16, 0.25, (i, t) => hop(t, -32, -40, -18)),
    { instruments: ['piano'] },
  );
  assert.equal(quiet.signals.energy, 'low');
  assert.equal(quiet.signals.vocalDensity, 'sparse');
  assert.deepEqual(quiet.signals.instruments, ['piano']);
  const rec = recommendMvPromptTemplate(quiet.signals);
  assert.ok(registered.has(rec.templateId), 'low+sparse+piano must yield registered id, got ' + rec.templateId);
  assert.equal(rec.templateId, 'piano-ballad');
}

// 7. Optional BPM: regular 120 BPM pulse → bpm in 100–140 (or documented omit);
//    noisy / flat fixtures omit bpm.
{
  // 120 BPM = beat every 0.5s; hopSec 0.125 → peak every 4 hops. 8s = 64 hops.
  const hopSec = 0.125;
  const pulse = series(64, hopSec, (i, t) => {
    const onBeat = i % 4 === 0;
    return hop(t, onBeat ? -8 : -22, onBeat ? -10 : -24, onBeat ? -18 : -28);
  });
  const pulsed = extractMusicSignalsFromHops(pulse);
  if (pulsed.signals.bpm != null) {
    assert.ok(
      pulsed.signals.bpm >= 100 && pulsed.signals.bpm <= 140,
      '120 BPM pulse should land near 120 (100–140), got ' + pulsed.signals.bpm,
    );
    assert.equal(pulsed.derived.bpm, pulsed.signals.bpm);
    assert.ok(pulsed.derived.bpmConfidence >= 0 && pulsed.derived.bpmConfidence <= 1);
  } else {
    assert.equal(pulsed.derived.bpm, undefined);
  }
}

{
  const flat = series(40, 0.25, (i, t) => hop(t, -25, -30, -28));
  const r = extractMusicSignalsFromHops(flat);
  assert.equal(r.signals.bpm, undefined);
  assert.equal(r.derived.bpm, undefined);
}

{
  const noisy = series(40, 0.25, (i, t) => {
    // deterministic irregular RMS, no stable period
    const wobble = ((i * 17) % 11) - 5;
    return hop(t, -24 + wobble, -30 + wobble, -22 + ((i * 9) % 7));
  });
  const r = extractMusicSignalsFromHops(noisy);
  assert.equal(r.signals.bpm, undefined, 'noisy hops must omit bpm, got ' + r.signals.bpm);
}

// 8. Spawn CLI with temp --hops-json (vocal-active series) and --json
{
  const hops = series(16, 0.25, (i, t) => hop(t, -12, -10, -20));
  const dir = mkdtempSync(path.join(tmpdir(), 'mv-recommend-hops-'));
  try {
    const hopsPath = path.join(dir, 'hops.json');
    writeFileSync(hopsPath, JSON.stringify(hops));
    const spawned = spawnSync(
      process.execPath,
      [cliPath, 'mv-recommend', '--hops-json', hopsPath, '--json'],
      { encoding: 'utf8', cwd: repoRoot },
    );
    assert.equal(spawned.status, 0, 'CLI exit 0, stderr=' + spawned.stderr + ' stdout=' + spawned.stdout);
    const parsed = JSON.parse(spawned.stdout);
    assert.ok(registered.has(parsed.templateId), 'CLI templateId must be registered, got ' + parsed.templateId);
    assert.ok(parsed.extraction && parsed.extraction.signals);
    assert.equal(parsed.extraction.signals.energy, 'high');
    assert.equal(parsed.extraction.signals.vocalDensity, 'dense');
    assert.ok(parsed.extraction.derived);
    assert.ok(Array.isArray(parsed.extraction.reasons));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('test-mv-music-signals: ok');
