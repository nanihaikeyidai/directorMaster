import type { EnergyHop } from "./mv-lipsync-prep.d.ts";
import type { LyricSegmentPlan, PlannedLyricSegment } from "./mv-lyric-segments.d.ts";

export const DEFAULT_MAX_SEGMENT_SEC: number;
export const DEFAULT_MIN_INSTRUMENTAL_SEC: number;

export type VocalCoverageRegion = {
  start: number;
  end: number;
  vocal: boolean;
};

export type PlannedVocalSegment = PlannedLyricSegment & {
  cutReason?: "instrumental-gap" | "vocal-pack" | "max-duration";
};

export type VocalCoveragePlan = Omit<LyricSegmentPlan, "segments"> & {
  segments: PlannedVocalSegment[];
};

export function regionsFromVocalMap(input?: {
  duration?: number;
  durationSec?: number;
  regions?: Array<{ start?: number; startSec?: number; end?: number; endSec?: number; vocal?: boolean; isVocal?: boolean }>;
} | VocalCoverageRegion[]): VocalCoverageRegion[];

export function regionsFromEnergyHops(
  hops?: EnergyHop[],
  opts?: { hopSec?: number; isVocal?: (hop: EnergyHop) => boolean; rmsFloor?: number; midFloor?: number; midMinusBassMin?: number },
): VocalCoverageRegion[];

export function planVocalCoverageSegments(input?: {
  regions?: VocalCoverageRegion[] | { regions?: VocalCoverageRegion[] };
  map?: { duration?: number; durationSec?: number; regions?: VocalCoverageRegion[] };
  durationSec?: number;
  duration?: number;
  maxSegmentSec?: number;
  minInstrumentalSec?: number;
}): VocalCoveragePlan;
