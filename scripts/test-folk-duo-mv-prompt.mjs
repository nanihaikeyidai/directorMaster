import assert from 'node:assert/strict';
import {
  buildFolkDuoMvPrompt,
  FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION,
  getSegmentVocalTiming,
} from '../lib/mv-prompt.mjs';

const assets = [
  {
    mediaType: 'image',
    category: '人物',
    name: 'Camilla Singer',
    description:
      'Camilla is an adult folk 主唱 / lead singer with silver-white layered hair, light blue-grey eyes, and cream linen attire.',
  },
  {
    mediaType: 'image',
    category: '人物',
    name: 'Leo Guitar',
    description:
      'Leo is an adult acoustic 吉他 / guitarist with short dark hair, denim jacket, and a warm wooden dreadnought guitar.',
  },
  {
    mediaType: 'image',
    category: '场景',
    description: 'Intimate golden-hour beach shore with wet sand, ocean horizon, and warm amber rim light.',
  },
];

const sections = [
  'subject_definitions:',
  'summary:',
  'retention_analysis:',
  'detailed_description:',
  'overall_soundscape:',
  'non_diegetic_music:',
];

assert.match(String(FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION), /^folk-duo-ref2va-/);

const instrumental = buildFolkDuoMvPrompt({
  projectName: 'Folk Duo Test',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '纯伴奏间奏，远景与吉他手手部。' },
  assets,
});

let cursor = -1;
for (const section of sections) {
  const index = instrumental.indexOf(section);
  assert.ok(index > cursor, `${section} must exist in canonical order`);
  cursor = index;
}

assert.match(instrumental, /never cut (in the )?mid(-| )lyric|phrase boundary|breath|vocal gap/i);
assert.match(instrumental, /wide|venue|establishing|guitar|hands|strings|instrument/i);
assert.match(instrumental, /entire segment is instrumental|instrumental passage|closed/i);
assert.match(instrumental, /do not frame (the )?singer('s)? face|never use a singer face close-up|no singer face close-up/i);
assert.doesNotMatch(instrumental, /Prefer readable lip sync|prefer singer face close-up for lip sync/i);
assert.doesNotMatch(instrumental, /lip-sync to <Audio 1>/i);
assert.match(instrumental, /two (distinct )?adult|duo|吉他手|guitarist|主唱|singer/i);
assert.deepEqual(
  [...new Set([...instrumental.matchAll(/<Picture (\d+)>/g)].map((m) => Number(m[1])))].sort((a, b) => a - b),
  [1, 2, 3],
);

const vocal = buildFolkDuoMvPrompt({
  projectName: 'Folk Duo Test',
  segment: { index: 3, start: 20, end: 30, duration: 10 },
  note: { kind: 'vocal', lyrics: '海风轻轻吹', direction: '主歌，优先主唱脸部特写，吉他手点缀。' },
  assets,
});
assert.match(vocal, /close-up|特写/i);
assert.match(vocal, /<Audio 1>/);
assert.match(vocal, /<d>\[Chinese\] 海风轻轻吹<\/d>/);
assert.match(vocal, /lip|mouth|jaw/i);
assert.match(vocal, /prefer|priority|emphasize|优先/i);
assert.match(vocal, /<Subject 1>/);
assert.match(vocal, /<Subject 2>/);
assert.match(vocal, /guitarist|吉他|second subject|Subject 2/i);

const timing = getSegmentVocalTiming({ start: 0, duration: 10 }, { kind: 'vocal' }, { vocalStartSec: '7' }, 0);
assert.equal(timing.mode, 'vocal_enters');
assert.equal(timing.relativeStart, 7);

const enters = buildFolkDuoMvPrompt({
  projectName: 'Folk Duo Test',
  segment: { index: 2, start: 0, end: 10, duration: 10 },
  note: { kind: 'vocal', lyrics: '', direction: '前奏进入人声' },
  assets,
  settings: { vocalStartSec: '7' },
  leadSilenceSec: 0,
});
assert.match(enters, /00:07\.000|begins singing only when/i);
assert.match(enters, /closed/i);
assert.match(enters, /hybrid|before .* use only wide|guitar-hands coverage with no singer face/i);
assert.match(enters, /00:07\.000/);
const shot1 = enters.split('[Shot 2]')[0];
assert.match(shot1, /场地远景|琴弦手部|hands|wide|venue|guitarist/i);
assert.doesNotMatch(shot1, /【动作类型：歌手面部特写】|【动作类型：主唱面部特写】/);

assert.throws(
  () =>
    buildFolkDuoMvPrompt({
      projectName: 'Only One Person',
      segment: { index: 1, start: 0, end: 5, duration: 5 },
      note: { kind: 'vocal' },
      assets: [assets[0], assets[2]],
    }),
  /人物|performer|duo|至少.*2|至少需要两/i,
);

assert.throws(
  () =>
    buildFolkDuoMvPrompt({
      projectName: 'No Scene',
      segment: { index: 1, start: 0, end: 5, duration: 5 },
      note: { kind: 'vocal' },
      assets: [assets[0], assets[1]],
    }),
  /场景/,
);

assert.throws(
  () =>
    buildFolkDuoMvPrompt({
      projectName: 'Identical Twin',
      segment: { index: 1, start: 0, end: 5, duration: 5 },
      note: { kind: 'vocal' },
      assets: [
        {
          mediaType: 'image',
          category: '人物',
          description: 'two identical copies of the same adult folk singer used as both roles',
        },
        assets[1],
        assets[2],
      ],
    }),
  /identical|两个一样|copy|同一/i,
);

// Two different character stills must be allowed (unlike folk-solo dual-sheet ban).
const dualStillsOk = buildFolkDuoMvPrompt({
  projectName: 'Two Distinct Stills',
  segment: { index: 1, start: 0, end: 5, duration: 5 },
  note: { kind: 'vocal', lyrics: 'hello', direction: 'ok' },
  assets: [
    {
      mediaType: 'image',
      category: '人物',
      description: 'Adult singer portrait still, single figure, warm key light.',
    },
    {
      mediaType: 'image',
      category: '人物',
      description: 'Adult guitarist portrait still with acoustic guitar, different face and wardrobe.',
    },
    assets[2],
  ],
});
assert.match(dualStillsOk, /subject_definitions:/);

console.log('folk-duo mv prompt tests passed');
