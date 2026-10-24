import assert from 'node:assert/strict';
import {
  getAudibleTracks,
  migrateScriptToTimeline,
  normalizeTimeline,
  validateTimeline,
} from '../lib/redub-timeline.mjs';

const timeline = normalizeTimeline({
  version: 1,
  name: 'regression',
  duration: 10,
  tracks: [
    {
      id: 'dialogue-01',
      name: 'Speaker A',
      kind: 'dialogue',
      clips: [
        { id: 'L001', source: 'A', start: 0, duration: 2, audioPath: 'a.wav' },
        { id: 'L002', source: 'A', start: 2.5, duration: 2, audioPath: 'b.wav' },
      ],
    },
    {
      id: 'music-01',
      name: 'Music',
      kind: 'bed',
      clips: [
        { id: 'BED001', source: 'music', start: 0, duration: 10, audioPath: 'music.wav' },
      ],
    },
  ],
});

assert.equal(timeline.version, 1);
assert.equal(timeline.tracks[0].volume, 1);
assert.equal(timeline.tracks[0].clips[0].fadeIn, 0);
assert.deepEqual(validateTimeline(timeline), []);

const overlap = structuredClone(timeline);
overlap.tracks[0].clips[1].start = 1.5;
assert.ok(validateTimeline(overlap).some((error) => error.code === 'CLIP_OVERLAP'));

const outOfBounds = structuredClone(timeline);
outOfBounds.tracks[0].clips[1].start = 9;
assert.ok(validateTimeline(outOfBounds).some((error) => error.code === 'CLIP_OUT_OF_BOUNDS'));

const audible = structuredClone(timeline);
audible.tracks[0].muted = true;
audible.tracks[1].solo = true;
assert.deepEqual(getAudibleTracks(audible).map((track) => track.id), ['music-01']);

const migrated = migrateScriptToTimeline(
  {
    version: 1,
    segments: [
      { id: 'L001', speaker: 'A', start: 1, end: 3, newText: 'First' },
      { id: 'L002', speaker: 'B', start: 4, end: 6.5, newText: 'Second' },
    ],
  },
  {
    items: [
      { id: 'L001', path: 'tts/L001.wav', ttsDuration: 2.2, text: 'First' },
      { id: 'L002', path: 'tts/L002.wav', ttsDuration: 2.4, text: 'Second' },
    ],
  },
  { name: 'legacy migration' },
);

assert.equal(migrated.tracks.length, 2);
assert.equal(migrated.duration, 6.5);
assert.equal(migrated.tracks[0].name, 'A');
assert.equal(migrated.tracks[1].clips[0].start, 4);
assert.equal(migrated.tracks[1].clips[0].audioPath, 'tts/L002.wav');
assert.deepEqual(validateTimeline(migrated), []);

console.log(JSON.stringify({ ok: true, tracks: migrated.tracks.length, duration: migrated.duration }));
