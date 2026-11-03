# MV UI Template Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MV 页模板下拉直接读 `listMvPromptTemplates()`，生成走 `buildMvPromptForTemplate`，并持久化 `promptTemplateId`。

**Architecture:** 在 `lib/mv-prompt.mjs` 增加 `normalizeMvPromptTemplateId`；local-runtime 增加 GET templates 与 PUT 字段；`app/mv/page.tsx` 最小接线。

**Tech Stack:** Node ESM, existing Vite local-runtime API, React client page.

## Global Constraints
- Base branch tip: `feature/mv-master-rebrand` (includes rock-solo registry)
- No RH paid calls; no secrets; no large media
- Keep band default behavior when id missing

---

### Task 1: normalizeMvPromptTemplateId + tests

**Files:**
- Modify: `lib/mv-prompt.mjs`, `lib/mv-prompt.d.ts`
- Create: `scripts/test-mv-ui-template-picker.mjs`
- Modify: `package.json` test script

- [ ] **Step 1:** Write failing test for normalize + registry list + source wiring placeholders
- [ ] **Step 2:** Run test → fail (normalize missing)
- [ ] **Step 3:** Implement `normalizeMvPromptTemplateId`
- [ ] **Step 4:** Tests pass for helper; wire into npm test
- [ ] **Step 5:** Commit

### Task 2: API GET + PUT persistence

**Files:**
- Modify: `vite-plugins/local-runtime.ts` (GET `/api/local/mv/templates`; PUT `promptTemplateId`; createMvProject default)

- [ ] **Step 1:** Extend test to assert handler strings / behavior via source match + import list
- [ ] **Step 2:** Implement GET + persist field
- [ ] **Step 3:** Commit

### Task 3: MV page picker

**Files:**
- Modify: `app/mv/page.tsx`

- [ ] **Step 1:** Fail source assertions until page uses list/buildMvPromptForTemplate + select + promptTemplateId
- [ ] **Step 2:** Wire imports, state, select, generate paths, signature, save/restore
- [ ] **Step 3:** `npm test` green
- [ ] **Step 4:** Commit

### Task 4: Docs + iteration notes + PR

**Files:**
- Modify: `docs/ITERATION_NOTES.md`, `docs/ITERATION_PLAN.md`
- Push branch; open PR stacked on mv-master-rebrand
