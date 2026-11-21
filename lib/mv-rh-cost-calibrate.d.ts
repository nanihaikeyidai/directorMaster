export const DEFAULT_RH_COST_MARGIN: number;
export interface RhCostObservation {
  workflowId: string;
  durationSec: number;
  cost: number;
  source: string;
  settleMode?: string;
  unit: 'points' | 'coins';
  taskId?: string;
  date?: string;
  workflowName?: string;
  note?: string;
}
export const SEED_RH_COST_OBSERVATIONS: readonly RhCostObservation[];
export function appendCostObservation(observations: RhCostObservation[] | undefined, entry: RhCostObservation): RhCostObservation[];
export function observationFromSettledJob(job?: {
  workflowId?: string;
  durationSec?: number;
  chargedPoint?: unknown;
  consumeCoins?: unknown;
  settleMode?: string;
  taskId?: string;
  date?: string;
  workflowName?: string;
  note?: string;
}): RhCostObservation | null;
export interface MvCostPerSec {
  coinsPerSec: number;
  source: 'calibrated' | 'default';
  observationCount: number;
  maxObservedPerSec: number | null;
  margin: number;
  workflowId?: string;
  unit?: 'points' | 'coins' | string;
}
export function resolveMvCostPerSec(opts?: {
  unit?: string;
  workflowId?: string;
  observations?: RhCostObservation[];
  margin?: number;
  useSeed?: boolean;
}): MvCostPerSec;
export interface LipsyncMinCost extends MvCostPerSec {
  minCoins: number;
  durationSec: number;
}
export function resolveLipsyncMinCost(opts?: {
  unit?: string;
  workflowId?: string;
  observations?: RhCostObservation[];
  margin?: number;
  durationSec?: number;
  useSeed?: boolean;
}): LipsyncMinCost;
