import type { FaceCloseUpAssessment } from './mv-face-closeup.d.ts';

export const DEFAULT_LIPSYNC_QC_MIN_CLOSEUP_RATIO: number;
export const DEFAULT_LIPSYNC_QC_MIN_FRAMES: number;

export type LipsyncQcFrameInput = {
  tSec?: number;
  path?: string;
  width?: number;
  height?: number;
  faceHeightRatio?: number;
  centerSkinFraction?: number;
};

export type LipsyncQcFrameResult = FaceCloseUpAssessment & {
  index: number;
  tSec?: number;
  path?: string;
};

export type LipsyncQcPlan = {
  ok: boolean;
  reason: string;
  purpose: 'vocal' | 'instrumental';
  frameCount: number;
  closeUpCount: number;
  closeUpRatio: number;
  minCloseUpRatio: number;
  minFrames: number;
  frames: LipsyncQcFrameResult[];
  code?: 'MISSING_FRAMES' | 'LOW_CLOSEUP_COVERAGE';
};

export function assessOutputFrameCloseUp(frame?: LipsyncQcFrameInput): FaceCloseUpAssessment;

export function planLipsyncQc(input?: {
  frames?: LipsyncQcFrameInput[];
  purpose?: string;
  minCloseUpRatio?: number;
  minFrames?: number;
}): LipsyncQcPlan;
