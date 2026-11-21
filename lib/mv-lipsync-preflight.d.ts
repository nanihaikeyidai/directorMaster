export const DEFAULT_LIPSYNC_MIN_COINS: number;
export const LIPSYNC_FAILURE_KINDS: readonly ['technical', 'selection', 'reference'];
export type LipsyncFailureKind = 'technical' | 'selection' | 'reference';
export interface RhAccount { remainCoins: number | null; remainMoney: number | null; apiType: string | null; remainPoint?: number }
export interface RhSpendable { amount: number; unit: 'points' | 'coins'; label: '积分' | '币' }
export interface RhJobCost { costCoins: number | undefined; source: 'chargedPoint' | 'consumeCoins' | null; settleMode?: string }
export interface LipsyncLedgerEntry { date: string; status: 'success' | 'failed'; failureKind?: LipsyncFailureKind; taskId?: string; workflowId?: string; coins?: number; note?: string }
export interface PreflightCheck { ok: boolean; code: string | null; reason: string; [k: string]: unknown }
export function normalizeRhAccount(raw: unknown): RhAccount | null;
export function rhSpendable(account?: unknown): RhSpendable | null;
export function pickRhJobCost(source?: unknown): RhJobCost;
export function checkLipsyncBudget(input?: { account?: unknown; minCoins?: number; workflowId?: string; observations?: unknown[]; useSeed?: boolean; costMargin?: number; durationSec?: number }): PreflightCheck & { minCoins: number; account?: RhAccount };
export function checkLipsyncDailyQuota(input?: { ledger?: LipsyncLedgerEntry[]; date?: string; maxSuccess?: number; maxTechRetries?: number }): PreflightCheck & { attemptKind?: 'first' | 'retry' };
export function recordLipsyncAttempt(ledger: LipsyncLedgerEntry[] | undefined, entry: LipsyncLedgerEntry): LipsyncLedgerEntry[];
export function planLipsyncPreflight(input?: { trialPlan?: { ok: boolean; reason?: string; workflowId?: string }; account?: unknown; ledger?: LipsyncLedgerEntry[]; date?: string; minCoins?: number; maxSuccess?: number; maxTechRetries?: number; workflowId?: string; observations?: unknown[]; useSeed?: boolean; costMargin?: number; durationSec?: number }): { go: boolean; mode: 'go' | 'skip'; codes: string[]; workflowId?: string; checks: { trial: PreflightCheck; budget: PreflightCheck; quota: PreflightCheck }; reason: string };
