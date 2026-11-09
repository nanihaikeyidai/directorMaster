export type CharacterRefRole =
  | 'face_closeup'
  | 'threeview_front'
  | 'threeview_side'
  | 'threeview_back'
  | 'costume'
  | 'scene'
  | 'unknown';

export type CharacterFaceBox = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
};

export type CharacterRefInput = {
  path?: string;
  role?: string;
  width?: number;
  height?: number;
  faceBox?: CharacterFaceBox;
};

export type CharacterRef = {
  path: string;
  role: CharacterRefRole;
  width?: number;
  height?: number;
  faceBox?: CharacterFaceBox;
};

export type CharacterThreeview = {
  front: CharacterRef | null;
  side: CharacterRef | null;
  back: CharacterRef | null;
};

export type CharacterConsistencyPack = {
  primaryFace: CharacterRef | null;
  threeview: CharacterThreeview;
  costumes: CharacterRef[];
  scenes: CharacterRef[];
  orderedRefs: CharacterRef[];
  identityLockText: string;
  warnings: string[];
};

export type CharacterConsistencyResult = {
  ok: boolean;
  reason?: string;
  pack: CharacterConsistencyPack;
  summary: string;
};

export const CHARACTER_REF_ROLES: readonly CharacterRefRole[];
export const CHARACTER_REF_IMAGE_RE: RegExp;

export function normalizeRefPath(value: string): string;

export function classifyCharacterRef(
  pathOrMeta: string | CharacterRefInput | null | undefined,
): CharacterRefRole;

export function buildCharacterConsistencyPack(
  refs: Array<string | CharacterRefInput> | null | undefined,
  opts?: Record<string, unknown>,
): CharacterConsistencyResult;

export function formatCharacterPackReport(result: CharacterConsistencyResult): string;

export function listCharacterRefPaths(dir: string): string[];
