export const DEFAULT_SUBTITLE_ASR_WORKFLOW_ID: '2104649076645130241';
export const DEFAULT_SUBTITLE_ASR_API_BASE: 'https://www.runninghub.cn';

export type SubtitleAsrConfig = {
  workflowId: string;
  apiBase: string;
  outDir: string;
  jobId?: string;
};

export type SubtitleAsrSubmitBody = {
  workflowId: string;
  instanceType: 'plus';
  nodeInfoList: Array<Record<string, unknown>>;
  workflow: string;
  fileName: string;
};

export type SubtitleAsrPipelineInput = {
  videoPath: string;
  outDir: string;
  langs?: string[];
  basename?: string;
  workflowId?: string;
  durationMs?: number;
  dryRun?: boolean;
  jobId?: string;
  apiBase?: string;
  maxPolls?: number;
  pollIntervalMs?: number;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

export type SubtitleAsrDeps = {
  getApiKey: () => Promise<string> | string;
  uploadFile: (videoPath: string) => Promise<{ fileName: string } | string>;
  createTask: (body: SubtitleAsrSubmitBody | Record<string, unknown>) => Promise<{ taskId: string } | string>;
  getStatus: (taskId: string) => Promise<unknown>;
  getOutputs: (taskId: string) => Promise<unknown>;
  readFile?: (filePath: string) => Promise<Buffer | Uint8Array | string> | Buffer | Uint8Array | string;
  sleep?: (ms: number) => Promise<void>;
};

export type SubtitleAsrPipelineResult = {
  status: 'planned' | 'written';
  cueCount: number;
  needsReview: boolean;
  files: Record<string, string | number | undefined>;
  jobId: string;
  workflowId?: string;
  taskId?: string;
  source?: string;
};

export function hasSubtitleAsrKey(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean;

export function resolveSubtitleAsrConfig(options?: {
  outDir?: string;
  workflowId?: string;
  apiBase?: string;
  jobId?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): SubtitleAsrConfig;

export function buildSubtitleAsrSubmitBody(input: {
  workflowId: string;
  fileName: string;
  nodeInfoList?: Array<Record<string, unknown>>;
}): SubtitleAsrSubmitBody;

export function extractAsrRawFromCloudOutputs(outputs: unknown): unknown;

export function runSubtitleAsrPipeline(
  input: SubtitleAsrPipelineInput,
  deps: SubtitleAsrDeps,
): Promise<SubtitleAsrPipelineResult>;

export function createSubtitleAsrRhDeps(options?: {
  apiBase?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): SubtitleAsrDeps;
