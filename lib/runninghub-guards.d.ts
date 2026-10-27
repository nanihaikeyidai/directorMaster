export declare const SINGLE_SEGMENT_KINDS: Set<string>;
export declare function assertSegmentCountForKind(kind: string, count: number): void;
export declare function resolveDirectorRoot(env?: Record<string, string | undefined>, cwd?: string): string;
export type RunningHubKeySource =
  | { type: 'env'; name: 'RUNNINGHUB_API_KEY' }
  | { type: 'dpapi'; file: string }
  | { type: 'missing'; message: string };
export declare function resolveRunningHubKeySource(env?: Record<string, string | undefined>, platform?: string): RunningHubKeySource;
export declare function redactSecret(text: unknown, secret?: string): string;
export interface CloudJobSummary { id?: string; status?: string; stage?: string; workflowKind?: string; taskId?: string; segmentCount?: number; elapsedSec: number | null; error?: string; terminal: boolean }
export declare function summarizeCloudJob(job?: Record<string, any>, opts?: { secret?: string }): CloudJobSummary;
export declare function isSingleSegmentKind(kind: string | null | undefined): boolean;
export type InferredWorkflowKind = 'feihou-remix' | 'mv-reference' | 'director';
export declare function inferWorkflowKindFromNodes(workflow: unknown): InferredWorkflowKind | null;
export declare function annotateWorkflowListing<T extends Record<string, any>>(entry: T, workflow: unknown): T & { kind: InferredWorkflowKind | null; singleSegment: boolean; kindError?: string };
export declare function attachJobSummary<T extends Record<string, any>>(job: T, opts?: { secret?: string }): T & { summary: CloudJobSummary };
