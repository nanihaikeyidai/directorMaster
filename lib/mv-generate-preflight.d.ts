export const DEFAULT_MV_COINS_PER_SEC: number;
export const MV_MAX_SEGMENT_SEC: number;
export interface MvSegmentCost { id: string; duration: number; assumed: boolean; coins: number }
export interface MvCoinEstimate { coinsPerSec: number; perSegment: MvSegmentCost[]; total: number }
export interface MvGenerateIssue { code: string; segment?: string; reason: string }
export function estimateMvGenerateCoins(segments: unknown[], opts?: { coinsPerSec?: number; maxSegmentSec?: number }): MvCoinEstimate;
export function validateMvGenerateInputs(manifest: unknown, opts?: { exists?: (p: string) => boolean; maxSegmentSec?: number }): { ok: boolean; issues: MvGenerateIssue[] };
export interface MvGeneratePreflight {
  go: boolean;
  codes: string[];
  inputs: { ok: boolean; issues: MvGenerateIssue[] };
  estimate: MvCoinEstimate;
  budget: null | { ok: boolean; code: string | null; need: number; reason: string; account?: { remainCoins: number | null; remainMoney: number | null; apiType: string | null; remainPoint?: number } };
  reason: string;
}
export function planMvGeneratePreflight(opts?: {
  manifest?: unknown; account?: unknown; exists?: (p: string) => boolean; coinsPerSec?: number;
  reserveCoins?: number; requireAccount?: boolean; maxSegmentSec?: number;
}): MvGeneratePreflight;
