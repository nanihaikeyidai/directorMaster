export type AlignmentSegmentInput = {
  index: number;
  expectedDuration: number;
  audioDuration?: number;
  videoDuration?: number;
};

export type AlignmentOptions = {
  durationToleranceSec?: number;
  leadSilenceSec?: number;
  measuredLeadSilenceSec?: number;
  requireAudio?: boolean;
  requireVideo?: boolean;
};

export type AlignmentIssue = {
  code:
    | 'AUDIO_DURATION_MISMATCH'
    | 'VIDEO_DURATION_MISMATCH'
    | 'AV_MISMATCH'
    | 'LEAD_SILENCE_MISMATCH'
    | 'TAIL_TRUNCATION'
    | 'MISSING_AUDIO'
    | 'MISSING_VIDEO'
    | 'INVALID_DURATION';
  severity: 'error' | 'warning';
  segmentIndex: number | null;
  message: string;
  suggestion: string;
  expected?: number;
  actual?: number;
  delta?: number;
};

export type AlignmentReport = {
  ok: boolean;
  toleranceSec: number;
  issues: AlignmentIssue[];
  summary: string;
};

export function checkAvAlignment(
  segments: AlignmentSegmentInput[],
  options?: AlignmentOptions,
): AlignmentReport;

export function formatAlignmentReport(report: AlignmentReport): string;
