import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeMvPromptTemplateId,
  listMvPromptTemplates,
  MV_PROMPT_TEMPLATES,
  buildMvPromptForTemplate,
} from "../lib/mv-prompt.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- Task 1: normalize + registry ---
assert.equal(normalizeMvPromptTemplateId(), "band");
assert.equal(normalizeMvPromptTemplateId(""), "band");
assert.equal(normalizeMvPromptTemplateId(null), "band");
assert.equal(normalizeMvPromptTemplateId("   "), "band");
assert.equal(normalizeMvPromptTemplateId("folk-solo"), "folk-solo");
assert.equal(normalizeMvPromptTemplateId("rock-solo"), "rock-solo");
assert.equal(normalizeMvPromptTemplateId("nope"), "band");

const listed = listMvPromptTemplates();
assert.ok(listed.length >= 5, `expected >=5 templates, got ${listed.length}`);
const ids = listed.map((t) => t.id);
for (const id of ["band", "folk-solo", "folk-duo", "piano-ballad", "rock-solo"]) {
  assert.ok(ids.includes(id), `registry missing ${id}`);
}
assert.ok(MV_PROMPT_TEMPLATES.band);
assert.equal(typeof buildMvPromptForTemplate, "function");

console.log("ok - normalizeMvPromptTemplateId + registry");

// --- Task 2: API source wiring ---
const runtimeSrc = readFileSync(join(root, "vite-plugins/local-runtime.ts"), "utf8");
assert.match(runtimeSrc, /\/api\/local\/mv\/templates/);
assert.match(runtimeSrc, /promptTemplateId/);
assert.match(runtimeSrc, /listMvPromptTemplates/);
assert.match(runtimeSrc, /normalizeMvPromptTemplateId/);
console.log("ok - API source wiring");

// --- Task 3: MV page source wiring ---
const pageSrc = readFileSync(join(root, "app/mv/page.tsx"), "utf8");
assert.match(pageSrc, /listMvPromptTemplates/);
assert.match(pageSrc, /buildMvPromptForTemplate/);
assert.match(pageSrc, /promptTemplateId/);
assert.match(pageSrc, /aria-label="MV 提示词模板"/);
assert.match(pageSrc, /<select[\s\S]*aria-label="MV 提示词模板"|aria-label="MV 提示词模板"[\s\S]*<select/);
console.log("ok - MV page source wiring");
