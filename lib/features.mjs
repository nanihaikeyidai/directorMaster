// MV Master feature flags. Short-drama (导演画布/短剧/剧集/声音克隆/台词重配) is hidden by default.
// Re-enable: set NEXT_PUBLIC_FEATURE_SHORT_DRAMA=1 (or "true") before `npm run dev` / `npm run build`.
export const PRODUCT_NAME = 'MV Master';
export function isShortDramaEnabled(env = (typeof process !== 'undefined' ? process.env : {})) {
  const v = String(env?.NEXT_PUBLIC_FEATURE_SHORT_DRAMA ?? env?.FEATURE_SHORT_DRAMA ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}
export function navItems(enabled = isShortDramaEnabled()) {
  const items = [{ href: '/', label: 'MV 制作' }];
  if (enabled) items.push({ href: '/drama', label: '导演画布' }, { href: '/voice', label: '声音克隆' }, { href: '/redub', label: '台词重配' });
  return items;
}
