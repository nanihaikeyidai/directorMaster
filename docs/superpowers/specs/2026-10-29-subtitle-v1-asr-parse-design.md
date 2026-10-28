# Subtitle V1 Night-1 — RH ASR Output → Cues + Patch + CLI `--asr`

**Date:** 2026-10-29 (Asia/Shanghai nightly)  
**Status:** Approved by standing nightly routine (interactive brainstorming skipped; user away)  
**Module:** 视频后期配字幕（Sprint 3）  
**Parent plan:** `docs/SUBTITLE_BILINGUAL_PLAN.md`

## Problem

V0 ships offline `normalizeCues` + bilingual SRT/ASS, but real RunningHub / Confucius4-R2T2 outputs arrive in several JSON shapes (segments in seconds, sentences in ms, nested `result`, untimed text). Operators also need to edit cues before re-export without re-running ASR. Live RH submit is blocked tonight (no paid calls).

## Goals (tonight)

1. `parseRhAsrOutput(raw, options?)` maps common RH/Confucius-like ASR payloads into cue-shaped objects that `normalizeCues` accepts (via returned `.cues`).
2. `applyCuePatches(cues, patches)` immutably patches by index (text / translation / startMs / endMs); rejects OOB index and inverted/invalid times.
3. CLI: `subtitle --asr <rh-asr.json> --out <dir> [--langs zh,en] [--duration-ms N] [--basename subtitles]` — offline only; same bilingual exports as `--cues`.
4. `--video` without `--cues`/`--asr`: no key → clear error exit 1 (V0). Key present but live path not wired → clear error directing to `--asr`; **never** call RH.
5. Tests + fixtures; docs; no secrets; no UI page required.

## Non-goals (tonight)

- Live RunningHub submit / poll / archive / upload
- Burn-in ffmpeg
- Full UI cue editor page
- External translation APIs
- Speaker diarization

## Approaches considered

| Approach | Pros | Cons |
|---|---|---|
| A. Extend `normalizeCues` to accept all RH shapes | One entrypoint | Couples exporters to RH quirks; weak-split metadata awkward |
| **B. New `lib/subtitle-asr.mjs` parser + patch, feed `.cues` into `normalizeCues`** | Clear boundary; V0 stays stable; easy fixtures | Extra module |
| C. Only CLI ad-hoc mapping | Fast | Untestable surface; duplicates in adapters later |

**Recommendation: B** — keep V0 cue model as the contract; ASR adapter owns RH shape variance and weak-split review flags.

## Design

### `parseRhAsrOutput(raw, options?)`

Returns:

```ts
type ParseRhAsrResult = {
  cues: Array<{ startMs: number; endMs: number; text: string; translation?: string }>;
  needsReview?: boolean;
  source?: 'segments' | 'sentences' | 'result' | 'array' | 'plain-passthrough' | 'weak-split';
};
```

`options`: `{ durationMs?: number }` — **required** for untimed / `{ text }` weak-split.

**Shape detection (first match wins):**

1. If `raw` is string: try JSON parse; else treat as untimed text (needs `durationMs`).
2. Array → map each element through timed-object / plain-line helpers → `source: 'array'` (or `'plain-passthrough'` if all strings that `normalizeCues` already understands).
3. Object with `result.segments` or `result.sentences` → unwrap, recurse shape → `source: 'result'`.
4. Object with `segments: [{ start, end, text }]` (seconds; also accept startMs/endMs) → `source: 'segments'`.
5. Object with `sentences: [{ begin_time|start_ms|startMs, end_time|end_ms|endMs, text }]` → ms fields → `source: 'sentences'`.
6. Object with `cues` already → pass through items → `source: 'plain-passthrough'`.
7. Object / string with only untimed text (`text` field or whole string), split on Chinese/English sentence punctuation (`。！？!?；;\n`) → equal-split over `durationMs` → `{ cues, needsReview: true, source: 'weak-split' }`.
8. Else throw a clear error naming unsupported shape.

Always run resulting cue list through `normalizeCues` internally (or return objects that succeed when caller does `normalizeCues(result.cues)`). Prefer: return pre-normalized cues so callers can use either `result.cues` directly or `normalizeCues({ cues: result.cues })`.

Weak-split: empty segments after split are dropped; if zero pieces remain, throw. Each weak cue gets positive duration; last cue ends at `durationMs`.

### `applyCuePatches(cues, patches)`

```ts
type CuePatch = {
  index: number;
  text?: string;
  translation?: string;
  startMs?: number;
  endMs?: number;
};
```

- Shallow-clone array; clone patched cue objects only.
- OOB `index` → throw.
- After merge, if `endMs <= startMs` or non-finite → throw.
- Empty `text` after patch → throw (same spirit as normalize).
- Setting `translation` to `''` removes translation (or sets empty then strip).
- Does not re-sort (preserve operator order); callers may re-normalize if needed.

### CLI

```
subtitle --asr <rh-asr.json> --out <dir> [--langs zh,en] [--duration-ms N] [--basename subtitles]
subtitle --cues <cues.json> --out <dir> ...   # unchanged
subtitle --video <file>   # no --cues/--asr: missing key → V0 error; key present → "V1 live RH not wired; use --asr"
```

`--asr` and `--cues` mutually exclusive (prefer clear error if both).  
`--duration-ms` passed into `parseRhAsrOutput`.  
Stdout JSON includes `needsReview` / `source` when present.

### Adapter / exports

- Implement in `lib/subtitle-asr.mjs` + `.d.ts`.
- Optionally re-export `parseRhAsrOutput` / `applyCuePatches` from a thin comment or export near `detectSubtitleWorkflowKind` in adapters — **no RH submit**. Prefer exporting from lib only tonight; adapters stay heuristic-only unless a one-line re-export is trivial.

### Tests

`scripts/test-subtitle-asr.mjs` + fixtures under `scripts/fixtures/`:

- `rh-asr-segments.json`
- `rh-asr-sentences-ms.json`
- `rh-asr-result-nested.json`
- `rh-asr-array.json`
- `rh-asr-untimed-text.json`

Wire into `npm test` / `test:subtitle-asr`.

## Risks

- Real RH payloads may add more wrappers → extend detector table; keep cue contract stable.
- Weak-split quality is intentionally poor → always `needsReview: true`.

## Acceptance

See parent task checklist and plan `docs/superpowers/plans/2026-10-29-subtitle-v1-asr-parse.md`.
