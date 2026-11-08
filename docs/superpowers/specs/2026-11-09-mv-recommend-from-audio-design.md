# MV recommend from audio — design (2026-11-09)

## Problem
`recommendMvPromptTemplate` + CLI `mv-recommend` still require hand-typed BPM / energy / vocalDensity. Nightly process work after PR #19 (recommend) and PR #20 (lipsync-prep) left “ffprobe → recommend” as the remaining gap: operators (and nightly jobs) already have energy hops from `probeEnergyHops`, but cannot feed them into template recommendation without re-typing signals.

## Goal
Extract a conservative `MvRecommendSignals` object from existing energy hops (`{ t, rmsDb, midDb, bassDb }`) and wire CLI `mv-recommend --audio <file>` / `--hops-json <file>` so extraction + existing flag overrides + `recommendMvPromptTemplate` is one command. No new genre template. No RunningHub calls.

## Non-goals
- New MV genre / prompt templates
- Inventing `instruments` / `performers` / `hints` from spectrum
- A production-grade BPM tracker (omit rather than guess)
- Submitting RH tasks or spending coins
- Replacing `mv-lipsync-prep` vocal-segment selection

## API (`lib/mv-music-signals.mjs`)

### `extractMusicSignalsFromHops(hops, extras = {})` → `{ signals, derived, reasons }`
Pure function. Hop shape matches `EnergyHop` from `mv-lipsync-prep.mjs`. Import `isVocalActiveHop` (rmsFloor -35, midFloor -45, midMinusBassMin -3).

**derived**
- `vocalActiveRatio` = fraction of hops where `isVocalActiveHop(hop)` is true; `0` if no hops
- `meanRmsDb` = mean of finite `hop.rmsDb`; omit or `null` if no hops
- `bpm` / `bpmConfidence` (0..1) only when the conservative estimator emits a value
- `durationSec` is **not** invented here (optional ffprobe value is only set by `probeMusicSignals`)

**energy** from `meanRmsDb` (documented thresholds):
- `meanRmsDb < -28` → `low`
- `meanRmsDb < -18` → `medium`
- else → `high`

**vocalDensity** from `vocalActiveRatio`:
- `< 0.25` → `sparse`
- `< 0.50` → `medium`
- else → `dense`

**BPM** (optional, conservative): estimate from hop RMS autocorrelation and/or peak intervals. Accept typical 60–180 BPM. If variance is high, hops are too short (`< 24`) or RMS is too flat (std `< 1.5` dB), **omit** `bpm` rather than guessing. When emitted, set `derived.bpm` and `derived.bpmConfidence`.

**signals**: a `MvRecommendSignals` object with only defined keys (`bpm`, `vocalDensity`, `energy`, `instruments`, `performers`, `hints`). Extracted energy/density/bpm are filled first; `instruments` / `performers` / `hints` come only from `extras`. Merge extras on top so CLI overrides win: `{ ...extracted, ...definedExtras }`.

**reasons**: short Chinese strings describing what was inferred, e.g. `从能量 hops 推得 energy=high（平均 rms -12.3 dB）`.

**Empty hops**: do not crash; omit energy / vocalDensity / bpm; `derived.vocalActiveRatio = 0`; reasons mention `信号不足`.

### `probeMusicSignals(audioPath, extras?)`
Thin IO: `probeEnergyHops(audioPath)` then `extractMusicSignalsFromHops`. Optional ffprobe duration may go into `derived.durationSec` only — do not invent other metadata.

## CLI (`mv-recommend`)
Existing flags (`--bpm --vocal-density --energy --instruments --performers --hints --json`) stay.

New:
- `--audio <file>` and/or `--hops-json <file>` (`--hops-json` wins if both given)
- If audio/hops present: extract, apply flag overrides, then `recommendMvPromptTemplate`
- If neither present: keep today’s manual-signals-only behavior

Human-readable output: after the existing recommend summary, when extraction ran, also print inferred `energy`, `vocalDensity`, `bpm` (if any), `vocalActiveRatio`, `meanRmsDb`.

`--json` shape: `{ ...recommendResult, extraction }` so `templateId` / `confidence` / `reasons` / `alternatives` stay top-level. `extraction` is `{ signals, derived, reasons }` and is omitted when extraction did not run.

## Acceptance
- Loud vocal-active hops → `energy=high`, `vocalDensity=dense`
- Quiet bass-dominant instrumental hops → `energy=low`, `vocalDensity=sparse`
- Mid-level mixed hops → medium mappings
- Empty hops → no throw; energy/density/bpm omitted; reasons mention 信号不足
- extras override extracted energy/hints
- `recommendMvPromptTemplate(extract(...).signals)` always returns a registered `templateId`
- Regular-pulse BPM fixture → bpm in a documented range (100–140 for a 120 BPM pulse) or a clear omit; noisy/flat fixture omits bpm
- CLI `--hops-json` + `--json` exits 0 and includes `templateId` + `extraction.signals`
- `npm test` green; no secrets / media / RH spend
