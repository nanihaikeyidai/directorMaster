import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLyricImportText, planMvLyricImportUi } from '../lib/mv-lyric-import-ui.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const twoPhraseLyrics = {
  lyrics: [
    { startSec: 2, endSec: 6, text: '第一句' },
    { startSec: 10, endSec: 14, text: '第二句' },
  ],
};

// --- browser-safe module: no node: imports in the UI wrapper graph ---
{
  const seen = new Set();
  const offenders = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import[^'"]*from\\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:')) offenders.push(`${path.relative(repoRoot, file)} -> ${spec}`);
      else if (spec.startsWith('.') && /\\.m?js$/.test(spec)) visit(path.resolve(path.dirname(file), spec));
    }
  };
  visit(path.join(repoRoot, 'lib/mv-lyric-import-ui.mjs'));
  assert.deepEqual(offenders, [], `lyric import UI must be browser-safe: ${offenders.join(', ')}`);
}

// --- parseLyricImportText ---
{
  const empty = parseLyricImportText('   ');
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /空/);
  const bad = parseLyricImportText('{not json');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /JSON/);
  const parsed = parseLyricImportText(JSON.stringify(twoPhraseLyrics));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.lyrics, twoPhraseLyrics);
}

// --- missing duration / missing cues ---
{
  const noDuration = planMvLyricImportUi({ lyrics: twoPhraseLyrics });
  assert.equal(noDuration.ok, false);
  assert.deepEqual(noDuration.cuts, []);
  assert.match(noDuration.reason, /请先导入音乐/);
  const noCues = planMvLyricImportUi({ lyrics: { lyrics: [] }, durationSec: 16 });
  assert.equal(noCues.ok, false);
  assert.deepEqual(noCues.cuts, []);
  assert.match(noCues.reason, /没有可用的歌词时间轴/);
}

// --- two phrases with >=2s instrumental gaps on a 16s song ---
{
  const plan = planMvLyricImportUi({ lyrics: twoPhraseLyrics, durationSec: 16 });
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.cuts, [2, 6, 10, 14]);
  assert.equal(plan.notes.length, 5);
  assert.equal(plan.notes[0].kind, 'instrumental');
  assert.equal(plan.notes[0].shotType, 'wide');
  assert.equal(plan.notes[0].coverage, 'instrumental-wide');
  assert.equal(plan.notes[1].kind, 'vocal');
  assert.equal(plan.notes[1].shotType, 'lead');
  assert.equal(plan.notes[1].coverage, 'singing-closeup');
  assert.equal(plan.notes[1].lyrics, '第一句');
  assert.equal(plan.notes[2].kind, 'instrumental');
  assert.equal(plan.notes[3].kind, 'vocal');
  assert.equal(plan.notes[3].lyrics, '第二句');
  assert.equal(plan.notes[4].kind, 'instrumental');
  assert.match(plan.reason, /2 句/);
  assert.match(plan.reason, /5 段/);
}

// --- trim window shifts cuts into absolute source time ---
{
  const lyrics = {
    lyrics: [
      { startSec: 32, endSec: 36, text: '第一句' },
      { startSec: 40, endSec: 44, text: '第二句' },
    ],
  };
  const plan = planMvLyricImportUi({
    lyrics,
    durationSec: 60,
    rangeStart: 30,
    rangeEnd: 46,
  });
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.cuts, [32, 36, 40, 44]);
  assert.equal(plan.notes[1].lyrics, '第一句');
  assert.equal(plan.notes[3].lyrics, '第二句');
  assert.equal(plan.rangeStart, 30);
  assert.equal(plan.rangeEnd, 46);
}

// --- a single line longer than 15s is rejected and leaves cuts empty ---
{
  const plan = planMvLyricImportUi({
    lyrics: { lyrics: [{ startSec: 1, endSec: 17, text: '过长的一句' }] },
    durationSec: 20,
  });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.cuts, []);
  assert.deepEqual(plan.notes, []);
  assert.match(plan.reason, /15/);
}

// --- page wiring ---
{
  const page = readFileSync(path.join(repoRoot, 'app/mv/page.tsx'), 'utf8');
  assert.match(page, /from ["']\.\.\/\.\.\/lib\/mv-lyric-import-ui\.mjs["']/);
  assert.match(page, /planMvLyricImportUi/);
  assert.match(page, /parseLyricImportText/);
  assert.match(page, /导入歌词并按语句分段/);
  assert.match(page, /accept=["']\.json,application\/json["']/);
  assert.match(page, /phraseEndsSec\??:\s*number\[\]/);
  assert.match(page, /coverage\??:/);
  const start = page.indexOf('setNotes(Array.isArray(data.segments)');
  const restore = page.slice(start, start + 1800);
  assert.match(restore, /phraseEndsSec/);
  assert.match(restore, /coverage/);
}

// --- client bundle safety: page's lib import graph still has no node: builtins ---
{
  const seen = new Set();
  const offenders = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import[^'"]*from\\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:')) offenders.push(`${path.relative(repoRoot, file)} -> ${spec}`);
      else if (spec.startsWith('.') && /\\.m?js$/.test(spec)) visit(path.resolve(path.dirname(file), spec));
    }
  };
  visit(path.join(repoRoot, 'app/mv/page.tsx'));
  assert.deepEqual(offenders, [], `client page imports node builtins: ${offenders.join(', ')}`);
}

console.log('test-mv-lyric-import-ui ok');
