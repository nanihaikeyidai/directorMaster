import assert from 'node:assert/strict';
import {
  buildRapHiphopMvPrompt,
  RAP_HIPHOP_MV_PROMPT_TEMPLATE_VERSION,
  MV_PROMPT_TEMPLATES,
  listMvPromptTemplates,
  buildMvPromptForTemplate,
  buildRockSoloMvPrompt,
  buildDanceEdmMvPrompt,
} from '../lib/mv-prompt.mjs';

const assets = [
  { mediaType: 'image', category: '人物', description: 'Kai is an adult male rapper with braids, an oversized hoodie, gold chain, and a handheld microphone.' },
  { mediaType: 'image', category: '场景', description: 'Night city rooftop / street stage with graffiti wall, neon signs, and a DJ turntable setup.' },
];
const sections = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'];

assert.match(String(RAP_HIPHOP_MV_PROMPT_TEMPLATE_VERSION), /^rap-hiphop-ref2va-/);

const instrumental = buildRapHiphopMvPrompt({
  projectName: 'Rap Hiphop Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '前奏鼓机与搓碟' },
  assets,
});
let cursor = -1;
for (const section of sections) {
  const index = instrumental.indexOf(section);
  assert.ok(index > cursor, `${section} must exist in canonical order`);
  cursor = index;
}
assert.match(instrumental, /graffiti|street|turntable|neon|rooftop|stage/i);
assert.match(instrumental, /do not frame the singer's face|no singer face close-up/i);
assert.doesNotMatch(instrumental, /【动作类型：歌手面部特写】/);
assert.match(instrumental, /phrase boundary|breath|vocal gap/i);
assert.match(instrumental, /never duplicate/i);

const vocal = buildRapHiphopMvPrompt({
  projectName: 'Rap Hiphop Test',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'vocal', lyrics: '我从街角一路走到这里' },
  assets,
});
assert.match(vocal, /<d>\[Chinese\] 我从街角一路走到这里<\/d>/);
assert.match(vocal, /【动作类型：歌手面部特写】/);
assert.match(vocal, /lip|mouth|jaw/i);
assert.match(vocal, /dense|rapid|syllable/i);
assert.match(vocal, /microphone|mic/i);

const enters = buildRapHiphopMvPrompt({
  projectName: 'Rap Hiphop Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'vocal', lyrics: '' },
  assets,
  settings: { vocalStartSec: '6' },
});
assert.match(enters, /00:06\.000/);
const shot1 = enters.split('\n[Shot 2]')[0].split('\n[Shot 1]')[1];
assert.doesNotMatch(shot1, /【动作类型：歌手面部特写】/);
assert.match((enters.split('\n[Shot 2]')[1] || '').split('\n')[0], /【动作类型：歌手面部特写】/);

assert.throws(() => buildRapHiphopMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' },
  assets: [{ mediaType: 'image', category: '人物', description: 'character sheet left panel and right panel' }, assets[1]],
}), /dual|character sheet|人设表|双人/i);
assert.throws(() => buildRapHiphopMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' }, assets: [assets[0]],
}), /场景/);

// Registry
const ids = listMvPromptTemplates().map((t) => t.id);
for (const id of ['band', 'folk-solo', 'folk-duo', 'piano-ballad', 'rock-solo', 'dance-edm', 'rap-hiphop']) {
  assert.ok(ids.includes(id), `registry has ${id}`);
}
assert.equal(MV_PROMPT_TEMPLATES['rap-hiphop'].version, RAP_HIPHOP_MV_PROMPT_TEMPLATE_VERSION);
assert.equal(MV_PROMPT_TEMPLATES['rap-hiphop'].label, '说唱嘻哈（街头/舞台）');
for (const t of listMvPromptTemplates()) { assert.ok(t.label); assert.ok(t.version); }
const input = {
  projectName: 'Reg',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'vocal', lyrics: '押韵' },
  assets,
};
assert.equal(buildMvPromptForTemplate('rap-hiphop', input), buildRapHiphopMvPrompt(input));
assert.equal(buildMvPromptForTemplate('rock-solo', input), buildRockSoloMvPrompt(input));
assert.equal(buildMvPromptForTemplate('dance-edm', input), buildDanceEdmMvPrompt(input));
assert.equal(listMvPromptTemplates().length, 7);
assert.throws(() => buildMvPromptForTemplate('kpop', input), /rap-hiphop|dance-edm/);

console.log('rap-hiphop mv prompt ok');
