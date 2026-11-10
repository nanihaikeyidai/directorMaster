/**
 * Pure character-consistency pack: classify 定妆/三视图/换装/场景 refs,
 * require a close-up face lock, order them for Ref2VA, emit identity-lock text.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { assessFaceCloseUpRef } from './mv-lipsync-prep.mjs';

/** @typedef {import('./mv-character-consistency.d.ts').CharacterRefRole} CharacterRefRole */
/** @typedef {import('./mv-character-consistency.d.ts').CharacterRefInput} CharacterRefInput */
/** @typedef {import('./mv-character-consistency.d.ts').CharacterRef} CharacterRef */
/** @typedef {import('./mv-character-consistency.d.ts').CharacterConsistencyResult} CharacterConsistencyResult */

export const CHARACTER_REF_ROLES = Object.freeze([
  'face_closeup',
  'threeview_front',
  'threeview_side',
  'threeview_back',
  'costume',
  'scene',
  'unknown',
]);

const ROLE_SET = new Set(CHARACTER_REF_ROLES);
const FACE_CLOSEUP_RE = /(ref-crop|still-b|threeview[-_ ]?b\b|close-?up|face-?front|bust|胸像|近脸)/i;
const COSTUME_RE = /(costume|outfit|换装|look-)/i;
const SCENE_RE = /(scene|场景|wide|远景|establishing)/i;
const BEACH_RE = /(beach|海滩|海边)/i;
const THREEVIEW_FRONT_RE = /(threeview[-_ ]?a\b|stills?[-_ ]?a\b|(?:^|[-_ /])front(?:[-_.]|$))/i;
const THREEVIEW_SIDE_RE = /(threeview[-_ ]?c\b|stills?[-_ ]?c\b|side-best|(?:^|[-_ /])side(?:[-_.]|$))/i;
const THREEVIEW_BACK_RE = /((?:^|[-_ /])back(?:[-_.]|$)|背)/i;
const LETTER_VIEW_RE = /(?:^|[-_ /])([ABC])(?:\.[a-z0-9]+)?$/i;
export const CHARACTER_REF_IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;

/**
 * @param {unknown} pathOrMeta
 * @returns {string}
 */
function rawPathOf(pathOrMeta) {
  if (typeof pathOrMeta === 'string') return pathOrMeta;
  if (pathOrMeta && typeof pathOrMeta === 'object' && typeof pathOrMeta.path === 'string') {
    return pathOrMeta.path;
  }
  return '';
}

/**
 * @param {string} value
 */
function pathForMatch(value) {
  return String(value || '').replace(/\\/g, '/');
}

/**
 * @param {string} value
 */
export function normalizeRefPath(value) {
  return path.normalize(pathForMatch(value));
}

/**
 * @param {unknown} pathOrMeta
 * @returns {CharacterRefInput}
 */
function normalizeRefInput(pathOrMeta) {
  if (typeof pathOrMeta === 'string') return { path: pathOrMeta };
  if (!pathOrMeta || typeof pathOrMeta !== 'object') return { path: '' };
  /** @type {CharacterRefInput} */
  const out = { path: typeof pathOrMeta.path === 'string' ? pathOrMeta.path : '' };
  if (typeof pathOrMeta.role === 'string') out.role = pathOrMeta.role;
  const width = Number(pathOrMeta.width);
  const height = Number(pathOrMeta.height);
  if (Number.isFinite(width) && width > 0) out.width = width;
  if (Number.isFinite(height) && height > 0) out.height = height;
  if (pathOrMeta.faceBox && typeof pathOrMeta.faceBox === 'object') out.faceBox = pathOrMeta.faceBox;
  return out;
}

/**
 * @param {CharacterRefInput} meta
 * @returns {number | undefined}
 */
function faceHeightRatioFrom(meta) {
  const height = Number(meta.height);
  const box = meta.faceBox;
  if (!box || !(height > 0)) return undefined;
  if (typeof box.height === 'number' && Number.isFinite(box.height)) {
    return box.height / height;
  }
  if (typeof box.top === 'number' && typeof box.bottom === 'number') {
    return (box.bottom - box.top) / height;
  }
  return undefined;
}

/**
 * @param {string} filePath
 */
function letterViewOf(filePath) {
  const normalized = pathForMatch(filePath);
  const base = normalized.split('/').pop() || normalized;
  const match = base.match(LETTER_VIEW_RE) || normalized.match(LETTER_VIEW_RE);
  return match ? match[1].toUpperCase() : '';
}

/**
 * @param {string} filePath
 */
function isPathHeuristicFaceCloseup(filePath) {
  const normalized = pathForMatch(filePath);
  if (FACE_CLOSEUP_RE.test(normalized)) return true;
  return letterViewOf(normalized) === 'B' && !COSTUME_RE.test(normalized) && !SCENE_RE.test(normalized);
}

/**
 * Classify a character/scene reference by path heuristics and optional meta.
 * @param {string | CharacterRefInput | null | undefined} pathOrMeta
 * @returns {CharacterRefRole}
 */
export function classifyCharacterRef(pathOrMeta) {
  const meta = normalizeRefInput(pathOrMeta);
  if (typeof meta.role === 'string' && ROLE_SET.has(meta.role)) {
    return /** @type {CharacterRefRole} */ (meta.role);
  }

  const filePath = rawPathOf(pathOrMeta);
  const normalized = pathForMatch(filePath);
  if (!normalized) return 'unknown';

  if (FACE_CLOSEUP_RE.test(normalized)) return 'face_closeup';
  if (COSTUME_RE.test(normalized)) return 'costume';
  if (SCENE_RE.test(normalized)) return 'scene';

  const letter = letterViewOf(normalized);
  if (letter === 'A' && BEACH_RE.test(normalized)) return 'scene';

  if (THREEVIEW_FRONT_RE.test(normalized) || letter === 'A') return 'threeview_front';
  if (THREEVIEW_SIDE_RE.test(normalized) || letter === 'C') return 'threeview_side';
  if (THREEVIEW_BACK_RE.test(normalized)) return 'threeview_back';
  if (letter === 'B') return 'face_closeup';

  if (meta.width && meta.height) {
    const assessed = assessFaceCloseUpRef({
      path: filePath,
      width: meta.width,
      height: meta.height,
      faceHeightRatio: faceHeightRatioFrom(meta),
    });
    if (assessed.ok) return 'face_closeup';
  }

  return 'unknown';
}

/**
 * @param {CharacterRef} ref
 * @returns {boolean | null}
 */
function passesCloseUpGate(ref) {
  const width = Number(ref.width);
  const height = Number(ref.height);
  if (!(width > 0 && height > 0)) return null;
  return assessFaceCloseUpRef({
    path: ref.path,
    width,
    height,
    faceHeightRatio: faceHeightRatioFrom(ref),
  }).ok;
}

/**
 * @param {CharacterRef[]} classified
 * @returns {CharacterRef | null}
 */
function pickPrimaryFace(classified) {
  const faceRefs = classified.filter((ref) => ref.role === 'face_closeup');
  for (const ref of faceRefs) {
    if (passesCloseUpGate(ref) === true) return ref;
  }
  for (const ref of faceRefs) {
    if (isPathHeuristicFaceCloseup(ref.path)) return ref;
  }
  if (faceRefs.length) return faceRefs[0];

  for (const ref of classified) {
    if (isPathHeuristicFaceCloseup(ref.path)) {
      return { ...ref, role: 'face_closeup' };
    }
  }
  return null;
}

/**
 * @param {CharacterRef[]} classified
 */
function collectThreeview(classified) {
  const pick = (role) => classified.find((ref) => ref.role === role) || null;
  return {
    front: pick('threeview_front'),
    side: pick('threeview_side'),
    back: pick('threeview_back'),
  };
}

/**
 * @param {CharacterRef | null} primaryFace
 * @param {CharacterRef[]} classified
 */
function orderRefs(primaryFace, classified) {
  /** @type {CharacterRef[]} */
  const ordered = [];
  const used = new Set();
  const push = (ref) => {
    if (!ref || !ref.path) return;
    const key = normalizeRefPath(ref.path);
    if (!key || used.has(key)) return;
    used.add(key);
    ordered.push(ref);
  };

  if (primaryFace) push(primaryFace);
  for (const ref of classified) if (ref.role === 'face_closeup') push(ref);
  for (const role of ['threeview_front', 'threeview_side', 'threeview_back', 'costume']) {
    for (const ref of classified) if (ref.role === role) push(ref);
  }
  for (const ref of classified) if (ref.role === 'unknown') push(ref);
  for (const ref of classified) if (ref.role === 'scene') push(ref);
  return ordered;
}

/**
 * @param {CharacterRef} primaryFace
 * @param {CharacterRef[]} orderedRefs
 */
function buildIdentityLockText(primaryFace, orderedRefs) {
  const index = orderedRefs.findIndex(
    (ref) => normalizeRefPath(ref.path) === normalizeRefPath(primaryFace.path),
  );
  const pictureN = index >= 0 ? index + 1 : 1;
  const name = pathForMatch(primaryFace.path).split('/').pop() || 'primary face';
  return [
    'Identity lock / 人物一致性：Keep the exact same face identity, bone structure, eyes, nose, mouth, and hairline across all costume changes.',
    'Do not invent a second person.',
    `Makeup and facial features must stay consistent with Picture ${pictureN} (primary face lock / 主锁脸参考：${name}).`,
    `换装后仍须保持同一张脸的骨骼结构、眼睛、鼻子、嘴巴与发际线，禁止另造第二人；妆面与五官与 Picture ${pictureN} 保持一致。`,
  ].join(' ');
}

/**
 * @param {{ front: CharacterRef | null, side: CharacterRef | null, back: CharacterRef | null }} threeview
 */
function threeviewWarnings(threeview) {
  /** @type {string[]} */
  const warnings = [];
  if (!threeview.front) warnings.push('缺少三视图正面（A / front），建议补 still-A 或 threeview-A。');
  if (!threeview.side) warnings.push('缺少三视图侧面（C / side），建议补 still-C 或 threeview-C。');
  if (!threeview.back) warnings.push('缺少三视图背面（back），完整三视图更有利于人物一致性。');
  return warnings;
}

/**
 * @param {Array<string | CharacterRefInput> | null | undefined} refs
 * @param {Record<string, unknown>} [opts]
 * @returns {CharacterConsistencyResult}
 */
export function buildCharacterConsistencyPack(refs, opts = {}) {
  void opts;
  const list = Array.isArray(refs) ? refs : [];
  /** @type {CharacterRef[]} */
  const classified = [];
  const seen = new Set();
  for (const raw of list) {
    const input = normalizeRefInput(raw);
    const key = normalizeRefPath(input.path);
    if (!input.path || seen.has(key)) continue;
    seen.add(key);
    const role = classifyCharacterRef(input);
    /** @type {CharacterRef} */
    const item = { path: input.path, role };
    if (input.width) item.width = input.width;
    if (input.height) item.height = input.height;
    if (input.faceBox) item.faceBox = input.faceBox;
    classified.push(item);
  }

  const threeview = collectThreeview(classified);
  const costumes = classified.filter((ref) => ref.role === 'costume');
  const scenes = classified.filter((ref) => ref.role === 'scene');
  const warnings = threeviewWarnings(threeview);
  const primaryFace = pickPrimaryFace(classified);
  const orderedRefs = orderRefs(primaryFace, classified);

  if (!primaryFace) {
    const reason = '缺少可用的近脸锁脸参考。请提供 still-B、ref-crop、face-front 或近脸/胸像特写，以便换装后保持同一张脸。';
    return {
      ok: false,
      reason,
      pack: {
        primaryFace: null,
        threeview,
        costumes,
        scenes,
        orderedRefs,
        identityLockText: '',
        warnings,
      },
      summary: '人物一致性包不可用：缺少近脸锁脸参考。',
    };
  }

  const identityLockText = buildIdentityLockText(primaryFace, orderedRefs);
  const viewBits = [
    threeview.front ? '正面' : null,
    threeview.side ? '侧面' : null,
    threeview.back ? '背面' : null,
  ].filter(Boolean);
  const viewText = viewBits.length ? viewBits.join('+') : '未提供';
  const summary = `人物一致性包可用：主锁脸 ${pathForMatch(primaryFace.path).split('/').pop()}，三视图 ${viewText}，换装 ${costumes.length} 张。`;

  return {
    ok: true,
    reason: summary,
    pack: {
      primaryFace,
      threeview,
      costumes,
      scenes,
      orderedRefs,
      identityLockText,
      warnings,
    },
    summary,
  };
}

/**
 * @param {CharacterConsistencyResult} result
 */
export function formatCharacterPackReport(result) {
  const lines = [];
  lines.push(result?.ok ? '人物一致性包：通过' : '人物一致性包：未通过');
  if (result?.reason) lines.push('理由：' + result.reason);
  if (result?.summary && result.summary !== result.reason) lines.push('摘要：' + result.summary);
  const pack = result?.pack || {};
  if (pack.primaryFace) {
    lines.push('主锁脸：' + pack.primaryFace.path + '（' + pack.primaryFace.role + '）');
  } else {
    lines.push('主锁脸：无');
  }
  const threeview = pack.threeview || {};
  const label = (ref) => ref?.path || '缺失';
  lines.push('三视图：正面 ' + label(threeview.front) + ' / 侧面 ' + label(threeview.side) + ' / 背面 ' + label(threeview.back));
  const costumes = pack.costumes || [];
  lines.push('换装：' + (costumes.length ? costumes.map((item) => item.path).join('、') : '无'));
  const scenes = pack.scenes || [];
  lines.push('场景：' + (scenes.length ? scenes.map((item) => item.path).join('、') : '无'));
  if (Array.isArray(pack.orderedRefs) && pack.orderedRefs.length) {
    lines.push('参考顺序：');
    pack.orderedRefs.forEach((ref, index) => {
      lines.push('  ' + (index + 1) + '. [' + ref.role + '] ' + ref.path);
    });
  }
  if (pack.identityLockText) lines.push('身份锁定词：' + pack.identityLockText);
  if (Array.isArray(pack.warnings) && pack.warnings.length) {
    lines.push('警告：');
    for (const warning of pack.warnings) lines.push('  - ' + warning);
  }
  return lines.join('\n');
}

/**
 * List common image refs in a folder (non-recursive, sorted).
 * @param {string} dir
 * @returns {string[]}
 */
export function listCharacterRefPaths(dir) {
  if (!dir || !existsSync(dir)) return [];
  /** @type {string[]} */
  const found = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    if (CHARACTER_REF_IMAGE_RE.test(name)) found.push(full);
  }
  found.sort((a, b) => a.localeCompare(b));
  return found;
}

/**
 * Map visual assets into a character consistency pack, reorder by pack
 * priority, and cap after packing (default 9).
 * @param {Array<{ path?: string, category?: string, role?: string, width?: number, height?: number, faceBox?: object }>} assets
 * @param {{ maxRefs?: number }} [opts]
 * @returns {{ ok: boolean, reason: string, assets: object[], packResult: CharacterConsistencyResult }}
 */
export function applyCharacterPackToAssets(assets, opts = {}) {
  const maxRefs = Number.isFinite(Number(opts.maxRefs)) ? Number(opts.maxRefs) : 9;
  const list = Array.isArray(assets) ? assets : [];
  const refs = list.map((asset) => {
    const role = asset?.role || (asset?.category === '场景' ? 'scene' : undefined);
    const input = { path: asset?.path, role };
    if (asset?.width) input.width = asset.width;
    if (asset?.height) input.height = asset.height;
    if (asset?.faceBox) input.faceBox = asset.faceBox;
    return input;
  });
  const packResult = buildCharacterConsistencyPack(refs);
  if (!packResult.ok) {
    return { ok: false, reason: packResult.reason, assets: list, packResult };
  }
  const byPath = new Map();
  for (const asset of list) {
    const key = normalizeRefPath(asset?.path);
    if (key && !byPath.has(key)) byPath.set(key, asset);
  }
  const ordered = [];
  const seen = new Set();
  for (const ref of packResult.pack.orderedRefs || []) {
    const key = normalizeRefPath(ref.path);
    const asset = byPath.get(key);
    if (!asset || seen.has(key)) continue;
    seen.add(key);
    ordered.push(asset);
    if (ordered.length >= maxRefs) break;
  }
  return { ok: true, reason: packResult.reason, assets: ordered, packResult };
}

/**
 * Insert identity-lock text as its own line immediately before overall_soundscape.
 * Idempotent: existing lock text is left unchanged.
 * @param {string | null | undefined} prompt
 * @param {string | null | undefined} identityLockText
 * @returns {string}
 */
export function appendIdentityLockToPrompt(prompt, identityLockText) {
  const src = prompt == null ? '' : String(prompt);
  const text = String(identityLockText || '').trim();
  if (!src) return src;
  if (!text) return src;
  if (src.includes(text) || src.includes('Identity lock / 人物一致性')) return src;
  const marker = '\noverall_soundscape:';
  const index = src.indexOf(marker);
  if (index >= 0) return src.slice(0, index) + '\n' + text + src.slice(index);
  return src + '\n' + text;
}
