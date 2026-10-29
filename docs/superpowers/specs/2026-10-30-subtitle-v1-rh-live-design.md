# Subtitle V1 Night-2 — Live RH ASR Adapter (Key-Gated) + CLI 成片入口

**Date:** 2026-10-30 (Asia/Shanghai nightly)  
**Status:** Approved by standing nightly routine (interactive brainstorming skipped; user away)  
**Module:** 视频后期配字幕（Sprint 3）  
**Parent plan:** `docs/SUBTITLE_BILINGUAL_PLAN.md`  
**Depends on:** night-1 `lib/subtitle-asr.mjs` (`parseRhAsrOutput`) + V0 `writeBilingualSubtitles`

## Problem

Night-1 can turn RH-shaped ASR JSON into bilingual SRT/ASS offline, but operators still cannot drive 「成片 → ASR → cues」 from CLI. Live submit must be key-gated, injectable for tests, and must never make paid RH calls during nightly verification.

## Goals (tonight)

1. New `lib/subtitle-rh-asr.mjs` (+ `.d.ts`) with pure config/body helpers + injectable `runSubtitleAsrPipeline`.
2. Default workflowId `2104649076645130241` (overridable via env / options).
3. `hasSubtitleAsrKey` / clear Chinese+English missing-key error; never log or return the API key.
4. `extractAsrRawFromCloudOutputs` normalizes RH outputs array into something `parseRhAsrOutput` accepts.
5. Tests with **mock deps only** (no fetch / no real RH).
6. CLI `subtitle --video --out` 成片入口: default/`--dry-run` writes `asr-job-plan.json` and returns `planned` without network; `--watch` wires real transport mirroring `vite-plugins/runninghub.ts` (Bearer + apiKey in body, multipart upload, create/status/outputs) but **must not be invoked against live RH in this run**.
7. Replace night-1 string 「Subtitle V1 live RH ASR 尚未接入」.
8. Docs + Sprint 3 checkbox update; optional one-line adapter comment.

## Non-goals (tonight)

- Actually calling RunningHub (paid) in tests or verification
- Expanding TS submit into `runninghub-workflow-adapters.ts` beyond a pointer comment
- Burn-in ffmpeg / UI cue editor
- External translation APIs

## Approaches considered

| Approach | Pros | Cons |
|---|---|---|
| A. Call RH directly from CLI with fetch | Simple | Untestable; risk of paid calls in nightly |
| **B. Injectable deps pipeline in lib + dry-run default in CLI** | TDD-friendly; key gate; dry-run safe | Extra module |
| C. Only plan JSON, no pipeline | Zero risk | Does not unlock `--watch` wiring later |

**Recommendation: B.**

## Design

### Constants / config

- `DEFAULT_SUBTITLE_ASR_WORKFLOW_ID = '2104649076645130241'`
- `resolveSubtitleAsrConfig(options?)` → `{ workflowId, apiBase, outDir, jobId? }`
  - workflowId: `options.workflowId` || `env.RUNNINGHUB_SUBTITLE_WORKFLOW_ID` || default
  - apiBase: `options.apiBase` || `'https://www.runninghub.cn'`
  - out layout: under `options.outDir` (+ optional `jobId` subfolder if provided)

### Pure helpers

- `hasSubtitleAsrKey(env?)` — true iff `String(env.RUNNINGHUB_API_KEY||'').trim()` non-empty (default `process.env`).
- `buildSubtitleAsrSubmitBody({ workflowId, fileName, nodeInfoList? })` — returns RH create-shaped object fields (`workflowId`, `instanceType:'plus'`, `nodeInfoList`, optionally empty `workflow`) **without** embedding apiKey (caller/transport adds apiKey).
- `extractAsrRawFromCloudOutputs(outputs)`:
  - Accept array of `{ fileUrl, fileName, text, fileType, ... }` or nested `{ data: [...] }` / single object.
  - Prefer: inline `text` / JSON-looking string; object already ASR-shaped; else first JSON-ish `fileUrl`/`fileName` payload left as `{ text }` or pass through parseable structures.
  - If an item has parseable JSON in `text`, parse it.
  - Fallback: concatenate texts; if nothing usable, throw clear error.

### `runSubtitleAsrPipeline(input, deps)`

**input:** `{ videoPath, outDir, langs?, basename?, workflowId?, durationMs?, dryRun?, jobId?, apiBase?, maxPolls?, pollIntervalMs? }`

**deps (REQUIRED):** `{ getApiKey, uploadFile, createTask, getStatus, getOutputs, readFile?, sleep? }`

Flow:

1. Resolve config; `getApiKey()` — if empty/missing → throw bilingual clear error (no network).
2. If `dryRun`: write plan metadata return `{ status:'planned', jobId, workflowId, videoBasename, files:{ plan }, cueCount:0, needsReview:false }` — **no** upload/create/poll.
3. Else: `uploadFile(videoPath)` → fileName; `createTask(buildSubtitleAsrSubmitBody(...))` → taskId; poll `getStatus` until SUCCESS/FAILED (cap `maxPolls` default 60; `deps.sleep`); FAILED → throw/return failed; SUCCESS → `getOutputs` → `extractAsrRawFromCloudOutputs` → `parseRhAsrOutput` → `writeBilingualSubtitles` → return `{ status:'written', cueCount, needsReview, files, taskId, jobId }`.

Never include apiKey in return values or thrown messages.

### CLI

```
subtitle --video <file> --out <dir> [--langs] [--basename] [--workflow-id] [--duration-ms] [--dry-run] [--watch]
```

- No key + `--video` → existing missing-key error.
- Key present + `--video` + `--out`:
  - Default or `--dry-run`: pipeline `dryRun:true` (or no-op deps) → write `asr-job-plan.json`, exit success `planned`.
  - `--watch` without `--dry-run`: real RH deps (fetch transport). Nightly verify must **not** run this against live RH.
- Keep `--cues` / `--asr` offline paths unchanged.
- Help text lists new flags.

### Real transport (for `--watch` only)

Mirror `vite-plugins/runninghub.ts`:
- POST JSON with `Authorization: Bearer ${secret}` and body `{...fields, apiKey: secret}`
- Upload: multipart FormData to `/task/openapi/upload` with `apiKey` + `file`
- Create: `/task/openapi/create`
- Status: `/task/openapi/status`
- Outputs: `/task/openapi/outputs`

Prefer exporting a factory `createSubtitleAsrRhDeps({ apiBase, env })` from the same lib module so CLI stays thin.

## Risks

- Accidental paid call → mitigate: dry-run default; tests use mocks; nightly verify only dry-run.
- Output shape drift → extract helper + reuse night-1 parser + fixtures mentally.
