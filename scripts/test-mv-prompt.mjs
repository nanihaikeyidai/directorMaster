import assert from 'node:assert/strict';
import { buildStandardBandMvPrompt, defaultBandMvActions, getSegmentVocalTiming } from '../lib/mv-prompt.mjs';

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
assert.match(prompt, /\[Shot 2\] 【动作类型：乐手演奏特写】 At 00:03\.096/);
assert.match(prompt, /\[Shot 3\] 【动作类型：观众反应特写】 At 00:06\.450/);
assert.match(prompt, /\[Shot 4\] 【动作类型：主唱特写】 At 00:09\.804/);
assert.match(prompt, /<d>\[Chinese\] 跟着灯光向前走<\/d>/);
assert.match(prompt, /Camera stability rule:/);
assert.match(prompt, /mostly locked-off tripod or stabilized compositions/);
assert.match(prompt, /Do not use continuous tracking, orbiting, crane movement/);
assert.match(prompt, /locked-off/);
assert.match(prompt, /featured instrumentalist/);
assert.match(prompt, /at least three visual dimensions/);
assert.match(prompt, /Never place the same subject at the same scale/);
assert.doesNotMatch(prompt, /MUSICIAN_CLOSE/);
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

const guitaristPrompt = buildStandardBandMvPrompt({
  projectName: '手动镜头类型测试',
  segment: { index: 4, start: 25, end: 36, duration: 11 },
  note: { kind: 'vocal', shotType: 'guitar', direction: '突出Sara演奏。' },
  assets,
});
assert.match(guitaristPrompt, /\[Shot 1\] 【动作类型：吉他手演奏特写】/);
assert.match(guitaristPrompt, /guitarist explicitly identified by the uploaded performer descriptions/);
assert.match(guitaristPrompt, /fretting hand, picking hand, and guitar/);
assert.match(guitaristPrompt, /Primary shot type: 吉他手演奏特写/);
assert.match(guitaristPrompt, /\[Shot 3\] 【动作类型：吉他手演奏特写】/);

const audiencePrompt = buildStandardBandMvPrompt({
  projectName: '观众镜头类型测试',
  segment: { index: 5, start: 36, end: 44, duration: 8 },
  note: { kind: 'vocal', shotType: 'audience' },
  assets,
});
assert.match(audiencePrompt, /动作类型：观众反应特写/);
assert.match(audiencePrompt, /audience members reacting naturally/);
assert.match(audiencePrompt, /audience reaction close-up/);

const drummerPrompt = buildStandardBandMvPrompt({
  projectName: '鼓手镜头类型测试',
  segment: { index: 6, start: 44, end: 54, duration: 10 },
  note: { kind: 'instrumental', shotType: 'drums' },
  assets,
});
assert.match(drummerPrompt, /动作类型：鼓手演奏特写/);
assert.match(drummerPrompt, /drummer explicitly identified by the uploaded performer descriptions/);
assert.match(drummerPrompt, /sticks contacting the correct drums and cymbals/);

const leadPrompt = buildStandardBandMvPrompt({
  projectName: '主唱镜头类型测试',
  segment: { index: 7, start: 54, end: 62, duration: 8 },
  note: { kind: 'vocal', shotType: 'lead' },
  assets,
});
assert.match(leadPrompt, /动作类型：主唱特写/);
assert.match(leadPrompt, /mouth movement driven only by audible vocals/);

const roleAssets = [
  { mediaType: 'image', category: '人物', name: 'Camilla 主唱', description: 'Camilla 是主唱，成人女性，站在舞台中央。' },
  { mediaType: 'image', category: '人物', name: 'Sara 吉他手', description: 'Sara 是吉他手，负责电吉他演奏。' },
  { mediaType: 'image', category: '人物', name: 'Luna 鼓手', description: 'Luna 是鼓手，位于舞台后方，演奏架子鼓。' },
  { mediaType: 'image', category: '人物', name: 'Naya 贝斯手', description: 'Naya 是贝斯手，演奏低音贝斯。' },
  { mediaType: 'image', category: '人物', name: 'Seraphine 吉他手', description: 'Seraphine 是吉他手，演奏主音电吉他。' },
  { mediaType: 'image', category: '场景', name: '舞台', description: '室内演出舞台。' },
];
const openingWaitPrompt = buildStandardBandMvPrompt({
  projectName: '开场等待镜头测试',
  segment: { index: 1, start: 0, end: 4, duration: 4 },
  assets: roleAssets,
  note: { shotActions: [{ type: 'opening_wait', duration: 4 }] },
});
assert.match(openingWaitPrompt, /【动作类型：开场等待】/);
assert.match(openingWaitPrompt, /performance lights remain completely OFF throughout this shot/);
assert.match(openingWaitPrompt, /extreme long shot from the far rear of the venue/);
assert.match(openingWaitPrompt, /small, dim human silhouettes marking their assigned stage positions/);
assert.match(openingWaitPrompt, /Keep every face unreadable and lost in shadow/);
assert.match(openingWaitPrompt, /Do not reveal or clearly feature every member's face/);
assert.match(openingWaitPrompt, /very faint, distant, diffuse wash of fans cheering/);
assert.match(openingWaitPrompt, /voices must remain indistinct and unintelligible/);
assert.match(openingWaitPrompt, /Do not continue the crowd sound into later shots/);
assert.match(openingWaitPrompt, /no singing, lip-sync, or dialogue/);
assert.match(openingWaitPrompt, /all visible performers keep their mouths naturally closed and do not sing, lip-sync, or speak/);
assert.doesNotMatch(leadPrompt, /add a very faint, distant, diffuse crowd cheer/);

const timedActionPrompt = buildStandardBandMvPrompt({
  projectName: '多动作与素材映射测试',
  segment: { index: 8, start: 20, end: 28, duration: 8 },
  assets: roleAssets,
  note: {
    kind: 'vocal',
    shotActions: [
      { type: 'band_wide', duration: 2 },
      { type: 'drums_full', duration: 2 },
      { type: 'drums_hands', duration: 2 },
      { type: 'lead_profile', duration: 2 },
    ],
  },
});
assert.match(timedActionPrompt, /Use the user's 4-action shot sequence.*乐队全景/);
assert.match(timedActionPrompt, /动作类型：鼓手全身演奏特写/);
assert.match(timedActionPrompt, /动作类型：鼓手手部鼓槌特写/);
assert.match(timedActionPrompt, /<Subject 3> \(Luna 鼓手, the drummer identified by <Picture 3>\)/);
assert.match(timedActionPrompt, /<Subject 1> \(Camilla 主唱, the lead vocalist identified by <Picture 1>\)/);
assert.match(timedActionPrompt, /At 00:02\.000/);
assert.match(timedActionPrompt, /At 00:04\.000/);
assert.match(timedActionPrompt, /At 00:06\.000/);
assert.match(timedActionPrompt, /Hold this distinct composition for 2\.00 seconds/);
const timedDetailedDescription = timedActionPrompt.split('detailed_description:')[1].split('overall_soundscape:')[0];
assert.equal([...timedDetailedDescription.matchAll(/\[Shot \d+\]/g)].length, 4, 'custom action prompts should emit one shot section per configured action');
assert.deepEqual(defaultBandMvActions('lead', 8).map((action) => action.type), ['lead_front', 'lead_three_quarter', 'lead_profile']);
assert.deepEqual(defaultBandMvActions('drums', 8).map((action) => action.type), ['drums_full', 'drums_hands', 'drums_full']);
const individualPlayerPrompt = buildStandardBandMvPrompt({
  projectName: '指定乐手引用测试',
  segment: { index: 9, start: 28, end: 36, duration: 8 },
  assets: roleAssets.map((asset, index) => ({ ...asset, id: `member-${index + 1}` })),
  note: { shotActions: [
    { type: 'guitar_full', duration: 4, memberId: 'member-5', moveType: 'slow_push', moveDuration: 1.25 },
    { type: 'guitar_hands', duration: 4, memberId: 'member-5' },
  ] },
});
assert.match(individualPlayerPrompt, /<Subject 5> \(Seraphine 吉他手, the guitarist identified by <Picture 5>\)/);
assert.doesNotMatch(individualPlayerPrompt.slice(individualPlayerPrompt.indexOf('[Shot 1]')), /<Subject 2> \(Sara 吉他手/);
assert.match(individualPlayerPrompt, /during the first 1\.25 seconds, perform a slow, straight push-in, then settle into a fully locked composition for the remainder of this shot/);

console.log(JSON.stringify({ ok: true, chars: prompt.length, pictures: 3, subjects: 3, sections: sections.length }));
