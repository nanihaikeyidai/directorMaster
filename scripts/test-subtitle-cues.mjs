import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  normalizeCues,
  formatSrtTimestamp,
  cuesToSrt,
  cuesToAssBilingual,
  writeBilingualSubtitles,
  detectSubtitleWorkflowKind,
} from '../lib/subtitle-cues.mjs';

// --- formatSrtTimestamp ---
assert.equal(formatSrtTimestamp(0), '00:00:00,000');
assert.equal(formatSrtTimestamp(1000), '00:00:01,000');
assert.equal(formatSrtTimestamp(2500), '00:00:02,500');
assert.equal(formatSrtTimestamp(3661234), '01:01:01,234');
assert.equal(formatSrtTimestamp(61_000), '00:01:01,000');

// --- normalize: array of ms cues ---
const fromArray = normalizeCues([
  { startMs: 2600, endMs: 4200, text: ' 别回头 ', translation: "Don't look back" },
  { startMs: 1000, endMs: 2500, text: '跟着灯光向前走', translation: 'Walk forward with the lights' },
]);
assert.equal(fromArray.length, 2);
assert.equal(fromArray[0].startMs, 1000);
assert.equal(fromArray[0].text, '跟着灯光向前走');
assert.equal(fromArray[1].translation, "Don't look back");

// --- normalize: wrapper + seconds ---
const fromSeconds = normalizeCues({
  cues: [{ start: 1.0, end: 2.5, text: '你好' }],
});
assert.deepEqual(fromSeconds, [{ startMs: 1000, endMs: 2500, text: '你好' }]);

// --- normalize: plain timed lines ---
const plain = normalizeCues([
  '00:00:01,000 --> 00:00:02,500 跟着灯光向前走',
  '1.0-2.5\t别回头',
]);
assert.equal(plain.length, 2);
assert.equal(plain[0].startMs, 1000);
assert.equal(plain[0].endMs, 2500);
assert.equal(plain[0].text, '跟着灯光向前走');
assert.equal(plain[1].startMs, 1000);
assert.equal(plain[1].endMs, 2500);
assert.equal(plain[1].text, '别回头');

// --- reject inverted / empty ---
assert.throws(() => normalizeCues([{ startMs: 3000, endMs: 1000, text: 'bad' }]), /inverted|endMs|duration/i);
assert.throws(() => normalizeCues([{ startMs: 0, endMs: 1000, text: '   ' }]), /empty|text/i);
assert.throws(() => normalizeCues([{ startMs: 0, endMs: 0, text: 'x' }]), /inverted|endMs|duration/i);

// --- cuesToSrt ---
const cues = normalizeCues([
  { startMs: 1000, endMs: 2500, text: '中文一行', translation: 'English line' },
  { startMs: 3000, endMs: 4500, text: '第二行', translation: 'Second' },
]);
const srtZh = cuesToSrt(cues, { field: 'text' });
assert.match(srtZh, /^1\r?\n00:00:01,000 --> 00:00:02,500\r?\n中文一行\r?\n\r?\n2\r?\n/);
assert.match(srtZh, /第二行/);
const srtEn = cuesToSrt(cues, { field: 'translation' });
assert.match(srtEn, /English line/);
assert.match(srtEn, /Second/);

// --- ASS bilingual ---
const ass = cuesToAssBilingual(cues, { sourceLang: 'zh', targetLang: 'en' });
assert.match(ass, /\[Script Info\]/);
assert.match(ass, /Style: Primary/);
assert.match(ass, /Style: Translation/);
assert.match(ass, /Dialogue:.*中文一行/);
assert.match(ass, /Dialogue:.*English line/);
assert.match(ass, /Dialogue:.*第二行/);
assert.match(ass, /Dialogue:.*Second/);

// source-only when no translation
const sourceOnly = cuesToAssBilingual(
  normalizeCues([{ startMs: 0, endMs: 500, text: 'only' }]),
  { sourceLang: 'zh', targetLang: 'en' },
);
assert.match(sourceOnly, /Dialogue:.*only/);
assert.equal([...sourceOnly.matchAll(/^Dialogue:/gm)].length, 1);

// --- writeBilingualSubtitles ---
const outDir = mkdtempSync(path.join(tmpdir(), 'subtitle-v0-'));
try {
  const written = writeBilingualSubtitles(outDir, cues, {
    sourceLang: 'zh',
    targetLang: 'en',
    basename: 'clip',
  });
  assert.ok(written.srtSource.endsWith('clip.zh.srt'));
  assert.ok(written.srtTarget.endsWith('clip.en.srt'));
  assert.ok(written.ass.endsWith('clip.bilingual.ass'));
  assert.match(readFileSync(written.srtSource, 'utf8'), /中文一行/);
  assert.match(readFileSync(written.srtTarget, 'utf8'), /English line/);
  assert.match(readFileSync(written.ass, 'utf8'), /Style: Primary/);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

// fixture file round-trip
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/subtitle-cues-sample.json', import.meta.url), 'utf8'),
);
const fixtureCues = normalizeCues(fixture);
assert.equal(fixtureCues.length, 3);
assert.equal(fixtureCues[2].text, '雨还在下');

// --- detectSubtitleWorkflowKind ---
assert.equal(
  detectSubtitleWorkflowKind({
    '1': { class_type: 'LoadAudio', inputs: {} },
    '2': { class_type: 'Confucius4R2T2ASR', inputs: {} },
  }),
  'asr-r2t2',
);
assert.equal(
  detectSubtitleWorkflowKind({
    '1': { class_type: 'SomeR2T2Node', inputs: {} },
  }),
  'asr-r2t2',
);
assert.equal(
  detectSubtitleWorkflowKind({
    '1': { class_type: 'MiniMaxH3Director', inputs: {} },
  }),
  null,
);
assert.equal(detectSubtitleWorkflowKind(null), null);

console.log('test-subtitle-cues: ok');
