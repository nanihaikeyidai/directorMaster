export const CLOSEUP_PATH_RE: RegExp;
export const SCENE_PATH_RE: RegExp;

export type FaceCloseUpAssessment = {
  ok: boolean;
  score: number;
  reason: string;
  signals: Record<string, unknown>;
};

export function assessFaceCloseUpRef(input: {
  path?: string;
  width: number;
  height: number;
  centerSkinFraction?: number;
  faceHeightRatio?: number;
}): FaceCloseUpAssessment;
