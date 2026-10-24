export type SubtitleCue = {
  startMs: number;
  endMs: number;
  text: string;
  translation?: string;
};

export function formatSrtTimestamp(ms: number): string;

export function normalizeCues(input: unknown): SubtitleCue[];

export function cuesToSrt(
  cues: SubtitleCue[],
  options?: { field?: 'text' | 'translation' },
): string;

export function cuesToAssBilingual(
  cues: SubtitleCue[],
  options?: { sourceLang?: string; targetLang?: string },
): string;

export function writeBilingualSubtitles(
  outDir: string,
  cuesInput: unknown,
  options?: {
    sourceLang?: string;
    targetLang?: string;
    basename?: string;
    translations?: (string | undefined)[];
  },
): { srtSource: string; srtTarget: string; ass: string; cueCount: number };

export function detectSubtitleWorkflowKind(workflow: unknown): 'asr-r2t2' | null;
