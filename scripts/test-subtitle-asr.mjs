import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRhAsrOutput, applyCuePatches } from '../lib/subtitle-asr.mjs';
import { normalizeCues } from '../lib/subtitle-cues.mjs';

function loadFixture(name) {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

// --- segments (seconds) ---
{
  const raw = loadFixture('rh-asr-segments.json');
  const result = parseRhAsrOutput(raw);
  assert.equal(result.source, 'segments');
  assert.equal(result.needsReview, undefined);
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].startMs, 1000);
  assert.equal(result.cues[0].endMs, 2500);
  assert.equal(result.cues[0].text, '跟着灯光向前走');
  assert.equal(result.cues[1].text, '别回头');
  assert.equal(normalizeCues(result.cues).length, 2);
}

// --- sentences (ms fields: begin_time/end_time and start_ms/end_ms) ---
{
  const result = parseRhAsrOutput(loadFixture('rh-asr-sentences-ms.json'));
  assert.equal(result.source, 'sentences');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].startMs, 1000);
  assert.equal(result.cues[0].endMs, 2500);
  assert.equal(result.cues[1].startMs, 2600);
  assert.equal(result.cues[1].endMs, 4200);
  normalizeCues(result.cues);
}

// --- nested result wrapper ---
{
  const result = parseRhAsrOutput(loadFixture('rh-asr-result-nested.json'));
  assert.equal(result.source, 'result');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].text, '雨还在下');
  assert.equal(result.cues[0].startMs, 500);
  normalizeCues(result.cues);
}

// --- array of timed objects ---
{
  const result = parseRhAsrOutput(loadFixture('rh-asr-array.json'));
  assert.ok(result.source === 'array' || result.source === 'plain-passthrough');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].startMs, 0);
  assert.equal(result.cues[0].endMs, 1200);
  assert.equal(result.cues[1].translation, 'Second line');
  normalizeCues(result.cues);
}

// --- plain timed lines already handled by normalizeCues (pass-through) ---
{
  const result = parseRhAsrOutput([
    '00:00:01,000 --> 00:00:02,500 跟着灯光向前走',
    '1.0-2.5\t别回头',
  ]);
  assert.ok(result.source === 'array' || result.source === 'plain-passthrough');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].text, '跟着灯光向前走');
  normalizeCues(result.cues);
}

// --- cues wrapper pass-through ---
{
  const result = parseRhAsrOutput({
    cues: [{ startMs: 100, endMs: 400, text: 'hi' }],
  });
  assert.equal(result.source, 'plain-passthrough');
  assert.equal(result.cues[0].text, 'hi');
}

// --- untimed { text } + durationMs → weak-split ---
{
  const raw = loadFixture('rh-asr-untimed-text.json');
  assert.throws(() => parseRhAsrOutput(raw), /durationMs|duration/i);
  const result = parseRhAsrOutput(raw, { durationMs: 9000 });
  assert.equal(result.needsReview, true);
  assert.equal(result.source, 'weak-split');
  assert.equal(result.cues.length, 3);
  assert.equal(result.cues[0].text, '跟着灯光向前走');
  assert.equal(result.cues[1].text, '别回头');
  assert.equal(result.cues[2].text, '雨还在下');
  assert.equal(result.cues[0].startMs, 0);
  assert.equal(result.cues[2].endMs, 9000);
  // equal split: 3000ms each
  assert.equal(result.cues[0].endMs, 3000);
  assert.equal(result.cues[1].startMs, 3000);
  assert.equal(result.cues[1].endMs, 6000);
  normalizeCues(result.cues);
}

// --- plain untimed string ---
{
  const result = parseRhAsrOutput('你好。世界！', { durationMs: 4000 });
  assert.equal(result.needsReview, true);
  assert.equal(result.source, 'weak-split');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].text, '你好');
  assert.equal(result.cues[1].text, '世界');
  assert.equal(result.cues[1].endMs, 4000);
}

// --- unsupported shape ---
{
  assert.throws(() => parseRhAsrOutput({ foo: 1 }), /unsupported|不支持|shape|格式/i);
}

// --- applyCuePatches ---
{
  const base = normalizeCues([
    { startMs: 0, endMs: 1000, text: '一', translation: 'one' },
    { startMs: 1000, endMs: 2000, text: '二' },
  ]);
  const patched = applyCuePatches(base, [
    { index: 0, text: '壹', translation: 'ONE' },
    { index: 1, startMs: 1100, endMs: 2100, text: '贰' },
  ]);
  assert.notEqual(patched, base);
  assert.equal(base[0].text, '一');
  assert.equal(patched[0].text, '壹');
  assert.equal(patched[0].translation, 'ONE');
  assert.equal(patched[1].startMs, 1100);
  assert.equal(patched[1].endMs, 2100);
  assert.equal(patched[1].text, '贰');

  assert.throws(() => applyCuePatches(base, [{ index: 9, text: 'x' }]), /index|OOB|越界|out of range/i);
  assert.throws(
    () => applyCuePatches(base, [{ index: 0, startMs: 5000, endMs: 1000 }]),
    /inverted|endMs|duration|时间/i,
  );
  assert.throws(() => applyCuePatches(base, [{ index: 0, text: '   ' }]), /empty|text|空/i);
}

console.log('test-subtitle-asr: ok');
