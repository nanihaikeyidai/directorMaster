import type { LyricCue } from "./mv-cut-gate.d.ts";

export const DEFAULT_MAX_SEGMENT_SEC: number;
export const DEFAULT_MIN_INSTRUMENTAL_SEC: number;

export type PhraseCoverage = "singing-closeup" | "instrumental-wide";

export type LyricSegmentNote = {
  kind: "vocal" | "instrumental";
  lyrics: string;
  shotType: "lead" | "wide";
  coverage: PhraseCoverage;
  direction: string;
  phraseEndsSec: number[];
};

export type PlannedLyricSegment = LyricSegmentNote & {
  index?: number;
  start: number;
  end: number;
  duration: number;
  phrases: LyricCue[];
};

export type LyricSegmentPlan = {
  ok: boolean;
  reason: string;
  cuts: number[];
  notes: LyricSegmentNote[];
  segments: PlannedLyricSegment[];
  durationSec: number;
};

export function singingCoverageNote(lyricsText?: string, phraseEndsSec?: number[]): LyricSegmentNote;
export function instrumentalCoverageNote(): LyricSegmentNote;
export function planLyricPhraseSegments(input?: {
  lyrics?: unknown;
  durationSec?: number;
  maxSegmentSec?: number;
  minInstrumentalSec?: number;
}): LyricSegmentPlan;
export function notesFromLyricSegments(points?: number[], lyrics?: unknown): LyricSegmentNote[];
