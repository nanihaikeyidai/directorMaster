# Subtitle V1 Night-3 — Optional ffmpeg Burn-in

**Date:** 2026-10-31 (Asia/Shanghai nightly)  
**Status:** Approved by standing nightly routine (interactive brainstorming skipped; user away)  
**Module:** 视频后期配字幕（Sprint 3）  
**Parent plan:** `docs/SUBTITLE_BILINGUAL_PLAN.md`  
**Depends on:** V0 `writeBilingualSubtitles` (ASS/SRT writers); night-1/2 soft-export paths

## Problem

Soft bilingual SRT/ASS export exists, but operators cannot produce a hard-subtitled MP4 from CLI. Product plan lists optional burn-in; redub already burns SRT via ffmpeg — subtitle module needs the same capability without coupling to redub jobs.

## Goals (tonight)

1. New `lib/subtitle-burn.mjs` (+ `.d.ts`): path escape, pure ffmpeg arg builder, ffmpeg probe, injectable burn runner.
2. Prefer bilingual ASS when present; fall back to a single-lang SRT.
3. Missing ffmpeg → `{ status: 'skipped', reason }` (no crash); never require ffmpeg for soft-export paths.
4. Tests with **injectable exec** (no real encode required for unit tests); optional real smoke only if ffmpeg present and deps not injected.
5. CLI: `--burn` after soft write when `--video` names the source clip.
   - With `--cues` / `--asr`: allow `--video` as burn source only when `--burn` is set (relax prior mutual exclusion).
   - With `--video` ASR dry-run/`planned`: soft burn is a no-op skip (no cues yet).
   - Output default: `<outDir>/<basename>.burned.mp4`
6. Docs + Sprint 3 checkbox update for burn; UI cue editor stays non-goal.

## Non-goals (tonight)

- UI cue editor page
- Live RH paid calls
- External font packs / fancy ASS styles beyond a simple force_style for SRT
- Changing redub burn path (leave as-is; share escape idea only)

## Approaches considered

| Approach | Pros | Cons |
|---|---|---|
| A. Call ffmpeg only from CLI | Fast | Untestable; path escape bugs |
| **B. Lib with injectable execFile + pure args** | TDD; skip cleanly | Extra module |
| C. Reuse redub `mixAndExport` | DRY | Wrong job model; heavy coupling |

**Recommendation: B.**

## Design

### Pure helpers

- `escapeSubtitlesFilterPath(filePath)` — normalize to forward slashes; escape `:` → `\:` for ffmpeg `subtitles=` filter (same idea as redub).
- `buildBurnFfmpegArgs({ videoPath, subtitlePath, outputPath, mode? })` → `string[]`
  - Default: `-hide_banner -y -i video -vf subtitles='ESCAPED':… -c:a copy output`
  - For `.ass`: `subtitles='ESCAPED'` without force_style (ASS carries styles).
  - For `.srt`: add `force_style='Fontsize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=24'` (match redub readability).
  - Video encode: `libx264 -preset veryfast -crf 18` (filter requires re-encode); audio `-c:a copy` when possible.
- `resolveBurnSubtitleFile({ outDir, basename, assPath?, srtPath?, written? })` — prefer `*.bilingual.ass`, else first available SRT from `written` or conventional names.

### Probe + burn

- `probeFfmpeg(deps?)` → `{ available: boolean, path: string }`  
  - `deps.execFile(file, args)` optional; default `node:child_process` promisified `execFile('ffmpeg', ['-version'])`.
  - On ENOENT / non-zero → `available: false`.
- `burnSubtitlesIntoVideo(input, deps?)`  
  - **input:** `{ videoPath, subtitlePath, outputPath, requireFfmpeg?: boolean }`  
  - **deps:** `{ execFile?, probe? }`  
  - If probe says unavailable: if `requireFfmpeg` throw clear 中英 error; else return `{ status:'skipped', reason:'ffmpeg-not-found', outputPath:null }`.  
  - Else run `execFile('ffmpeg', buildBurnFfmpegArgs(...), { windowsHide:true, timeout })`.  
  - Success → `{ status:'burned', outputPath, ffmpegArgs }`.  
  - Never log secrets (none involved).

### CLI

```
subtitle --cues <json> --out <dir> --burn --video <clip.mp4> [--basename]
subtitle --asr <json> --out <dir> --burn --video <clip.mp4>
subtitle --video <clip.mp4> --out <dir> --burn   # only burns if pipeline status written; planned → burn.status skipped
```

Return JSON includes soft `files` plus `burn: { status, ... }`.

### Tests (`scripts/test-subtitle-burn.mjs`)

1. `escapeSubtitlesFilterPath` Windows-like and POSIX paths  
2. `buildBurnFfmpegArgs` ASS vs SRT (force_style only for SRT)  
3. `probeFfmpeg` with mock exec ENOENT → unavailable  
4. `burnSubtitlesIntoVideo` missing ffmpeg → skipped  
5. Happy mock exec → burned + args contain escaped path and output  
6. Missing video/subtitle path → throw  

Wire into `npm test`.

## Acceptance

1. Soft export still works without ffmpeg / without `--burn`.  
2. `--burn` + video + cues → ASS written + burned mp4 path (or skipped if no ffmpeg).  
3. No RH network; no secrets; no large binaries committed.  
4. `npm test` green including new suite.

## Next night (out of scope)

- UI cue edit → re-export  
- Optional real encode smoke fixture in CI only when ffmpeg present  
