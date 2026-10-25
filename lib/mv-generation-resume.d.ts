export type GenerationLike = {
  provider: string;
  status: string;
  message?: string;
  jobId?: string;
  outputPath?: string;
};

export type QueueLike = {
  id: string;
  provider: string;
  indexes: number[];
  status: string;
  message?: string;
  createdAt?: number;
  prepared?: unknown;
};

export function indexesNeedingResumePoll(
  generation: Record<number | string, GenerationLike>,
): { index: number; jobId: string }[];

export function normalizePersistedQueue(
  queue: QueueLike[] | null | undefined,
): QueueLike[];

export function serializeActiveGeneration(
  generation: Record<number | string, GenerationLike>,
): Array<Record<string, unknown>>;

export function restoreActiveGeneration(
  saved: Array<Record<string, unknown>> | null | undefined,
): Record<number, GenerationLike>;
