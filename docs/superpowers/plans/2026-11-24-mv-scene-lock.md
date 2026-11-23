# MV Scene Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** When a character pack includes a scene reference (including a close-up crop's source image), emit bilingual scene-lock text and inject it into MV prompts next to the existing identity lock.

**Architecture:** Extend the existing browser-safe character-consistency pack builder and appendIdentityLockToPrompt. Thread sceneLockText through planMvCharacterPackUi, mv-cut, and the MV page prompt builder. No new package.

**Tech Stack:** Node ESM, existing character-consistency and character-pack-ui test scripts.

## Global Constraints

- No node: imports in the consistency or pack-ui libraries.
- Explicit role still wins classification.
- newface-beach B.jpg stays face_closeup.
- Do not invent a RunningHub prompt field for Xunfeng auto.

---

### Task 1: Scene lock in the character pack and prompt injection

Files: scripts/test-mv-character-consistency.mjs, scripts/test-mv-character-pack-ui.mjs, lib/mv-character-consistency.mjs, lib/mv-character-consistency.d.ts, lib/mv-character-pack-ui.mjs, lib/mv-character-pack-ui.d.ts, cli/director-master.mjs, app/mv/page.tsx.

- [x] Step 1: Write failing tests (beach classification, sourcePath attach, sceneLockText, crop warning, append order).
- [ ] Step 2: Run the character-consistency tests and confirm failure on the new assertions.
- [ ] Step 3: Implement classification, source attach, sceneLockText, warning, report, and third argument on appendIdentityLockToPrompt.
- [ ] Step 4: Thread sceneLockText through planMvCharacterPackUi, mv-cut, and MV page buildPackedPrompt.
- [ ] Step 5: Run targeted tests then npm test.
- [ ] Step 6: Commit after green.

### Task 2 (optional same night): generateFullMv unit typo

If time remains, replace the hardcoded unit in generateFullMv with the same unit helper used by formatMvGenerateEstimateLabel, covered by the generate-ui-preflight tests.
