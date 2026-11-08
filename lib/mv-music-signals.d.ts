import type { EnergyHop } from "./mv-lipsync-prep.d.ts";
import type { MvRecommendSignals } from "./mv-prompt.d.ts";

export type MusicSignalDerived = {
  vocalActiveRatio: number;
  meanRmsDb?: number | null;
  bpm?: number;
  bpmConfidence?: number;
  durationSec?: number;
};

export type MusicSignalExtraction = {
  signals: MvRecommendSignals;
  derived: MusicSignalDerived;
  reasons: string[];
};

export function extractMusicSignalsFromHops(
  hops: EnergyHop[] | null | undefined,
  extras?: MvRecommendSignals,
): MusicSignalExtraction;

export function probeMusicSignals(
  audioPath: string,
  extras?: MvRecommendSignals,
): MusicSignalExtraction;
