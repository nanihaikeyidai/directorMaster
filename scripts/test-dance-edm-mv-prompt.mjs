import assert from 'node:assert/strict';
import {
  buildDanceEdmMvPrompt,
  DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION,
  MV_PROMPT_TEMPLATES,
  listMvPromptTemplates,
  buildMvPromptForTemplate,
  buildRockSoloMvPrompt,
} from '../lib/mv-prompt.mjs';

const assets = [
  { mediaType: 'image', category: '人物', description: 'Nova is an adult female EDM singer-performer with short silver hair and a sequined stage outfit under club lights.' },
  { mediaType: 'image', category: '场景', description: 'Dark club festival stage with LED wall, laser beams, stage fog, and a DJ deck at the front.' },
];
const sections = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'];

assert.match(String(DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION), /^dance-edm-ref2va-/);

const instrumental = buildDanceEdmMvPrompt({
  projectName: 'Dance EDM Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '前奏鼓点与合成器' },
  assets,
});
let cursor = -1;
for (const section of sections) {
  const index = instrumental.indexOf(section);
  assert.ok(index > cursor, `${section} must exist in canonical order`);
  cursor = index;
}
assert.match(instrumental, /LED|club|deck|controller|fog|laser|stage/i);
assert.match(instrumental, /do not frame the singer's face|no singer face close-up/i);
assert.doesNotMatch(instrumental, /【动作类型：歌手面部特写】/);
assert.match(instrumental, /phrase boundary|breath|vocal gap/i);
assert.match(instrumental, /never duplicate/i);

const vocal = buildDanceEdmMvPrompt({
  projectName: 'Dance EDM Test',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'vocal', lyrics: '跟着节拍一起跳动' },
  assets,
});
assert.match(vocal, /<d>\[Chinese\] 跟着节拍一起跳动<\/d>/);
assert.match(vocal, /【动作类型：歌手面部特写】/);
assert.match(vocal, /lip|mouth|jaw/i);

const enters = buildDanceEdmMvPrompt({
  projectName: 'Dance EDM Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'vocal', lyrics: '' },
  assets,
  settings: { vocalStartSec: '6' },
});
assert.match(enters, /00:06\.000/);
const shot1 = enters.split('\n[Shot 2]')[0].split('\n[Shot 1]')[1];
assert.doesNotMatch(shot1, /【动作类型：歌手面部特写】/);
assert.match((enters.split('\n[Shot 2]')[1] || '').split('\n')[0], /【动作类型：歌手面部特写】/);

assert.throws(() => buildDanceEdmMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' },
  assets: [{ mediaType: 'image', category: '人物', description: 'character sheet left panel and right panel' }, assets[1]],
}), /dual|character sheet|人设表|双人/i);
assert.throws(() => buildDanceEdmMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' }, assets: [assets[0]],
}), /场景/);

// Registry
const ids = listMvPromptTemplates().map((t) => t.id);
for (const id of ['band', 'folk-solo', 'folk-duo', 'piano-ballad', 'rock-solo', 'dance-edm']) {
  assert.ok(ids.includes(id), `registry has ${id}`);
}
assert.equal(MV_PROMPT_TEMPLATES['dance-edm'].version, DANCE_EDM_MV_PROMPT_TEMPLATE_VERSION);
assert.equal(MV_PROMPT_TEMPLATES['dance-edm'].label, '电子舞曲（舞台/俱乐部）');
for (const t of listMvPromptTemplates()) { assert.ok(t.label); assert.ok(t.version); }
const input = {
  projectName: 'Reg',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'vocal', lyrics: '燃烧' },
  assets,
};
assert.equal(buildMvPromptForTemplate('dance-edm', input), buildDanceEdmMvPrompt(input));
assert.equal(
  buildMvPromptForTemplate('rock-solo', input),
  buildRockSoloMvPrompt(input),
);
assert.throws(() => buildMvPromptForTemplate('kpop', input), /dance-edm|rock-solo/);

console.log('dance-edm mv prompt ok');
