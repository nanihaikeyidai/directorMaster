import assert from 'node:assert/strict';
import {
  buildFolkSoloMvPrompt,
  FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION,
  getSegmentVocalTiming,
} from '../lib/mv-prompt.mjs';

const assets = [
  {
    mediaType: 'image',
    category: '人物',
    description:
      'Camilla is an adult solo folk singer with silver-white layered hair, light blue-grey eyes, cream linen attire, and an acoustic guitar.',
  },
  {
    mediaType: 'image',
    category: '场景',
    description: 'Golden-hour beach shore with wet sand, ocean horizon, and warm amber rim light.',
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

assert.match(String(FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION), /^folk-solo-ref2va-/);

const instrumental = buildFolkSoloMvPrompt({
  projectName: 'Folk Solo Test',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'instrumental', lyrics: '', direction: '纯伴奏间奏，远景与琴弦。' },
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
assert.match(instrumental, /do not frame the soloist's face|never use a singer face close-up|no singer face close-up/i);
assert.doesNotMatch(instrumental, /Prefer readable lip sync|prefer singer face close-up for lip sync/i);
assert.doesNotMatch(instrumental, /lip-sync to <Audio 1>/i);
assert.match(instrumental, /single (adult )?performer|soloist|禁止复制|never duplicate/i);
assert.deepEqual(
  [...new Set([...instrumental.matchAll(/<Picture (\d+)>/g)].map((m) => Number(m[1])))].sort((a, b) => a - b),
  [1, 2],
);

const vocal = buildFolkSoloMvPrompt({
  projectName: 'Folk Solo Test',
  segment: { index: 3, start: 20, end: 30, duration: 10 },
  note: { kind: 'vocal', lyrics: '海风轻轻吹', direction: '主歌，优先脸部特写。' },
  assets,
});
assert.match(vocal, /close-up|特写/i);
assert.match(vocal, /<Audio 1>/);
assert.match(vocal, /<d>\[Chinese\] 海风轻轻吹<\/d>/);
assert.match(vocal, /lip|mouth|jaw/i);
assert.match(vocal, /prefer|priority|emphasize|优先/i);

const timing = getSegmentVocalTiming({ start: 0, duration: 10 }, { kind: 'vocal' }, { vocalStartSec: '7' }, 0);
assert.equal(timing.mode, 'vocal_enters');
assert.equal(timing.relativeStart, 7);

const enters = buildFolkSoloMvPrompt({
  projectName: 'Folk Solo Test',
  segment: { index: 2, start: 0, end: 10, duration: 10 },
  note: { kind: 'vocal', lyrics: '', direction: '前奏进入人声' },
  assets,
  settings: { vocalStartSec: '7' },
  leadSilenceSec: 0,
});
assert.match(enters, /00:07\.000|begins singing only when/i);
assert.match(enters, /closed/i);

assert.throws(
  () =>
    buildFolkSoloMvPrompt({
      projectName: 'Bad Sheet',
      segment: { index: 1, start: 0, end: 5, duration: 5 },
      note: { kind: 'vocal' },
      assets: [
        {
          mediaType: 'image',
          category: '人物',
          description: 'character sheet with left panel close-up and right panel full body of Camilla',
        },
        assets[1],
      ],
    }),
  /dual|character sheet|人设表|双人/i,
);

assert.throws(
  () =>
    buildFolkSoloMvPrompt({
      projectName: 'No Scene',
      segment: { index: 1, start: 0, end: 5, duration: 5 },
      note: { kind: 'vocal' },
      assets: [assets[0]],
    }),
  /场景/,
);

console.log('folk-solo mv prompt tests passed');
