# Folk Solo MV Prompt + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add folk-solo Ref2VA prompt template + CLI (`mv-cut --template`, `mv-generate`) so one music track can produce lip-synced solo folk MV clips via the same shared `lib/mv-prompt.mjs` path as the band template.

**Architecture:** Extend `lib/mv-prompt.mjs` with `buildFolkSoloMvPrompt` reusing `getSegmentVocalTiming` and six-section output. Wire `cli/director-master.mjs` template switch + RH submit/concat. Keep band defaults unchanged.

**Tech Stack:** Node ESM, ffmpeg/ffprobe, RunningHub OpenAPI, existing MiniMax H3 cloud workflow `2087128116820013058`.

## Global Constraints

- Approach A only: extend existing lib + CLI (no separate folk-mv package).
- Never cut mid-lyric line; instrumental shots never face CU; vocal prefers singer CU.
- folk-solo forbids dual character-sheet refs; single adult performer.
- Key-gated RH; dry-run default for generate.
- `npm test` must stay green.

---

### Task 1: Failing folk-solo prompt tests

**Files:**
- Create: `scripts/test-folk-mv-prompt.mjs`
- Modify: `package.json` (add to `test` script)

**Interfaces:**
- Consumes: (none yet — tests define desired API)
- Produces: assertions for `buildFolkSoloMvPrompt`, `FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import {
  buildFolkSoloMvPrompt,
  FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION,
  getSegmentVocalTiming,
} from '../lib/mv-prompt.mjs';

const assets = [
  { mediaType: 'image', category: '人物', description: 'Camilla, adult solo folk singer with silver-white hair, cream linen, acoustic guitar.' },
  { mediaType: 'image', category: '场景', description: 'Golden-hour beach shore with wet sand and ocean horizon.' },
];

const sections = ['subject_definitions:','summary:','retention_analysis:','detailed_description:','overall_soundscape:','non_diegetic_music:'];

const instrumental = buildFolkSoloMvPrompt({
  projectName: 'Folk Solo',
  segment: { index: 2, start: 10, end: 20, duration: 10 },
  note: { kind: 'instrumental', direction: '间奏' },
  assets,
});
let cursor = -1;
for (const s of sections) {
  const i = instrumental.indexOf(s);
  assert.ok(i > cursor, s);
  cursor = i;
}
assert.match(instrumental, /never cut mid-lyric|phrase boundary|breath|vocal gap/i);
assert.match(instrumental, /wide|venue|guitar|hands|strings|instrument/i);
assert.doesNotMatch(instrumental, /singer face close-up|facial close-up of the soloist lip/i);
assert.match(instrumental, /closed/);
assert.match(FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION, /^folk-solo-ref2va-/);

const vocal = buildFolkSoloMvPrompt({
  projectName: 'Folk Solo',
  segment: { index: 3, start: 20, end: 30, duration: 10 },
  note: { kind: 'vocal', lyrics: '海风轻轻吹', direction: '主歌' },
  assets,
});
assert.match(vocal, /close-up|特写/i);
assert.match(vocal, /<Audio 1>/);
assert.match(vocal, /single performer|soloist|一人|禁止.*复制/i);

assert.throws(() => buildFolkSoloMvPrompt({
  projectName: 'x',
  segment: { index: 1, start: 0, end: 5, duration: 5 },
  note: { kind: 'vocal' },
  assets: [
    { mediaType: 'image', category: '人物', description: 'character sheet with left panel close-up and right panel full body of Camilla' },
    assets[1],
  ],
}), /dual|character sheet|人设表|双人/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-folk-mv-prompt.mjs`  
Expected: FAIL (buildFolkSoloMvPrompt not exported)

- [ ] **Step 3: Commit tests + package.json hook**

```bash
git add scripts/test-folk-mv-prompt.mjs package.json
git commit -m "test(mv): failing folk-solo prompt template coverage"
```

---

### Task 2: Implement `buildFolkSoloMvPrompt`

**Files:**
- Modify: `lib/mv-prompt.mjs`
- Modify: `lib/mv-prompt.d.ts`
- Create: `docs/FOLK_SOLO_MV_PROMPT_STANDARD.md` (short)

**Interfaces:**
- Consumes: `getSegmentVocalTiming`, existing clean/segmentTimestamp helpers
- Produces: `buildFolkSoloMvPrompt(input): string`, `FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION`

- [ ] **Step 1: Implement minimal folk-solo builder** meeting Task 1 assertions (instrumental face ban, vocal CU, mid-line cut rule, dual-sheet reject, six sections).
- [ ] **Step 2: Run `node scripts/test-folk-mv-prompt.mjs` → PASS; `npm test` → PASS**
- [ ] **Step 3: Commit**

```bash
git add lib/mv-prompt.mjs lib/mv-prompt.d.ts docs/FOLK_SOLO_MV_PROMPT_STANDARD.md
git commit -m "feat(mv): add folk-solo Ref2VA prompt template"
```

---

### Task 3: Wire CLI `mv-cut --template` + portable root + `mv-generate`

**Files:**
- Modify: `cli/director-master.mjs`
- Create: `lib/mv-cloud-generate.mjs` (RH upload/create/wait/download + concat/mux helpers) if CLI would otherwise bloat
- Modify: help text

**Interfaces:**
- `mvPrompt(projectName, segment, note, assets, template)` → band or folk-solo
- `mv-cut ... --template folk-solo|band` (default band)
- `mv-generate --project <id|path> [--watch] [--dry-run] [--workflow-id ID] [--out dir]`
- Workspace: `DIRECTOR_MASTER_ROOT` or repo root via `import.meta.url`

- [ ] **Step 1: Portable `DIRECTOR_WORKSPACE`; template switch in `mvCut`**
- [ ] **Step 2: `mv-generate` dry-run writes plan JSON; `--watch` submits RH and muxes original audio**
- [ ] **Step 3: Smoke: `npm run director -- mv-cut --help` path shows template; unit tests still green**
- [ ] **Step 4: Commit**

```bash
git add cli/director-master.mjs lib/mv-cloud-generate.mjs
git commit -m "feat(cli): mv-cut --template folk-solo + mv-generate RH path"
```

---

### Task 4: Camilla beach ~30s regen via new flow

**Files:** outside repo under `/workspace/camilla-beach-mv/` (project notes only; do not commit secrets)

- Still B+C only; notes mark instrumental vs vocal; vocalStartSec≈7; cuts near phrase gaps.
- Run mv-cut → mv-generate --watch → align-check.
- Record coin spend + final mp4 path.

---

### Task 5: Push PR (do not merge)

```bash
git push -u origin HEAD
gh pr create --title "feat(mv): folk-solo prompt template + CLI" --body "..."
```

Include nightly suggestion text for parent UpdateRoutine.
