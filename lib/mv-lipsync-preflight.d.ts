export const DEFAULT_LIPSYNC_MIN_COINS: number;
export const LIPSYNC_FAILURE_KINDS: readonly ['technical', 'selection', 'reference'];
export type LipsyncFailureKind = 'technical' | 'selection' | 'reference';
export interface RhAccount { remainCoins: number | null; remainMoney: number | null; apiType: string | null }
export interface LipsyncLedgerEntry { date: string; status: 'success' | 'failed'; failureKind?: LipsyncFailureKind; taskId?: string; workflowId?: string; coins?: number; note?: string }
export interface PreflightCheck { ok: boolean; code: string | null; reason: string; [k: string]: unknown }
export function normalizeRhAccount(raw: unknown): RhAccount | null;
export function checkLipsyncBudget(input?: { account?: unknown; minCoins?: number }): PreflightCheck & { minCoins: number; account?: RhAccount };
export function checkLipsyncDailyQuota(input?: { ledger?: LipsyncLedgerEntry[]; date?: string; maxSuccess?: number; maxTechRetries?: number }): PreflightCheck & { attemptKind?: 'first' | 'retry' };
export function recordLipsyncAttempt(ledger: LipsyncLedgerEntry[] | undefined, entry: LipsyncLedgerEntry): LipsyncLedgerEntry[];
export function planLipsyncPreflight(input?: { trialPlan?: { ok: boolean; reason?: string; workflowId?: string }; account?: unknown; ledger?: LipsyncLedgerEntry[]; date?: string; minCoins?: number; maxSuccess?: number; maxTechRetries?: number }): { go: boolean; mode: 'go' | 'skip'; codes: string[]; workflowId?: string; checks: { trial: PreflightCheck; budget: PreflightCheck; quota: PreflightCheck }; reason: string };
