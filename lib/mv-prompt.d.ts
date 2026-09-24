export type BandMvAsset = {
  mediaType?: "image" | "audio" | "video";
  category?: "人物" | "场景";
  description?: string;
};

export type BandMvSegment = {
  index: number;
  start?: number;
  end?: number;
  duration: number;
};

export type BandMvNote = {
  kind?: "vocal" | "instrumental";
  lyrics?: string;
  direction?: string;
};

export type BandMvSettings = Partial<Record<"members" | "style" | "stage" | "wardrobe" | "performance" | "continuity" | "cameraStability" | "vocalStartSec", string>>;

export type BandMvVocalTiming = {
  mode: "instrumental" | "pre_vocal" | "vocal_enters" | "vocal_active";
  vocalStartOnTrack: number;
  relativeStart: number | null;
};

export function getSegmentVocalTiming(
  segment: BandMvSegment,
  note?: BandMvNote,
  settings?: BandMvSettings,
  leadSilenceSec?: number,
): BandMvVocalTiming;

export function buildStandardBandMvPrompt(input: {
  projectName: string;
  segment: BandMvSegment;
  note?: BandMvNote;
  assets: BandMvAsset[];
  settings?: BandMvSettings;
  leadSilenceSec?: number;
}): string;

export const BAND_MV_PROMPT_TEMPLATE_VERSION: "band-live-ref2va-v5-stable-camera";
