export type RedubTrackKind = "dialogue" | "vocal" | "bed" | "sfx";

export interface RedubTimelineClip {
  id: string;
  source: string;
  trackId: string;
  start: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  mute: boolean;
  audioPath: string;
  sourceDuration?: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface RedubTimelineTrack {
  id: string;
  name: string;
  kind: RedubTrackKind;
  volume: number;
  muted: boolean;
  solo: boolean;
  pan: number;
  clips: RedubTimelineClip[];
}

export interface RedubTimeline {
  version: number;
  name: string;
  duration: number;
  tracks: RedubTimelineTrack[];
}

export interface RedubTimelineValidationError {
  code: string;
  message: string;
  location: string;
  trackId?: string;
  clipId?: string;
  previousClipId?: string;
}

export interface RedubTimelineValidationOptions {
  requireAudioPath?: boolean;
}

export interface RedubTimelineMigrationOptions {
  duration?: number;
  name?: string;
  preserveOriginalSlots?: boolean;
  instrumentalPath?: string;
  instrumentalDuration?: number;
  includeInstrumental?: boolean;
  separation?: string;
}

export function normalizeTimeline(value: unknown): RedubTimeline;

export function validateTimeline(
  value: unknown,
  options?: RedubTimelineValidationOptions,
): RedubTimelineValidationError[];

export function migrateScriptToTimeline(
  scriptValue: unknown,
  manifestValue: unknown,
  options?: RedubTimelineMigrationOptions,
): RedubTimeline;

export function getAudibleTracks(value: unknown): RedubTimelineTrack[];
