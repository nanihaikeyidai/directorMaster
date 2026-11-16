import type { CutGatePlan } from './mv-cut-gate.d.ts';

export const PRECHECK_MAX_SEGMENT_SEC: number;
export const PRECHECK_MIN_SEGMENT_SEC: number;

export type CutPrecheckResult = {
  ok: boolean;
  mode: 'pass' | 'snap' | 'block' | 'skip';
  reason: string;
  cuts: number[];
  gate: CutGatePlan;
};

export function planMvCutPrecheck(input?: {
  cuts?: number[];
  hops?: unknown;
  lyrics?: unknown;
  durationSec?: number;
  rangeStart?: number;
  rangeEnd?: number;
  autoSnap?: boolean;
  maxSegmentSec?: number;
  minSegmentSec?: number;
  toleranceSec?: number;
}): CutPrecheckResult;
