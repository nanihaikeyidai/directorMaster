# MV Lyric Import UI Implementation Plan

> **For agentic workers:** Use test-driven-development and verification-before-completion. Nightly automation executes this plan inline.

**Goal:** Let the MV page import timed lyrics JSON and apply planLyricPhraseSegments in one click, matching CLI mv-cut --lyrics without --cuts.

**Architecture:** A thin browser-safe wrapper lib/mv-lyric-import-ui.mjs parses JSON and shifts cues into the current trim window, then delegates to the existing planner. app/mv/page.tsx adds a file picker and applies cuts + notes (including phraseEndsSec) the same way auto-split updates the timeline.

**Tech Stack:** Existing ESM libs, Node test scripts, React MV page.

## Global Constraints

- No node: imports in the new lib or its import graph.
- Reuse planLyricPhraseSegments / parseLyricCues; do not fork segment rules.
- Chinese user-facing reasons.
- Cuts returned in absolute source time.
- Do not commit secrets or media.

### Task 1: Failing tests + wrapper + page wiring

**Files:**
- Create: lib/mv-lyric-import-ui.mjs, lib/mv-lyric-import-ui.d.ts, scripts/test-mv-lyric-import-ui.mjs
- Modify: app/mv/page.tsx, package.json
- Docs: this plan and docs/superpowers/specs/2026-11-23-mv-lyric-import-ui-design.md

- Write failing tests first, confirm they fail because the module is missing
- Implement the wrapper and page wiring
- node scripts/test-mv-lyric-import-ui.mjs and npm test pass
