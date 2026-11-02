import assert from 'node:assert/strict';
import {
  buildRockSoloMvPrompt,
  ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION,
  MV_PROMPT_TEMPLATES,
  listMvPromptTemplates,
  buildMvPromptForTemplate,
  buildFolkSoloMvPrompt,
} from '../lib/mv-prompt.mjs';

const assets = [
  { mediaType: 'image', category: '人物', description: 'Kai is an adult male rock singer with short black hair and a black leather jacket, holding an electric guitar on stage.' },
  { mediaType: 'image', category: '场景', description: 'Dark rock club stage with spotlights, a guitar amp and pedalboard, and empty audience floor.' },
];
const sections = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'];

assert.match(String(ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION), /^rock-solo-ref2va-/);

const instrumental = buildRockSoloMvPrompt({
  projectName: 'Rock Solo Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '电吉他前奏' },
  assets,
});
let cursor = -1;
for (const section of sections) {
  const index = instrumental.indexOf(section);
  assert.ok(index > cursor, `${section} must exist in canonical order`);
  cursor = index;
}
assert.match(instrumental, /electric guitars?|guitar/i);
assert.match(instrumental, /amp|pedal|neck|stage/i);
assert.match(instrumental, /wide|stage|establishing/i);
assert.match(instrumental, /do not frame the singer's face|no singer face close-up/i);
assert.doesNotMatch(instrumental, /【动作类型：歌手面部特写】/);
assert.match(instrumental, /phrase boundary|breath|vocal gap/i);
assert.match(instrumental, /never duplicate/i);

const vocal = buildRockSoloMvPrompt({
  projectName: 'Rock Solo Test',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'vocal', lyrics: '点燃舞台的火焰' },
  assets,
});
assert.match(vocal, /<d>\[Chinese\] 点燃舞台的火焰<\/d>/);
assert.match(vocal, /【动作类型：歌手面部特写】/);
assert.match(vocal, /lip|mouth|jaw/i);

const enters = buildRockSoloMvPrompt({
  projectName: 'Rock Solo Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'vocal', lyrics: '' },
  assets,
  settings: { vocalStartSec: '6' },
});
assert.match(enters, /00:06\.000/);
const shot1 = enters.split('\n[Shot 2]')[0].split('\n[Shot 1]')[1];
assert.doesNotMatch(shot1, /【动作类型：歌手面部特写】/);
assert.match((enters.split('\n[Shot 2]')[1] || '').split('\n')[0], /【动作类型：歌手面部特写】/);

assert.throws(() => buildRockSoloMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' },
  assets: [{ mediaType: 'image', category: '人物', description: 'character sheet left panel and right panel' }, assets[1]],
}), /dual|character sheet|人设表|双人/i);
assert.throws(() => buildRockSoloMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' }, assets: [assets[0]],
}), /场景/);

// Registry
const ids = listMvPromptTemplates().map((t) => t.id);
for (const id of ['band', 'folk-solo', 'folk-duo', 'piano-ballad', 'rock-solo']) assert.ok(ids.includes(id), `registry has ${id}`);
assert.equal(MV_PROMPT_TEMPLATES['rock-solo'].version, ROCK_SOLO_MV_PROMPT_TEMPLATE_VERSION);
assert.equal(MV_PROMPT_TEMPLATES['rock-solo'].label, '摇滚独唱（电吉他舞台）');
for (const t of listMvPromptTemplates()) { assert.ok(t.label); assert.ok(t.version); }
const input = { projectName: 'Reg', segment: { index: 2, start: 10, end: 20, duration: 10 }, note: { kind: 'vocal', lyrics: '海风' }, assets: [
  { mediaType: 'image', category: '人物', description: 'adult folk singer with acoustic guitar' }, assets[1]] };
assert.equal(buildMvPromptForTemplate('folk-solo', input), buildFolkSoloMvPrompt(input));
assert.equal(buildMvPromptForTemplate('rock-solo', { projectName: 'Reg', segment: { index: 2, start: 10, end: 20, duration: 10 }, note: { kind: 'vocal', lyrics: '燃烧' }, assets }), buildRockSoloMvPrompt({ projectName: 'Reg', segment: { index: 2, start: 10, end: 20, duration: 10 }, note: { kind: 'vocal', lyrics: '燃烧' }, assets }));
assert.throws(() => buildMvPromptForTemplate('kpop', input), /rock-solo|piano-ballad/);

console.log('rock-solo mv prompt ok');
