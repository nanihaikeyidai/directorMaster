import type { EnergyHop } from './mv-lipsync-prep.d.ts';

export const ENERGY_HOP_SAMPLE_RATE: number;
export const DEFAULT_ENERGY_HOP_SEC: number;

export function isVocalActiveHop(
  hop: EnergyHop,
  opts?: { rmsFloor?: number; midFloor?: number; midMinusBassMin?: number },
): boolean;

export function computeEnergyHops(
  samples: ArrayLike<number> | null | undefined,
  opts?: { sampleRate?: number; hopSec?: number; scale?: number },
): EnergyHop[];

export function mixToMono(buffer: {
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}): Float32Array;
