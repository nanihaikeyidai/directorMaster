import assert from 'node:assert/strict';
import {
  buildPianoBalladMvPrompt,
  PIANO_BALLAD_MV_PROMPT_TEMPLATE_VERSION,
  MV_PROMPT_TEMPLATES,
  listMvPromptTemplates,
  buildMvPromptForTemplate,
  buildFolkSoloMvPrompt,
} from '../lib/mv-prompt.mjs';

const assets = [
  { mediaType: 'image', category: '人物', description: 'Lin is an adult female ballad singer with long black hair and an ivory satin dress, seated at a black grand piano.' },
  { mediaType: 'image', category: '场景', description: 'Dim empty concert hall stage with a single warm spotlight and a black grand piano.' },
];
const sections = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'];

assert.match(String(PIANO_BALLAD_MV_PROMPT_TEMPLATE_VERSION), /^piano-ballad-ref2va-/);

const instrumental = buildPianoBalladMvPrompt({
  projectName: 'Piano Ballad Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '钢琴前奏' },
  assets,
});
let cursor = -1;
for (const section of sections) {
  const index = instrumental.indexOf(section);
  assert.ok(index > cursor, `${section} must exist in canonical order`);
  cursor = index;
}
assert.match(instrumental, /piano/i);
assert.match(instrumental, /keys|keyboard|hammers/i);
assert.match(instrumental, /wide|venue|establishing/i);
assert.match(instrumental, /do not frame the (singer|pianist)'s face|no singer face close-up/i);
assert.doesNotMatch(instrumental, /【动作类型：歌手面部特写】/);
assert.doesNotMatch(instrumental, /guitar/i);
assert.match(instrumental, /phrase boundary|breath|vocal gap/i);
assert.match(instrumental, /never duplicate/i);

const vocal = buildPianoBalladMvPrompt({
  projectName: 'Piano Ballad Test',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'vocal', lyrics: '月光落在琴键上' },
  assets,
});
assert.match(vocal, /<d>\[Chinese\] 月光落在琴键上<\/d>/);
assert.match(vocal, /【动作类型：歌手面部特写】/);
assert.match(vocal, /lip|mouth|jaw/i);

const enters = buildPianoBalladMvPrompt({
  projectName: 'Piano Ballad Test',
  segment: { index: 1, start: 0, end: 10, duration: 10 },
  note: { kind: 'vocal', lyrics: '' },
  assets,
  settings: { vocalStartSec: '6' },
});
assert.match(enters, /00:06\.000/);
const shot1 = enters.split('\n[Shot 2]')[0].split('\n[Shot 1]')[1];
assert.doesNotMatch(shot1, /【动作类型：歌手面部特写】/);
assert.match((enters.split('\n[Shot 2]')[1] || '').split('\n')[0], /【动作类型：歌手面部特写】/);

assert.throws(() => buildPianoBalladMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' },
  assets: [{ mediaType: 'image', category: '人物', description: 'character sheet left panel and right panel' }, assets[1]],
}), /dual|character sheet|人设表|双人/i);
assert.throws(() => buildPianoBalladMvPrompt({
  projectName: 'Bad', segment: { index: 1, duration: 5 }, note: { kind: 'vocal' }, assets: [assets[0]],
}), /场景/);

// Registry
const ids = listMvPromptTemplates().map((t) => t.id);
for (const id of ['band', 'folk-solo', 'folk-duo', 'piano-ballad']) assert.ok(ids.includes(id), `registry has ${id}`);
assert.equal(MV_PROMPT_TEMPLATES['piano-ballad'].version, PIANO_BALLAD_MV_PROMPT_TEMPLATE_VERSION);
for (const t of listMvPromptTemplates()) { assert.ok(t.label); assert.ok(t.version); }
const input = { projectName: 'Reg', segment: { index: 2, start: 10, end: 20, duration: 10 }, note: { kind: 'vocal', lyrics: '海风' }, assets: [
  { mediaType: 'image', category: '人物', description: 'adult folk singer with acoustic guitar' }, assets[1]] };
assert.equal(buildMvPromptForTemplate('folk-solo', input), buildFolkSoloMvPrompt(input));
assert.throws(() => buildMvPromptForTemplate('kpop', input), /piano-ballad/);

console.log('piano-ballad mv prompt ok');
