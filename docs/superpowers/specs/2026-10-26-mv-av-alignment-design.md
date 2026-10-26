# Design: MV 音画对齐检查（P0-4）

Date: 2026-10-26  
Module: MV / Sprint 1 remaining  
Status: Approved for nightly automation (user locked MV-first; backlog P0-4)

## Problem

Export / merge can proceed when per-segment audio duration, video duration, lead silence, or tail length disagree with the cut plan. Operators need a pre-export report with actionable fixes, not silent drift.

## Goals

- Pure, testable check: no FFmpeg required inside the checker (callers supply measured durations).
- Default duration tolerance **80 ms** (matches `docs/MV_AUDIO_TIMELINE_UX.md`).
- Cover: audio vs expected, video vs expected, A/V mismatch, first-segment lead silence, tail truncation.
- Chinese `message` + `suggestion` on every issue; `ok === false` iff any `severity: 'error'`.

## Non-goals (tonight)

- Running ffprobe inside the lib (callers / CLI may probe later).
- Blocking UI merge button hard-gate (optional soft report only if trivial).
- Full compose validation P0-5 (order / holes / duplicates) — defer; only per-segment + lead silence + tail.

## API

```ts
type AlignmentSegmentInput = {
  index: number;              // 1-based SEG number preferred; 0-based also accepted if documented
  expectedDuration: number;   // seconds from cuts
  audioDuration?: number;     // probed exported wav; omit → warning MISSING_AUDIO when checking export
  videoDuration?: number;     // probed generated video; omit → warning MISSING_VIDEO when checking merge
};

type AlignmentOptions = {
  durationToleranceSec?: number;     // default 0.08
  leadSilenceSec?: number;           // expected vocalStartOnTrack / prepend silence for SEG 01
  measuredLeadSilenceSec?: number;   // measured silence at start of SEG 01 audio
  requireAudio?: boolean;            // default true for export-mode helper
  requireVideo?: boolean;            // default false; true for merge-mode helper
};

type AlignmentIssue = {
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

type AlignmentReport = {
  ok: boolean;
  toleranceSec: number;
  issues: AlignmentIssue[];
  summary: string;
};

checkAvAlignment(segments: AlignmentSegmentInput[], options?: AlignmentOptions): AlignmentReport
formatAlignmentReport(report: AlignmentReport): string
```

## Severity rules

| Code | When | Severity |
| --- | --- | --- |
| INVALID_DURATION | expected/audio/video ≤ 0 or non-finite | error |
| AUDIO_DURATION_MISMATCH | \|audio − expected\| > tol | error |
| VIDEO_DURATION_MISMATCH | \|video − expected\| > tol | error |
| AV_MISMATCH | both present and \|video − audio\| > tol | error |
| TAIL_TRUNCATION | video present and (expected − video) > tol (video short) | error (subset of video mismatch; prefer specific code when video < expected − tol and audio ≈ expected) |
| LEAD_SILENCE_MISMATCH | both lead values given and \|Δ\| > tol | error |
| MISSING_AUDIO | requireAudio and audioDuration omitted | warning |
| MISSING_VIDEO | requireVideo and videoDuration omitted | warning |

`TAIL_TRUNCATION`: when `videoDuration` is finite and `expectedDuration - videoDuration > tol` (and audio is within tol of expected, or audio omitted). If video is long instead, use `VIDEO_DURATION_MISMATCH`.

## CLI

`mv-align-check --manifest <segments.json> [--tolerance 0.08] [--require-video]`

Manifest segment fields accepted: `index`, `duration` or `expectedDuration`, `exportedDuration` or `audioDuration`, `videoDuration`, optional top-level `leadSilenceSec` / `measuredLeadSilenceSec`.

Print JSON report to stdout; exit `1` if `!ok`.

## Testing

`scripts/test-mv-av-alignment.mjs` covered by `npm test`.

## Acceptance

1. Aligned fixture → `ok: true`, empty issues.
2. Audio 0.2s short → error AUDIO_DURATION_MISMATCH + re-export suggestion.
3. Video short vs expected with good audio → TAIL_TRUNCATION.
4. Lead silence off by >80ms → LEAD_SILENCE_MISMATCH.
5. CLI dry-run on fixture exits 0 / 1 correctly; no network, no secrets.
