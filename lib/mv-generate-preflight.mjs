// MV 云端整片生成（mv-generate --watch）提交 RunningHub 前的预检。
// 纯函数、无 node: 依赖、无网络：文件存在性由调用方注入 exists，账户由调用方只读查询后注入。
import { normalizeRhAccount, rhSpendable } from './mv-lipsync-preflight.mjs';

/** 实测 15s 试片 312 / 356 币 ≈ 23.7 币/秒，取 24 */
export const DEFAULT_MV_COINS_PER_SEC = 24;
export const MV_MAX_SEGMENT_SEC = 15;

const label = (seg, i) => `seg${String(seg?.index ?? i + 1).padStart(2, '0')}`;
const pictureAssets = (manifest) => (manifest?.visualAssets || []).filter((a) => a && a.mediaType !== 'audio');

export function estimateMvGenerateCoins(segments, { coinsPerSec = DEFAULT_MV_COINS_PER_SEC, maxSegmentSec = MV_MAX_SEGMENT_SEC } = {}) {
  const cps = Number.isFinite(Number(coinsPerSec)) && Number(coinsPerSec) > 0 ? Number(coinsPerSec) : DEFAULT_MV_COINS_PER_SEC;
  const perSegment = (Array.isArray(segments) ? segments : []).map((seg, i) => {
    const d = Number(seg?.duration);
    const valid = Number.isFinite(d) && d > 0;
    const duration = valid ? d : maxSegmentSec;
    return { id: label(seg, i), duration, assumed: !valid, coins: Math.ceil(duration * cps) };
  });
  return { coinsPerSec: cps, perSegment, total: perSegment.reduce((s, x) => s + x.coins, 0) };
}

export function validateMvGenerateInputs(manifest, { exists = () => true, maxSegmentSec = MV_MAX_SEGMENT_SEC } = {}) {
  const issues = [];
  const segments = Array.isArray(manifest?.segments) ? manifest.segments : [];
  const pictures = pictureAssets(manifest);
  if (!segments.length) issues.push({ code: 'NO_SEGMENTS', reason: '工程没有分段；先跑 mv-cut' });
  if (!pictures.length) issues.push({ code: 'NO_PICTURES', reason: '没有人物/场景参考图；口型与人物一致性需要近脸参考' });
  for (const p of pictures) {
    if (!p.path || !exists(p.path)) issues.push({ code: 'MISSING_PICTURE', reason: `参考图不存在：${p.path || '(空路径)'}` });
  }
  segments.forEach((seg, i) => {
    const id = label(seg, i);
    if (!String(seg?.prompt || '').trim()) issues.push({ code: 'MISSING_PROMPT', segment: id, reason: `${id} 缺少生成提示词；先 mv-cut --template / 审核提示词` });
    if (!seg?.path || !exists(seg.path)) issues.push({ code: 'MISSING_AUDIO', segment: id, reason: `${id} 分段音频不存在：${seg?.path || '(空路径)'}` });
    const d = Number(seg?.duration);
    if (Number.isFinite(d) && d > maxSegmentSec + 0.05) issues.push({ code: 'SEGMENT_TOO_LONG', segment: id, reason: `${id} 时长 ${d}s 超过单段上限 ${maxSegmentSec}s` });
  });
  return { ok: issues.length === 0, issues };
}

export function planMvGeneratePreflight({
  manifest,
  account,
  exists,
  coinsPerSec,
  reserveCoins = 0,
  requireAccount = true,
  maxSegmentSec = MV_MAX_SEGMENT_SEC,
} = {}) {
  const inputs = validateMvGenerateInputs(manifest, { exists, maxSegmentSec });
  const estimate = estimateMvGenerateCoins(manifest?.segments, { coinsPerSec, maxSegmentSec });
  const reserve = Math.max(0, Number(reserveCoins) || 0);
  const need = estimate.total + reserve;
  let budget = null;
  if (account !== undefined && account !== null) {
    const acc = normalizeRhAccount(account);
    if (!acc) budget = { ok: false, code: 'NO_ACCOUNT', need, reason: 'RunningHub 账户余额响应无法解析，不提交' };
    else {
      const spendable = rhSpendable(acc);
      const amount = spendable.amount;
      const unit = spendable.label;
      const money = acc.remainMoney === null ? '' : `，remainMoney=${acc.remainMoney}`;
      budget = amount < need
        ? { ok: false, code: 'INSUFFICIENT_COINS', need, account: acc, reason: `RunningHub 钱包 ${amount} ${unit}${money}，低于本次预估 ${estimate.total} ${unit}${reserve ? ` + 预留 ${reserve}` : ''}（${estimate.perSegment.length} 段），不提交` }
        : { ok: true, code: null, need, account: acc, reason: `钱包 ${amount} ${unit} ≥ 预估 ${need} ${unit}` };
    }
  } else if (requireAccount) {
    budget = { ok: false, code: 'NO_ACCOUNT', need, reason: '未取得 RunningHub 账户余额（需 RUNNINGHUB_API_KEY 或 --account-json），不提交' };
  }
  const failures = [...inputs.issues.map((i) => ({ code: i.code, reason: i.reason }))];
  if (budget && !budget.ok) failures.push({ code: budget.code, reason: budget.reason });
  const codes = [...new Set(failures.map((f) => f.code))];
  return {
    go: failures.length === 0,
    codes,
    inputs,
    estimate,
    budget,
    reason: failures.length === 0
      ? `可提交：${estimate.perSegment.length} 段，预估 ${estimate.total} ${budget?.account ? (rhSpendable(budget.account)?.label || '币') : '币'}${budget ? `；${budget.reason}` : ''}`
      : `不提交 RunningHub：${failures.map((f) => `[${f.code}] ${f.reason}`).join('；')}`,
  };
}
