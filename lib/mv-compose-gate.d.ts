import type { AlignmentReport } from './mv-av-alignment.d.ts';
import type { ComposeReport, ComposeSegmentInput } from './mv-compose-validate.d.ts';

export const COMPOSE_GATE_TOLERANCE_SEC: number;

export type ComposeGatePurpose = 'preview' | 'export';
export type ComposeGateAudioMode = 'source' | 'video' | 'both';

export type ComposeGateInput = {
  videos?: Array<string | null | undefined>;
  segments?: Array<Record<string, unknown>>;
  cuts?: number[];
  trimStart?: number;
  trimEnd?: number;
  sourceAudioPath?: string;
  audioPath?: string;
  sourceAudioDuration?: number;
  muxAudioDuration?: number;
  audioMode?: string;
  purpose?: string;
  audioSource?: 'original' | 'generated' | 'unknown';
  durationToleranceSec?: number;
  leadSilenceSec?: number;
  measuredLeadSilenceSec?: number;
  requireVideo?: boolean;
};

export type ComposeGatePlan = {
  ok: boolean;
  purpose: ComposeGatePurpose;
  audioMode: ComposeGateAudioMode;
  requireOriginalAudio: boolean;
  reason: string;
  compose: ComposeReport;
  alignment: AlignmentReport | null;
  segments: ComposeSegmentInput[];
};

export function normalizeComposeAudioMode(value?: unknown): ComposeGateAudioMode;
export function normalizeComposePurpose(input?: { purpose?: unknown; audioMode?: unknown }): ComposeGatePurpose;
export function buildComposeSegments(input?: ComposeGateInput): ComposeSegmentInput[];
export function planMvComposeGate(input?: ComposeGateInput): ComposeGatePlan;
