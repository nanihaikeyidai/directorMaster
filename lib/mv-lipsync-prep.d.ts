export type EnergyHop = {
  t: number;
  rmsDb: number;
  midDb: number;
  bassDb: number;
};

export type VocalSegmentResult = {
  ok: boolean;
  startSec?: number;
  endSec?: number;
  durationSec?: number;
  vocalActiveRatio?: number;
  confidence?: number;
  reason: string;
};

export type FaceCloseUpAssessment = {
  ok: boolean;
  score: number;
  reason: string;
  signals: Record<string, unknown>;
};

export type LipsyncTrialPlan = {
  ok: boolean;
  audio?: VocalSegmentResult;
  person?: FaceCloseUpAssessment;
  workflowId?: string;
  reason: string;
};

export function isVocalActiveHop(
  hop: EnergyHop,
  opts?: { rmsFloor?: number; midFloor?: number; midMinusBassMin?: number },
): boolean;

export function selectVocalSegment(
  hops: EnergyHop[],
  opts?: {
    targetDurationSec?: number;
    minDurationSec?: number;
    minVocalActiveRatio?: number;
    hopSec?: number;
  },
): VocalSegmentResult;

export function assessFaceCloseUpRef(input: {
  path?: string;
  width: number;
  height: number;
  centerSkinFraction?: number;
  faceHeightRatio?: number;
}): FaceCloseUpAssessment;

export function buildLipsyncTrialPlan(input: {
  hops: EnergyHop[];
  person: {
    path?: string;
    width: number;
    height: number;
    centerSkinFraction?: number;
    faceHeightRatio?: number;
  };
  targetDurationSec?: number;
  minDurationSec?: number;
  minVocalActiveRatio?: number;
  hopSec?: number;
  workflowId?: string;
}): LipsyncTrialPlan;

export function probeEnergyHops(
  audioPath: string,
  opts?: { hopSec?: number },
): EnergyHop[];
