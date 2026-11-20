import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeRefPath } from '../lib/mv-character-consistency.mjs';
import {
  CHARACTER_REF_ROLE_LABELS,
  formatMvCharacterPackLabel,
  planMvCharacterPackUi,
} from '../lib/mv-character-pack-ui.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function asset(partial) {
  return {
    id: partial.id || partial.path || 'id',
    name: partial.name || String(partial.path || 'asset').split('/').pop(),
    path: partial.path,
    mediaType: 'image',
    category: partial.category,
    role: partial.role,
    description: partial.description,
  };
}

// --- labels ---
{
  assert.equal(CHARACTER_REF_ROLE_LABELS.face_closeup, '近脸锁脸');
  assert.equal(CHARACTER_REF_ROLE_LABELS.threeview_front, '三视图正面');
  assert.equal(CHARACTER_REF_ROLE_LABELS.threeview_side, '三视图侧面');
  assert.equal(CHARACTER_REF_ROLE_LABELS.threeview_back, '三视图背面');
  assert.equal(CHARACTER_REF_ROLE_LABELS.costume, '换装');
  assert.equal(CHARACTER_REF_ROLE_LABELS.scene, '场景');
  assert.equal(CHARACTER_REF_ROLE_LABELS.unknown, '自动识别');
}

// --- normalizeRefPath is browser-safe and collapses .. ---
{
  assert.equal(normalizeRefPath('a/b/../c/still-B.jpg'), 'a/c/still-B.jpg');
  assert.equal(normalizeRefPath(String.raw`refs\\still-B.jpg`), 'refs/still-B.jpg');
}

// --- no assets ---
{
  const empty = planMvCharacterPackUi({ visualAssets: [] });
  assert.equal(empty.go, false);
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'NO_ASSETS');
  assert.match(empty.reason || '', /素材|参考图/);
  assert.match(formatMvCharacterPackLabel(empty), /人物一致性/);
}

// --- missing face lock ---
{
  const plan = planMvCharacterPackUi({
    visualAssets: [
      asset({ path: 'person.jpg', category: '人物' }),
      asset({ path: 'stage-wide.jpg', category: '场景' }),
    ],
  });
  assert.equal(plan.go, false);
  assert.equal(plan.ok, false);
  assert.equal(plan.code, 'MISSING_FACE_LOCK');
  assert.match(plan.reason || '', /近脸|锁脸/);
  assert.match(formatMvCharacterPackLabel(plan), /缺少近脸锁脸/);
}

// --- still-B + scene: go, face first, identity lock, threeview warning ---
{
  const stillB = asset({ path: 'refs/still-B.jpg', category: '人物', id: 'face' });
  const scene = asset({ path: 'refs/beach-wide.jpg', category: '场景', id: 'scene' });
  const plan = planMvCharacterPackUi({ visualAssets: [scene, stillB] });
  assert.equal(plan.go, true);
  assert.equal(plan.ok, true);
  assert.equal(plan.code, 'OK');
  assert.equal(plan.orderedAssets[0].id, 'face');
  assert.equal(plan.orderedAssets[1].id, 'scene');
  assert.match(plan.identityLockText || '', /Identity lock \/ 人物一致性/);
  assert.match(plan.identityLockText || '', /Picture 1/);
  assert.ok(Array.isArray(plan.warnings) && plan.warnings.length >= 1);
  assert.match(plan.warnings.join('\n'), /三视图/);
  const label = formatMvCharacterPackLabel(plan);
  assert.match(label, /已锁脸/);
  assert.match(label, /still-B\.jpg/);
  assert.match(label, /缺三视图/);
  const faceRole = (plan.roles || []).find((item) => item.path === stillB.path);
  assert.equal(faceRole?.role, 'face_closeup');
}

// --- explicit role overrides a generic filename ---
{
  const plan = planMvCharacterPackUi({
    visualAssets: [
      asset({ path: 'camilla.jpg', category: '人物', role: 'face_closeup', id: 'camilla' }),
      asset({ path: 'studio.jpg', category: '场景', id: 'studio' }),
    ],
  });
  assert.equal(plan.go, true);
  assert.equal(plan.orderedAssets[0].id, 'camilla');
  assert.match(plan.identityLockText || '', /camilla\.jpg/);
}

// --- category 场景 maps to scene for generic filenames ---
{
  const plan = planMvCharacterPackUi({
    visualAssets: [
      asset({ path: 'camilla.jpg', category: '人物', role: 'face_closeup', id: 'face' }),
      asset({ path: 'hall.jpg', category: '场景', id: 'hall' }),
    ],
  });
  assert.equal(plan.go, true);
  const hall = (plan.roles || []).find((item) => item.id === 'hall' || item.path === 'hall.jpg');
  assert.equal(hall?.role, 'scene');
  assert.equal(plan.orderedAssets.at(-1).id, 'hall');
}

// --- UI lib and consistency core are browser-safe ---
{
  const ui = readFileSync(path.join(repoRoot, 'lib/mv-character-pack-ui.mjs'), 'utf8');
  const core = readFileSync(path.join(repoRoot, 'lib/mv-character-consistency.mjs'), 'utf8');
  const face = readFileSync(path.join(repoRoot, 'lib/mv-face-closeup.mjs'), 'utf8');
  for (const [name, src] of [['ui', ui], ['core', core], ['face', face]]) {
    assert.ok(!/from ['"]node:/.test(src), `${name} must be browser-safe`);
    assert.ok(!/mv-lipsync-prep\.mjs/.test(src), `${name} must not import mv-lipsync-prep.mjs`);
  }
}

// --- page wiring ---
{
  const page = readFileSync(path.join(repoRoot, 'app/mv/page.tsx'), 'utf8');
  assert.match(page, /from "\.\.\/\.\.\/lib\/mv-character-pack-ui\.mjs"/);
  assert.match(page, /appendIdentityLockToPrompt/);
  assert.match(page, /planMvCharacterPackUi/);
  assert.match(page, /formatMvCharacterPackLabel/);
  assert.match(page, /role\?:/);
  assert.match(page, /按一致性包整理顺序/);
  for (const fn of ['generatePrompts', 'generateFullMv', 'enqueueGeneration', 'generateCloud']) {
    const start = page.indexOf(`function ${fn}(`);
    assert.ok(start >= 0, `missing ${fn}`);
    const body = page.slice(start, start + 5500);
    assert.match(body, /planMvCharacterPackUi\(|characterPack|packPlan|MISSING_FACE_LOCK/, `${fn} must run the character-pack gate`);
  }
  assert.match(page, /function buildPackedPrompt/);
  assert.match(page, /appendIdentityLockToPrompt/);
  const genStart = page.indexOf('function generatePrompts(');
  const genBody = page.slice(genStart, genStart + 4500);
  assert.match(genBody, /buildPackedPrompt|appendIdentityLockToPrompt/);
  assert.match(genBody, /characterPackPlan|orderedAssets|packPlan|characterPack/);
}

// --- client bundle safety: page's lib import graph has no node: builtins ---
{
  const seen = new Set();
  const offenders = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:')) offenders.push(`${path.relative(repoRoot, file)} -> ${spec}`);
      else if (spec.startsWith('.') && /\.m?js$/.test(spec)) visit(path.resolve(path.dirname(file), spec));
    }
  };
  visit(path.join(repoRoot, 'app/mv/page.tsx'));
  assert.deepEqual(offenders, [], `client page imports node builtins: ${offenders.join(', ')}`);
}

console.log('test-mv-character-pack-ui ok');
