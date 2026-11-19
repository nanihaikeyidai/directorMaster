import type { MvGeneratePreflight } from './mv-generate-preflight.d.ts';

export function mapUiAccount(account?: { coins?: number; walletBalance?: string } | null): { remainCoins: unknown; remainMoney: unknown } | null;

export function buildMvGenerateUiManifest(opts?: {
  segments?: Array<{ index?: number; duration?: number } | null | undefined>;
  prompts?: string[];
  visualAssets?: Array<{ path?: string; id?: string; mediaType?: string } | null | undefined>;
  indexes?: number[];
}): {
  segments: Array<{ index: number; duration?: number; prompt?: string; path: string }>;
  visualAssets: Array<Record<string, unknown> & { path: string }>;
};

export function planMvGenerateUiPreflight(opts?: {
  segments?: unknown[];
  prompts?: string[];
  visualAssets?: unknown[];
  account?: { coins?: number; walletBalance?: string } | null;
  indexes?: number[];
  coinsPerSec?: number;
  reserveCoins?: number;
  maxSegmentSec?: number;
}): MvGeneratePreflight;

export function formatMvGenerateEstimateLabel(plan?: MvGeneratePreflight | null, opts?: { loading?: boolean }): string;
