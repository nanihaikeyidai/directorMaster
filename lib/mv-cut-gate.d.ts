import type { EnergyHop } from './mv-lipsync-prep.d.ts';

export const CUT_GATE_TOLERANCE_SEC: number;

export type LyricCue = {
  startSec: number;
  endSec: number;
  text?: string;
};

export type CutKind =
  | 'phrase_end'
  | 'breath'
  | 'vocal_gap'
  | 'song_edge'
  | 'mid_lyric'
  | 'invalid';

export type CutAssessment = {
  t: number;
  ok: boolean;
  kind: CutKind;
  snappedT: number;
  code?: string;
  reason: string;
};

export type CutCheckIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  t?: number;
  snappedT?: number;
};

export type VocalRun = {
  startSec: number;
  endSec: number;
  active: boolean;
};

export type CutCheckInput = {
  cuts?: unknown;
  lyrics?: unknown;
  hops?: unknown;
  durationSec?: number;
  toleranceSec?: number;
  hopSec?: number;
};

export type CutCheckReport = {
  ok: boolean;
  toleranceSec: number;
  hopSec?: number;
  durationSec?: number;
  reason: string;
  cuts: CutAssessment[];
  snappedCuts: number[];
  issues: CutCheckIssue[];
};

export type CutClassifyContext = {
  lyrics?: unknown;
  hops?: unknown;
  durationSec?: number;
  toleranceSec?: number;
  hopSec?: number;
};

export function parseLyricCues(input?: unknown): LyricCue[];
export function findVocalRuns(
  hops?: unknown,
  opts?: { hopSec?: number },
): VocalRun[];
export function classifyCutPoint(t: unknown, ctx?: CutClassifyContext): CutAssessment;
export function checkMvCuts(input?: CutCheckInput): CutCheckReport;
