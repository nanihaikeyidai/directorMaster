import assert from 'node:assert/strict';
import { buildStandardBandMvPrompt, getSegmentVocalTiming } from '../lib/mv-prompt.mjs';

const assets = [
  { mediaType: 'image', category: '人物', description: 'Aster is the adult lead vocalist with silver hair, a black microphone, and a front-center position.' },
  { mediaType: 'image', category: '场景', description: 'A blue indoor arena stage with a reflective floor, rear LED wall, and audience in front.' },
  { mediaType: 'image', category: '人物', description: 'Mira is the adult drummer at rear-center; Sol is the adult guitarist at screen-right.' },
];

const prompt = buildStandardBandMvPrompt({
  projectName: '模板测试',
  segment: { index: 2, start: 12.5, end: 25.4, duration: 12.9 },
  note: { kind: 'vocal', lyrics: '跟着灯光向前走', direction: '先展示完整乐队，再突出主唱的情绪。' },
  assets,
});

const sections = [
  'subject_definitions:',
  'summary:',
  'retention_analysis:',
  'detailed_description:',
  'overall_soundscape:',
  'non_diegetic_music:',
];

let cursor = -1;
for (const section of sections) {
  const index = prompt.indexOf(section);
  assert.ok(index > cursor, `${section} must exist in canonical order`);
  cursor = index;
}

assert.deepEqual(
  [...new Set([...prompt.matchAll(/<Picture (\d+)>/g)].map((match) => Number(match[1])))].sort((a, b) => a - b),
  [1, 2, 3],
);
assert.deepEqual(
  [...new Set([...prompt.matchAll(/<Subject (\d+)>/g)].map((match) => Number(match[1])))].sort((a, b) => a - b),
  [1, 2, 3],
);
assert.match(prompt, /<Audio 1>/);
assert.match(prompt, /\[Shot 2\] At 00:03\.096/);
assert.match(prompt, /\[Shot 3\] At 00:06\.450/);
assert.match(prompt, /\[Shot 4\] At 00:09\.804/);
assert.match(prompt, /<d>\[Chinese\] 跟着灯光向前走<\/d>/);
for (const asset of assets) assert.ok(prompt.includes(asset.description));

const introPrompt = buildStandardBandMvPrompt({
  projectName: '开场静音测试',
  segment: { index: 1, start: 0, end: 4, duration: 4 },
  note: { kind: 'vocal', lyrics: '', direction: '主唱在舞台中央等待人声进入。' },
  assets,
  settings: { vocalStartSec: '1.5' },
  leadSilenceSec: 2,
});
assert.deepEqual(getSegmentVocalTiming({ start: 0, duration: 4 }, { kind: 'vocal' }, { vocalStartSec: '1.5' }, 2), {
  mode: 'vocal_enters',
  vocalStartOnTrack: 3.5,
  relativeStart: 3.5,
});
assert.match(introPrompt, /must function as a prelude/);
assert.match(introPrompt, /deliberate pre-vocal preparation action/);
assert.doesNotMatch(introPrompt, /begins singing only when the first audible vocal syllable/);
assert.match(introPrompt, /closed lips before vocals and during pauses/);

const shortPrompt = buildStandardBandMvPrompt({
  projectName: '短片段测试',
  segment: { index: 3, start: 8, end: 11, duration: 3 },
  note: { kind: 'vocal', lyrics: '短句', direction: '主唱快速转身。' },
  assets,
});
assert.match(shortPrompt, /one readable continuous shot/);
assert.doesNotMatch(shortPrompt, /\[Shot 2\]/);
assert.match(shortPrompt, /previous pattern is/);

const instrumentalPrompt = buildStandardBandMvPrompt({
  projectName: '间奏测试',
  segment: { index: 3, start: 20, end: 30, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '乐队间奏。' },
  assets,
});
assert.match(instrumentalPrompt, /entire segment is instrumental/);
assert.match(instrumentalPrompt, /never mimics singing/);

console.log(JSON.stringify({ ok: true, chars: prompt.length, pictures: 3, subjects: 3, sections: sections.length }));
