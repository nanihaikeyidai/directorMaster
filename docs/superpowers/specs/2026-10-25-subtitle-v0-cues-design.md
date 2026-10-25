# Subtitle V0 — Offline Cue Pipeline Design

**Date:** 2026-10-25 (Asia/Shanghai nightly)  
**Status:** Approved by standing nightly routine (interactive brainstorming skipped; user away)  
**Module:** 视频后期配字幕  
**Parent plan:** `docs/SUBTITLE_BILINGUAL_PLAN.md`

## Problem

Module 3 (bilingual subtitles) has a product plan but zero code. Cloud ASR (RunningHub Confucius4-R2T2) needs a key and paid retries; standing rule forbids RH paid retries tonight. We still need a reversible, testable foundation so V1 can plug ASR output into exporters without rework.

## Goals (V0)

1. Normalize ASR-like text/JSON into cue objects `{ startMs, endMs, text }` (optional `translation`).
2. Export bilingual soft subs: per-lang SRT files + dual-line ASS.
3. Pure-local CLI: `npm run director -- subtitle --cues <json> --out <dir> [--langs zh,en]` — no network.
4. If `--video` is given without cues and no API key: clear error, non-zero exit (do not call cloud).
5. Adapter stub: `detectSubtitleWorkflowKind(workflow)` → `'asr-r2t2' | null` via class_type heuristics.
6. Tests + docs for next night.

## Non-goals (V0)

- Live RunningHub submit / poll / archive
- External translation APIs
- Burn-in ffmpeg
- UI pages
- Speaker diarization

## Cue model

```ts
type SubtitleCue = {
  startMs: number; // inclusive, >= 0
  endMs: number;   // exclusive-ish; must be > startMs
  text: string;    // source / primary line, trimmed, non-empty
  translation?: string; // optional second language
};
```

### Normalize inputs

Accept:

- Array of cues (already shaped)
- `{ cues: [...] }` wrapper
- Plain timed lines: `00:00:01,000 --> 00:00:02,500 你好` or `1.0-2.5\t你好`
- Objects with `start`/`end` in seconds (converted to ms)
- Objects with `startMs`/`endMs`

Reject: empty text, inverted/zero duration, non-finite times. Sort by `startMs`.

### Translations

- Prefer `cue.translation`
- Or parallel `translations: string[]` / map by index passed to `writeBilingualSubtitles`
- Missing translation → source-only export (still valid SRT/ASS)

## Exporters

- `formatSrtTimestamp(ms)` → `HH:MM:SS,mmm`
- `cuesToSrt(cues, { field: 'text' | 'translation' })` → SRT string
- `cuesToAssBilingual(cues, { sourceLang, targetLang })` → ASS with two Dialogue lines per cue (primary larger, translation smaller Style)
- `writeBilingualSubtitles(outDir, cues, options)` → writes e.g. `subtitles.zh.srt`, `subtitles.en.srt`, `subtitles.bilingual.ass`

## CLI

```
subtitle --cues <json> --out <dir> [--langs zh,en] [--basename subtitles]
subtitle --video <path>   # without --cues: require RUNNINGHUB_API_KEY; if missing → error exit 1, no network
```

Offline cues path must accept relative/cwd paths on Linux (do **not** force `D:\HermesWorkspace`).

## Adapter stub

`detectSubtitleWorkflowKind(workflow)` scans `class_type` strings (case-insensitive) for Confucius / R2T2 / ASR markers → `'asr-r2t2'`, else `null`. Does not throw; does not submit.

## Risks

- Weak ASR formats later → extend normalize with adapters, keep cue model stable.
- ASS style defaults may need UI tweak in V1 — keep styles in one helper.

## Acceptance

See plan `docs/superpowers/plans/2026-10-25-subtitle-v0-cues.md` and nightly task checklist.
