# MV Close-up Scene Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Tighten scene lock so tight facial close-ups keep the referenced location, lighting, and props in the background instead of inventing an indoor stage.

**Architecture:** Extend the existing bilingual `sceneLockText` with a close-up clause, and add residual-background language to folk-solo/duo vocal close-up shot lines (template v3). Injection path stays `appendIdentityLockToPrompt`. No new package.

**Tech Stack:** Node ESM, existing character-consistency and folk prompt test scripts.

## Global Constraints

- No `node:` imports added to `lib/mv-character-consistency.mjs` or `lib/mv-prompt.mjs`.
- Empty `sceneLockText` when there is no scene reference.
- Instrumental / no-vocal folk coverage must not gain the close-up background clause.
- Do not remove singer face close-ups from vocal-active coverage.

---

### Task 1: Close-up clause in sceneLockText

**Files:**
- Modify: `scripts/test-mv-character-consistency.mjs`
- Modify: `lib/mv-character-consistency.mjs` (`buildSceneLockText`)

- [ ] **Step 1: Write the failing tests**

In the existing sourcePath/beach pack block, assert that `sceneLockText` also matches tight facial close-up language (English and Chinese), soft-focus / 可虚化, and theatrical stage lighting / 舞台灯 / black void / 黑底. A pack with only a cropped face and no scene still has empty `sceneLockText`.

- [ ] **Step 2: Run `node scripts/test-mv-character-consistency.mjs` and confirm the new assertions fail**

- [ ] **Step 3: Append the close-up clause to `buildSceneLockText`**

Add bilingual sentences after the existing indoor-gray-stage and guitar/microphone rules, naming Picture N's location, lighting, and props, allowing soft-focus remnants, and forbidding indoor gray stage, theatrical stage lighting, a studio backdrop, or a black void.

- [ ] **Step 4: Re-run the consistency tests and confirm they pass**

### Task 2: Folk solo/duo v3 close-up shot language

**Files:**
- Modify: `scripts/test-folk-mv-prompt.mjs`
- Modify: `scripts/test-folk-duo-mv-prompt.mjs`
- Modify: `lib/mv-prompt.mjs`

- [ ] **Step 1: Write failing tests**

Vocal-active 10s folk-solo and folk-duo prompts must match residual-background language (softly visible in the background / indoor gray stage / theatrical stage lighting / black studio void). Instrumental prompts must not contain "Even in a tight facial close-up" or "keep the referenced scene softly visible in the background". Bump assertions may keep the existing `/^folk-*-ref2va-/` prefix check; also assert versions are `folk-solo-ref2va-v3` and `folk-duo-ref2va-v3`.

- [ ] **Step 2: Run the folk tests and confirm failure**

- [ ] **Step 3: Implement**

Share a short `FOLK_CLOSEUP_SCENE_HOLD` (or equivalent) constant. Append it to folk-solo and folk-duo vocal-plan camera strings, and to vocal shot bodies when the shot is not face-safe/instrumental. Set `FOLK_SOLO_MV_PROMPT_TEMPLATE_VERSION` and `FOLK_DUO_MV_PROMPT_TEMPLATE_VERSION` to v3.

- [ ] **Step 4: Run folk + consistency tests, then `npm test`**

- [ ] **Step 5: Commit after green**
