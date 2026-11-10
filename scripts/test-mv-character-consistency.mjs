import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  classifyCharacterRef,
  buildCharacterConsistencyPack,
  formatCharacterPackReport,
  listCharacterRefPaths,
  applyCharacterPackToAssets,
  appendIdentityLockToPrompt,
} from '../lib/mv-character-consistency.mjs';

// --- classifyCharacterRef: path heuristics ---
assert.equal(classifyCharacterRef('still-B.jpg'), 'face_closeup');
assert.equal(classifyCharacterRef('/x/ref-crop.jpg'), 'face_closeup');
assert.equal(classifyCharacterRef('/x/face-front.png'), 'face_closeup');
assert.equal(classifyCharacterRef('close-up.png'), 'face_closeup');
assert.equal(classifyCharacterRef('singer-bust.png'), 'face_closeup');
assert.equal(classifyCharacterRef('胸像.jpg'), 'face_closeup');
assert.equal(classifyCharacterRef('近脸.png'), 'face_closeup');
assert.equal(classifyCharacterRef('threeview-B.jpg'), 'face_closeup');
assert.equal(classifyCharacterRef('newface-beach B.jpg'), 'face_closeup');

assert.equal(classifyCharacterRef('threeview-A.jpg'), 'threeview_front');
assert.equal(classifyCharacterRef('still-A.jpg'), 'threeview_front');
assert.equal(classifyCharacterRef('Camilla-A.jpg'), 'threeview_front');
assert.equal(classifyCharacterRef('stills-threeview A.jpg'), 'threeview_front');
assert.equal(classifyCharacterRef('front.jpg'), 'threeview_front');

assert.equal(classifyCharacterRef('threeview-C.jpg'), 'threeview_side');
assert.equal(classifyCharacterRef('still-C.jpg'), 'threeview_side');
assert.equal(classifyCharacterRef('Camilla-C.jpg'), 'threeview_side');
assert.equal(classifyCharacterRef('side.jpg'), 'threeview_side');
assert.equal(classifyCharacterRef('side-best.jpg'), 'threeview_side');

assert.equal(classifyCharacterRef('back.jpg'), 'threeview_back');
assert.equal(classifyCharacterRef('背面.jpg'), 'threeview_back');

assert.equal(classifyCharacterRef('costume-red.jpg'), 'costume');
assert.equal(classifyCharacterRef('outfit.png'), 'costume');
assert.equal(classifyCharacterRef('换装-冬.jpg'), 'costume');
assert.equal(classifyCharacterRef('look-summer.jpg'), 'costume');

assert.equal(classifyCharacterRef('scene-wide-beach.jpg'), 'scene');
assert.equal(classifyCharacterRef('场景.jpg'), 'scene');
assert.equal(classifyCharacterRef('establishing.jpg'), 'scene');
assert.equal(classifyCharacterRef('newface-beach A.jpg'), 'scene');

assert.equal(classifyCharacterRef('random.png'), 'unknown');
assert.equal(classifyCharacterRef(''), 'unknown');
assert.equal(classifyCharacterRef(null), 'unknown');

// meta.role overrides path guess
assert.equal(classifyCharacterRef({ path: 'still-B.jpg', role: 'costume' }), 'costume');
assert.equal(classifyCharacterRef({ path: 'look-summer.jpg', role: 'face_closeup' }), 'face_closeup');

// faceBox promotion when path is otherwise unknown
assert.equal(
  classifyCharacterRef({
    path: 'portrait.png',
    width: 800,
    height: 800,
    faceBox: { width: 200, height: 320 },
  }),
  'face_closeup',
);

// explicit scene path wins over a large faceBox
assert.equal(
  classifyCharacterRef({
    path: 'scene-wide.png',
    width: 1920,
    height: 1080,
    faceBox: { width: 400, height: 400 },
  }),
  'scene',
);

// --- buildCharacterConsistencyPack: reject without face ---
{
  const empty = buildCharacterConsistencyPack([]);
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /近脸|锁脸|人脸|参考/);

  const noFace = buildCharacterConsistencyPack([
    { path: 'scene-wide.jpg' },
    { path: 'look-summer.jpg' },
  ]);
  assert.equal(noFace.ok, false);
  assert.match(noFace.reason, /近脸|锁脸|人脸|参考/);
  assert.equal(noFace.pack.primaryFace, null);
  assert.ok(Array.isArray(noFace.pack.costumes) && noFace.pack.costumes.length === 1);
  assert.match(formatCharacterPackReport(noFace), /未通过/);
}

// --- pack ordering + identity lock + warnings ---
{
  const result = buildCharacterConsistencyPack([
    { path: 'look-summer.jpg' },
    { path: 'scene-wide.jpg' },
    { path: 'still-B.jpg' },
    { path: 'threeview-A.jpg' },
    { path: 'threeview-C.jpg' },
    { path: 'back.jpg' },
    { path: './still-B.jpg' },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.pack.primaryFace.path, 'still-B.jpg');
  assert.equal(result.pack.primaryFace.role, 'face_closeup');

  const roles = result.pack.orderedRefs.map((r) => r.role);
  assert.deepEqual(roles, [
    'face_closeup',
    'threeview_front',
    'threeview_side',
    'threeview_back',
    'costume',
    'scene',
  ]);
  const paths = result.pack.orderedRefs.map((r) => r.path);
  assert.ok(paths.indexOf('still-B.jpg') < paths.indexOf('look-summer.jpg'), 'costume after face');
  assert.equal(paths[paths.length - 1], 'scene-wide.jpg');
  assert.equal(paths.filter((p) => path.normalize(p.replace(/\\/g, '/')).endsWith('still-B.jpg')).length, 1);

  assert.match(result.pack.identityLockText, /face|identity|Identity/i);
  assert.match(result.pack.identityLockText, /脸|人物一致/);
  assert.match(result.pack.identityLockText, /Picture 1/);
  assert.match(result.pack.identityLockText, /bone structure|骨骼|eyes|眼睛|nose|鼻子|mouth|嘴巴|hairline|发际/);

  assert.equal(result.pack.threeview.front.path, 'threeview-A.jpg');
  assert.equal(result.pack.threeview.side.path, 'threeview-C.jpg');
  assert.equal(result.pack.threeview.back.path, 'back.jpg');
  assert.equal(result.pack.costumes.length, 1);
  assert.equal(result.pack.scenes.length, 1);
  assert.ok(Array.isArray(result.pack.warnings));

  const report = formatCharacterPackReport(result);
  assert.match(report, /人物一致性包：通过/);
  assert.match(report, /主锁脸/);
  assert.match(report, /身份锁定词/);
}

// missing three-view → warnings, not hard fail when face lock present
{
  const onlyFace = buildCharacterConsistencyPack([{ path: 'ref-crop.jpg' }]);
  assert.equal(onlyFace.ok, true);
  assert.ok(onlyFace.pack.warnings.some((w) => /正面|三视图/.test(w)));
  assert.ok(onlyFace.pack.warnings.some((w) => /侧面/.test(w)));
}

// prefer a close-up that passes assessFaceCloseUpRef when dimensions exist
{
  const result = buildCharacterConsistencyPack([
    { path: 'maybe-face.jpg', role: 'face_closeup', width: 1920, height: 1080 },
    { path: 'still-B.jpg', width: 768, height: 1200, faceBox: { width: 400, height: 500 } },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.pack.primaryFace.path, 'still-B.jpg');
}

// string entries accepted
{
  const result = buildCharacterConsistencyPack(['still-B.jpg', 'look-red.jpg']);
  assert.equal(result.ok, true);
  assert.equal(result.pack.orderedRefs[0].role, 'face_closeup');
  assert.equal(result.pack.orderedRefs[1].role, 'costume');
}

// listCharacterRefPaths: image extensions only
{
  const dir = mkdtempSync(path.join(tmpdir(), 'mv-char-pack-'));
  try {
    writeFileSync(path.join(dir, 'still-B.jpg'), '');
    writeFileSync(path.join(dir, 'scene-wide.png'), '');
    writeFileSync(path.join(dir, 'notes.txt'), 'ignore');
    const found = listCharacterRefPaths(dir);
    assert.equal(found.length, 2);
    assert.ok(found.some((p) => p.endsWith('still-B.jpg')));
    assert.ok(found.some((p) => p.endsWith('scene-wide.png')));
    assert.ok(!found.some((p) => p.endsWith('notes.txt')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


// --- applyCharacterPackToAssets: scene category hints role ---
{
  const applied = applyCharacterPackToAssets([
    { path: 'still-B.jpg', category: '人物' },
    { path: 'bg.jpg', category: '场景' },
  ]);
  assert.equal(applied.ok, true);
  const scenes = applied.packResult.pack.scenes || [];
  assert.ok(scenes.some((ref) => String(ref.path).endsWith('bg.jpg')));
  const bg = (applied.packResult.pack.orderedRefs || []).find((ref) => String(ref.path).endsWith('bg.jpg'));
  assert.equal(bg?.role, 'scene');
}

// --- applyCharacterPackToAssets: reorder face → costume → scene ---
{
  const applied = applyCharacterPackToAssets([
    { path: 'look-summer.jpg', category: '人物' },
    { path: 'scene-wide.jpg', category: '场景' },
    { path: 'still-B.jpg', category: '人物' },
  ]);
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.assets.map((asset) => asset.path), [
    'still-B.jpg',
    'look-summer.jpg',
    'scene-wide.jpg',
  ]);
}

// --- applyCharacterPackToAssets: no face lock keeps input order ---
{
  const input = [
    { path: 'scene-wide.jpg', category: '场景' },
    { path: 'look-summer.jpg', category: '人物' },
  ];
  const applied = applyCharacterPackToAssets(input);
  assert.equal(applied.ok, false);
  assert.match(applied.reason, /近脸|锁脸/);
  assert.deepEqual(applied.assets.map((asset) => asset.path), [
    'scene-wide.jpg',
    'look-summer.jpg',
  ]);
}

// --- applyCharacterPackToAssets: cap 9 keeps face lock, drops later scenes ---
{
  const input = [{ path: 'still-B.jpg', category: '人物' }];
  for (let i = 1; i <= 9; i++) {
    input.push({ path: `scene-0${i}.jpg`, category: '场景' });
  }
  const applied = applyCharacterPackToAssets(input);
  assert.equal(applied.ok, true);
  assert.equal(applied.assets.length, 9);
  assert.equal(applied.assets[0].path, 'still-B.jpg');
  assert.ok(!applied.assets.some((asset) => asset.path === 'scene-09.jpg'));
}

// --- applyCharacterPackToAssets: preserve original asset fields ---
{
  const applied = applyCharacterPackToAssets([
    { path: 'still-B.jpg', category: '人物', description: 'bust', id: 'keep-me' },
  ]);
  assert.equal(applied.ok, true);
  assert.equal(applied.assets[0].description, 'bust');
  assert.equal(applied.assets[0].id, 'keep-me');
}

// --- appendIdentityLockToPrompt ---
{
  const prompt = 'detailed_description:\nshot here\noverall_soundscape:\n音';
  const lock = 'Identity lock / 人物一致性：Keep the face.';
  const once = appendIdentityLockToPrompt(prompt, lock);
  const marker = '\noverall_soundscape:';
  const index = once.indexOf(marker);
  assert.ok(index > 0);
  assert.equal(once.slice(index, index + marker.length), marker);
  const lineBefore = once.slice(0, index).split('\n').pop();
  assert.equal(lineBefore, lock);
  assert.equal(appendIdentityLockToPrompt(once, lock), once);
  assert.equal(appendIdentityLockToPrompt(prompt, ''), prompt);
  assert.equal(appendIdentityLockToPrompt(prompt, '   '), prompt);
  assert.equal(appendIdentityLockToPrompt('', lock), '');
}

console.log('test-mv-character-consistency: ok');
