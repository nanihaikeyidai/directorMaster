export type ComposeSegmentInput = {
  index: number;
  startSec?: number;
  endSec?: number;
  start?: number;
  end?: number;
  expectedDuration?: number;
  duration?: number;
  videoDuration?: number;
  videoPath?: string;
};

export type ComposeOptions = {
  durationToleranceSec?: number;
  sourceAudioDuration?: number;
  sourceAudioPath?: string;
  audioSource?: 'original' | 'generated' | 'unknown';
  requireOriginalAudio?: boolean;
  requireVideo?: boolean;
};

export type ComposeInputObject = ComposeOptions & {
  segments?: ComposeSegmentInput[];
  muxedAudioSource?: ComposeOptions['audioSource'];
};

export type ComposeIssue = {
  code:
    | 'NO_SEGMENTS'
    | 'INVALID_DURATION'
    | 'SEGMENT_ORDER'
    | 'MISSING_SEGMENT'
    | 'DUPLICATE_SEGMENT'
    | 'DUPLICATE_VIDEO'
    | 'TIMELINE_GAP'
    | 'TIMELINE_OVERLAP'
    | 'TOTAL_DURATION_MISMATCH'
    | 'MISSING_SOURCE_AUDIO'
    | 'GENERATED_AUDIO_MASTER'
    | 'UNKNOWN_AUDIO_MASTER'
    | 'MISSING_VIDEO';
  severity: 'error' | 'warning';
  segmentIndex: number | null;
  message: string;
  suggestion: string;
  expected?: number;
  actual?: number;
  delta?: number;
};

export type ComposeReport = {
  ok: boolean;
  toleranceSec: number;
  issues: ComposeIssue[];
  summary: string;
  expectedTotalDuration?: number;
  actualTotalDuration?: number;
};

export function checkMvCompose(
  input: ComposeSegmentInput[] | ComposeInputObject | unknown,
  options?: ComposeOptions,
): ComposeReport;

export function formatComposeReport(report: ComposeReport): string;
