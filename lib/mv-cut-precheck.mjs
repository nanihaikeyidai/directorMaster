/**
 * Browser-safe cut precheck for the MV page: wraps planMvCutGate and, when
 * snapping, re-validates segment lengths so a snap never creates a >15 s or
 * too-short segment. No node: imports.
 */

import { planMvCutGate } from './mv-cut-gate.mjs';

export const PRECHECK_MAX_SEGMENT_SEC = 15;
export const PRECHECK_MIN_SEGMENT_SEC = 1;

function fin(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {{
 *   cuts?: number[], hops?: unknown, lyrics?: unknown, durationSec?: number,
 *   rangeStart?: number, rangeEnd?: number, autoSnap?: boolean,
 *   maxSegmentSec?: number, minSegmentSec?: number, toleranceSec?: number,
 * }} [input]
 */
export function planMvCutPrecheck(input = {}) {
  const durationSec = fin(input.durationSec) ? input.durationSec : undefined;
  const rangeStart = fin(input.rangeStart) ? input.rangeStart : 0;
  const rangeEnd = fin(input.rangeEnd) && input.rangeEnd > rangeStart ? input.rangeEnd : durationSec;
  const maxSeg = fin(input.maxSegmentSec) ? input.maxSegmentSec : PRECHECK_MAX_SEGMENT_SEC;
  const minSeg = fin(input.minSegmentSec) ? input.minSegmentSec : PRECHECK_MIN_SEGMENT_SEC;
  const cuts = Array.isArray(input.cuts) ? input.cuts.filter(fin) : [];

  const gate = planMvCutGate({
    cuts,
    hops: input.hops,
    lyrics: input.lyrics,
    durationSec,
    toleranceSec: input.toleranceSec,
    snap: input.autoSnap === true,
  });

  if (!gate.ok) {
    return { ok: false, mode: 'block', reason: `切点预检未通过：${gate.reason}`, cuts, gate };
  }
  if (gate.mode !== 'snap') {
    return { ok: true, mode: gate.mode, reason: gate.reason, cuts, gate };
  }

  const applied = gate.appliedCuts.filter((t) => t > rangeStart && (!fin(rangeEnd) || t < rangeEnd));
  if (fin(rangeEnd)) {
    const edges = [rangeStart, ...applied, rangeEnd];
    for (let i = 1; i < edges.length; i++) {
      const len = edges[i] - edges[i - 1];
      if (len > maxSeg + 1e-3 || len < minSeg - 1e-3) {
        return {
          ok: false,
          mode: 'block',
          reason: `切点预检未通过：吸附到句界后第 ${i} 段时长 ${len.toFixed(2)}s，不在 ${minSeg}–${maxSeg} 秒范围内，请手动调整切点。`,
          cuts,
          gate,
        };
      }
    }
  }
  return { ok: true, mode: 'snap', reason: gate.reason, cuts: applied, gate };
}
