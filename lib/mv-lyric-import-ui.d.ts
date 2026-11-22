import type { LyricSegmentNote, PlannedLyricSegment } from "./mv-lyric-segments.d.ts";

export type LyricImportParseResult = {
  ok: boolean;
  lyrics: unknown;
  reason: string;
};

export type LyricImportPlan = {
  ok: boolean;
  reason: string;
  cuts: number[];
  notes: LyricSegmentNote[];
  segments: PlannedLyricSegment[];
  durationSec: number;
  rangeStart: number;
  rangeEnd: number;
};

export function parseLyricImportText(text?: string): LyricImportParseResult;
export function planMvLyricImportUi(input?: {
  lyrics?: unknown;
  durationSec?: number;
  rangeStart?: number;
  rangeEnd?: number;
  maxSegmentSec?: number;
  minInstrumentalSec?: number;
}): LyricImportPlan;
