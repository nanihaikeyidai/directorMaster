import type { SubtitleCue } from './subtitle-cues';

export type CuePatch = {
  index: number;
  text?: string;
  translation?: string;
  startMs?: number;
  endMs?: number;
};

export type ParseRhAsrResult = {
  cues: SubtitleCue[];
  needsReview?: boolean;
  source?:
    | 'segments'
    | 'sentences'
    | 'result'
    | 'array'
    | 'plain-passthrough'
    | 'weak-split'
    | string;
};

export function parseRhAsrOutput(
  raw: unknown,
  options?: { durationMs?: number },
): ParseRhAsrResult;

export function applyCuePatches(
  cues: SubtitleCue[],
  patches: CuePatch[],
): SubtitleCue[];
