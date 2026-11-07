# MV lipsync trial prep — design (2026-11-08)

## Problem
Nightly 15s lipsync trials burned RH coins on **instrumental / non-vocal** slices and **mid/wide person refs** where mouths stay closed or faces are too small to judge lipsync (2026-11-06/07 Camilla trials).

## Goal
A pure, testable prep gate that **selects or rejects** a lipsync trial plan **before** any RunningHub submit:
1. Audio window must show sustained **vocal-band activity** (not bass-dominant instrumental).
2. Person reference must score as **face close-up / bust**, not scene-wide.

## Non-goals
- Full Demucs / ML singing-voice separation
- Submitting RH tasks (callers do that after `ok: true`)
- New genre prompt templates

## API (`lib/mv-lipsync-prep.mjs`)

### Types
- `EnergyHop`: `{ t: number, rmsDb: number, midDb: number, bassDb: number }`
- `VocalSegmentResult`: `{ ok: boolean, startSec?: number, endSec?: number, durationSec?: number, vocalActiveRatio?: number, confidence?: number, reason: string }`
- `FaceCloseUpAssessment`: `{ ok: boolean, score: number, reason: string, signals: Record<string, unknown> }`
- `LipsyncTrialPlan`: `{ ok: boolean, audio?: VocalSegmentResult, person?: FaceCloseUpAssessment, workflowId?: string, reason: string }`

### Pure functions
1. `isVocalActiveHop(hop, opts?)` — hop is vocal-active when `rmsDb > rmsFloor` (default -35), `midDb > midFloor` (default -45), and `(midDb - bassDb) >= midMinusBassMin` (default -3).
2. `selectVocalSegment(hops, { targetDurationSec=15, minDurationSec=10, minVocalActiveRatio=0.35, hopSec=0.25 })` — slide windows; pick max `vocalActiveRatio`; `ok` only if ratio ≥ min and duration ≥ minDurationSec (prefer targetDurationSec when possible). Else `ok:false` with Chinese reason (无人声/器乐主导).
3. `assessFaceCloseUpRef({ path?, width, height, centerSkinFraction?, faceHeightRatio? })` — `ok` if any of: `faceHeightRatio >= 0.25`; path matches `/(ref-crop|still-b|close-?up|face-?front|bust|胸像|近脸)/i`; portrait (`height >= width`) with `centerSkinFraction >= 0.18` and path not matching `/(scene|场景|wide|远景|establishing)/i`. Score 0–1. Reject landscape scene-like refs.
4. `buildLipsyncTrialPlan({ hops, person, targetDurationSec, workflowId })` — runs select + assess; `ok` only if both pass; otherwise refuse with combined reason.

### IO helpers (thin)
- `probeEnergyHops(audioPath, { hopSec=0.25 })` — ffmpeg decode → hops (optional for CLI; pure core stays injectable).
- CLI `mv-lipsync-prep --audio <file> --person <image> [--duration 15] [--json]` prints plan; exit 0 only when `ok`.

## Acceptance
- Instrumental-dominant hop series → `selectVocalSegment.ok === false`
- Vocal-active series (≥35% hops) → selects a window with ratio ≥ 0.35
- `B.jpg` mid portrait with skin may pass; path `scene-wide.jpg` / low skin landscape fails; `ref-crop.jpg` passes via path hint
- `buildLipsyncTrialPlan` refuses when either gate fails
- `npm test` includes new script; no secrets / media committed
