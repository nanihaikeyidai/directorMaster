/**
 * Browser-safe MV-page adapter for the character consistency pack.
 * Delegates packing to applyCharacterPackToAssets; no node: imports.
 */

import { applyCharacterPackToAssets } from './mv-character-consistency.mjs';

export const CHARACTER_REF_ROLE_LABELS = Object.freeze({
  face_closeup: '近脸锁脸',
  threeview_front: '三视图正面',
  threeview_side: '三视图侧面',
  threeview_back: '三视图背面',
  costume: '换装',
  scene: '场景',
  unknown: '自动识别',
});

function fileNameOf(value) {
  const raw = String(value || '').replace(/\\/g, '/');
  return raw.split('/').pop() || '';
}

function rolesFrom(applied, assets) {
  const byPath = new Map();
  const pack = applied?.packResult?.pack || {};
  for (const ref of pack.orderedRefs || []) {
    if (ref?.path) byPath.set(ref.path, ref.role);
  }
  const list = Array.isArray(assets) ? assets : [];
  return list.map((asset) => {
    const role =
      asset?.role ||
      byPath.get(asset?.path) ||
      (asset?.category === '场景' ? 'scene' : 'unknown');
    return { path: asset?.path, id: asset?.id, role };
  });
}

/**
 * @param {{ visualAssets?: object[] }} [input]
 */
export function planMvCharacterPackUi({ visualAssets } = {}) {
  const list = Array.isArray(visualAssets) ? visualAssets : [];
  if (!list.length) {
    return {
      go: false,
      ok: false,
      code: 'NO_ASSETS',
      reason: '还没有人物或场景参考图。请先上传素材，并把一张近脸/胸像标为近脸锁脸。',
      warnings: [],
      roles: [],
      identityLockText: '',
      orderedAssets: [],
    };
  }
  const applied = applyCharacterPackToAssets(list);
  const pack = applied.packResult?.pack || {};
  if (!applied.ok) {
    return {
      go: false,
      ok: false,
      code: 'MISSING_FACE_LOCK',
      reason: applied.reason,
      warnings: pack.warnings || [],
      roles: rolesFrom(applied, list),
      identityLockText: '',
      orderedAssets: list,
    };
  }
  return {
    go: true,
    ok: true,
    code: 'OK',
    reason: applied.reason,
    warnings: pack.warnings || [],
    roles: rolesFrom(applied, applied.assets),
    identityLockText: pack.identityLockText || '',
    orderedAssets: applied.assets,
  };
}

/**
 * @param {ReturnType<typeof planMvCharacterPackUi> | null | undefined} plan
 */
export function formatMvCharacterPackLabel(plan) {
  if (!plan || plan.code === 'NO_ASSETS') return '人物一致性：请先上传参考图';
  if (!plan.go || plan.code === 'MISSING_FACE_LOCK') return '人物一致性：缺少近脸锁脸参考';
  const face = plan.orderedAssets?.[0];
  const name = fileNameOf(face?.path || face?.name) || '近脸参考';
  const missingTv = Array.isArray(plan.warnings) && plan.warnings.some((warning) => /三视图/.test(String(warning)));
  return missingTv
    ? `人物一致性：已锁脸 ${name} · 缺三视图`
    : `人物一致性：已锁脸 ${name}`;
}
