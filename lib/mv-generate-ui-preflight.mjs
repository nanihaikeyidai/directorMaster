// MV 页「一键云端出完整 MV」/「云端批量生成」的预算预估与硬门禁适配。
// 纯函数、无 node: 依赖：不查磁盘、不发网络；账户由页面注入。
import { planMvGeneratePreflight } from './mv-generate-preflight.mjs';

const UI_AUDIO_PATH = 'ui://segment-audio';
const UI_PICTURE_PATH = 'ui://picture';

export function mapUiAccount(account) {
  if (account === null || account === undefined) return null;
  return {
    remainCoins: account.coins,
    remainMoney: account.walletBalance,
  };
}

export function buildMvGenerateUiManifest({ segments, prompts, visualAssets, indexes } = {}) {
  const list = Array.isArray(segments) ? segments : [];
  const selected = Array.isArray(indexes)
    ? indexes.filter((i) => Number.isInteger(Number(i)) && Number(i) >= 0 && Number(i) < list.length).map((i) => Number(i))
    : list.map((_, i) => i);
  const manifestSegments = selected.map((i) => {
    const seg = list[i] || {};
    return {
      index: seg.index ?? i + 1,
      duration: seg.duration,
      prompt: Array.isArray(prompts) ? prompts[i] : undefined,
      path: UI_AUDIO_PATH,
    };
  });
  const pictures = (Array.isArray(visualAssets) ? visualAssets : [])
    .filter((asset) => asset && asset.mediaType !== 'audio')
    .map((asset) => ({
      ...asset,
      path: asset.path || asset.id || UI_PICTURE_PATH,
    }));
  return { segments: manifestSegments, visualAssets: pictures };
}

export function planMvGenerateUiPreflight({
  segments,
  prompts,
  visualAssets,
  account,
  indexes,
  coinsPerSec,
  reserveCoins,
  maxSegmentSec,
} = {}) {
  return planMvGeneratePreflight({
    manifest: buildMvGenerateUiManifest({ segments, prompts, visualAssets, indexes }),
    account: mapUiAccount(account),
    exists: (p) => Boolean(p),
    requireAccount: true,
    coinsPerSec,
    reserveCoins,
    maxSegmentSec,
  });
}

export function formatMvGenerateEstimateLabel(plan, { loading } = {}) {
  if (loading) return '预估 … · 钱包读取中';
  const total = plan?.estimate?.total;
  const n = plan?.estimate?.perSegment?.length ?? 0;
  if (!Number.isFinite(Number(total))) return '预估 …';
  const head = `预估 ${total} 币（${n} 段）`;
  const hasAccount = Boolean(plan?.budget?.account) && plan?.budget?.code !== 'NO_ACCOUNT';
  if (!hasAccount) return `${head} · 钱包未读取`;
  const coins = plan.budget.account.remainCoins ?? 0;
  const wallet = `钱包 ${coins} 币`;
  if (plan.budget?.code === 'INSUFFICIENT_COINS' || (Array.isArray(plan.codes) && plan.codes.includes('INSUFFICIENT_COINS'))) {
    return `${head} · ${wallet}，余额不足`;
  }
  if (!plan.go) return `${head} · ${wallet}，无法提交`;
  return `${head} · ${wallet}`;
}
