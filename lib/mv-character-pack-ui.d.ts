export const CHARACTER_REF_ROLE_LABELS: Readonly<{
  face_closeup: string;
  threeview_front: string;
  threeview_side: string;
  threeview_back: string;
  costume: string;
  scene: string;
  unknown: string;
}>;

export type CharacterPackUiCode = "NO_ASSETS" | "MISSING_FACE_LOCK" | "OK";

export type CharacterPackUiRole = {
  path?: string;
  id?: string;
  role: string;
};

export type CharacterPackUiPlan<T = Record<string, unknown>> = {
  go: boolean;
  ok: boolean;
  code: CharacterPackUiCode;
  reason: string;
  warnings: string[];
  roles: CharacterPackUiRole[];
  identityLockText: string;
  sceneLockText: string;
  orderedAssets: T[];
};

export function planMvCharacterPackUi<T = Record<string, unknown>>(input?: {
  visualAssets?: T[];
}): CharacterPackUiPlan<T>;

export function formatMvCharacterPackLabel(
  plan: CharacterPackUiPlan | null | undefined,
): string;
