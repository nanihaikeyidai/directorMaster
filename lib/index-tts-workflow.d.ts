export type IndexTtsEmotionMode = "speaker" | "text" | "vector" | "audio";
export type IndexTtsRequest = {
  text: string;
  language?: "ZH" | "EN" | "JA" | "ES" | "AR";
  durationFactor?: number;
  emotionMode?: IndexTtsEmotionMode;
  emotionText?: string;
  emotionVector?: Partial<Record<string, number>>;
  emotionStrength?: number;
  seed?: number;
  qualityRetryCount?: number;
  outputPrefix?: string;
  speakerFile?: string;
  emotionFile?: string;
};
export function normalizeIndexTtsRequest(input?: IndexTtsRequest): Required<Omit<IndexTtsRequest, "speakerFile" | "emotionFile">>;
export function buildIndexTtsWorkflow(input?: IndexTtsRequest): Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export const INDEX_TTS_EMOTIONS: string[];
