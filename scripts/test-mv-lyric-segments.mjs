import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  instrumentalCoverageNote,
  notesFromLyricSegments,
  planLyricPhraseSegments,
  singingCoverageNote,
} from '../lib/mv-lyric-segments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lyricsFixture = JSON.parse(readFileSync(path.join(repoRoot, 'examples/mv-cut-lyrics.json'), 'utf8'));

const empty = planLyricPhraseSegments({ lyrics: lyricsFixture, durationSec: 0 });
assert.equal(empty.ok, false);
assert.match(empty.reason, /时长/);

const noLyrics = planLyricPhraseSegments({ durationSec: 20, lyrics: [] });
assert.equal(noLyrics.ok, false);
assert.match(noLyrics.reason, /歌词时间轴/);

const tooLong = planLyricPhraseSegments({
  durationSec: 20,
  maxSegmentSec: 15,
  lyrics: [{ startSec: 1, endSec: 17, text: 'too long to split mid-line' }],
});
assert.equal(tooLong.ok, false);
assert.match(tooLong.reason, /超过 15 秒|句中/);

// Fixture: 2-6 first phrase, 10-14 second phrase, duration 16.
// 0-2 and 6-10 and 14-16 are >= 2s instrumental gaps.
const planned = planLyricPhraseSegments({ lyrics: lyricsFixture, durationSec: 16 });
assert.equal(planned.ok, true);
assert.deepEqual(planned.cuts, [2, 6, 10, 14]);
assert.equal(planned.segments.length, 5);
assert.equal(planned.notes.length, 5);
assert.equal(planned.notes[0].kind, 'instrumental');
assert.equal(planned.notes[0].shotType, 'wide');
assert.equal(planned.notes[0].coverage, 'instrumental-wide');
assert.match(planned.notes[0].direction, /远景/);
assert.equal(planned.notes[1].kind, 'vocal');
assert.equal(planned.notes[1].shotType, 'lead');
assert.equal(planned.notes[1].coverage, 'singing-closeup');
assert.equal(planned.notes[1].lyrics, 'first phrase');
assert.match(planned.notes[1].direction, /固定|近景/);
assert.doesNotMatch(planned.notes[1].direction, /场地远景或琴弦/);
assert.equal(planned.notes[2].kind, 'instrumental');
assert.equal(planned.notes[3].kind, 'vocal');
assert.equal(planned.notes[3].lyrics, 'second phrase');
assert.equal(planned.notes[4].kind, 'instrumental');
assert.equal(planned.segments[1].start, 2);
assert.equal(planned.segments[1].end, 6);

// Short lead-in (< 2s) stays inside the first vocal segment; short gap packs two phrases.
const packed = planLyricPhraseSegments({
  durationSec: 12,
  lyrics: [
    { startSec: 0.5, endSec: 5, text: 'line one' },
    { startSec: 5.4, endSec: 10, text: 'line two' },
  ],
});
assert.equal(packed.ok, true);
assert.equal(packed.segments.length, 2);
assert.equal(packed.segments[0].kind, 'vocal');
assert.equal(packed.segments[0].start, 0);
assert.equal(packed.segments[0].end, 10);
assert.equal(packed.segments[0].lyrics, 'line one\nline two');
assert.deepEqual(packed.segments[0].phraseEndsSec, [5]);
assert.equal(packed.segments[1].kind, 'instrumental');
assert.deepEqual(packed.cuts, [10]);

// Existing cuts can be annotated from overlapping lyric cues.
const annotated = notesFromLyricSegments([0, 2, 6, 10, 14, 16], lyricsFixture);
assert.equal(annotated[0].kind, 'instrumental');
assert.equal(annotated[1].kind, 'vocal');
assert.equal(annotated[1].lyrics, 'first phrase');
assert.equal(annotated[2].kind, 'instrumental');
assert.equal(annotated[3].lyrics, 'second phrase');
assert.equal(annotated[4].coverage, 'instrumental-wide');

const vocalNote = singingCoverageNote('海风轻轻吹', [3.2]);
assert.equal(vocalNote.shotType, 'lead');
assert.deepEqual(vocalNote.phraseEndsSec, [3.2]);
assert.equal(instrumentalCoverageNote().shotType, 'wide');

console.log('mv-lyric-segments tests passed');
