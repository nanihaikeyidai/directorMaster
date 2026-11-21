// 口型试片提交 RunningHub 前的预检：钱包余额 + 每日配额 + 不连环烧币。
// 纯函数、无 node: 依赖、无网络；账户数据由调用方（CLI 只读 accountStatus 或离线 JSON）注入。

/** 实测 15s 试片消耗 312 / 356 币，留余量 */
export const DEFAULT_LIPSYNC_MIN_COINS = 400;
export const LIPSYNC_FAILURE_KINDS = Object.freeze(['technical', 'selection', 'reference']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} raw accountStatus 原始响应或其 data
 */
export function normalizeRhAccount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const remainCoins = toNum(data.remainCoins);
  const remainMoney = toNum(data.remainMoney);
  if (remainCoins === null && remainMoney === null) return null;
  const acc = {
    remainCoins,
    remainMoney,
    apiType: data.apiType ? String(data.apiType) : null,
  };
  // remainPoint 缺失不等于 0：旧账户只有币时不要带上该字段。
  if (data.remainPoint !== undefined && data.remainPoint !== null && data.remainPoint !== '') {
    const remainPoint = toNum(data.remainPoint);
    if (remainPoint !== null) acc.remainPoint = remainPoint;
  }
  return acc;
}

/** 可消费余额：remainPoint 在场（含 0）只用积分；否则回退 remainCoins。禁止相加。 */
export function rhSpendable(account) {
  const acc = account && typeof account === 'object' && ('remainCoins' in account || 'remainMoney' in account || 'remainPoint' in account)
    ? account
    : normalizeRhAccount(account);
  if (!acc) return null;
  if (Object.prototype.hasOwnProperty.call(acc, 'remainPoint') && acc.remainPoint !== null && acc.remainPoint !== undefined) {
    return { amount: acc.remainPoint, unit: 'points', label: '积分' };
  }
  return { amount: acc.remainCoins ?? 0, unit: 'coins', label: '币' };
}

/** 费用优先 chargedPoint，否则 consumeCoins；保留 costCoins 字段名，不编汇率。 */
export function pickRhJobCost(source) {
  if (!source || typeof source !== 'object') return { costCoins: undefined, source: null };
  const item = Array.isArray(source.data) ? source.data[0] : source;
  if (!item || typeof item !== 'object') return { costCoins: undefined, source: null };
  const settleMode = item.settleMode == null || item.settleMode === '' ? undefined : String(item.settleMode);
  const charged = toNum(item.chargedPoint);
  if (charged !== null) return { costCoins: charged, source: 'chargedPoint', settleMode };
  const coins = toNum(item.consumeCoins);
  if (coins !== null) return { costCoins: coins, source: 'consumeCoins', settleMode };
  return { costCoins: undefined, source: null, settleMode };
}

export function checkLipsyncBudget({ account, minCoins } = {}) {
  const min = toNum(minCoins) ?? DEFAULT_LIPSYNC_MIN_COINS;
  const acc = normalizeRhAccount(account);
  if (!acc) {
    return { ok: false, code: 'NO_ACCOUNT', minCoins: min, reason: '未取得 RunningHub 账户余额（需 --account-json 或 RUNNINGHUB_API_KEY），不提交试片' };
  }
  const spendable = rhSpendable(acc);
  const amount = spendable.amount;
  const unit = spendable.label;
  if (amount < min) {
    const money = acc.remainMoney === null ? '' : `，remainMoney=${acc.remainMoney}`;
    return {
      ok: false,
      code: 'INSUFFICIENT_COINS',
      minCoins: min,
      account: acc,
      reason: `RunningHub 钱包余额 ${amount} ${unit}${money}，低于单次 15s 试片门槛 ${min} ${unit}，跳过试片`,
    };
  }
  return { ok: true, code: null, minCoins: min, account: acc, reason: `钱包余额 ${amount} ${unit} ≥ 门槛 ${min} ${unit}` };
}

export function checkLipsyncDailyQuota({ ledger, date, maxSuccess = 1, maxTechRetries = 1 } = {}) {
  const today = (Array.isArray(ledger) ? ledger : []).filter((e) => e && e.date === date);
  const successes = today.filter((e) => e.status === 'success').length;
  const failures = today.filter((e) => e.status === 'failed');
  const nonTech = failures.filter((e) => e.failureKind && e.failureKind !== 'technical');
  const tech = failures.length - nonTech.length;
  const base = { date, successes, technicalFailures: tech, nonTechnicalFailures: nonTech.length };
  if (successes >= maxSuccess) {
    return { ...base, ok: false, code: 'DAILY_SUCCESS_REACHED', reason: `${date} 已有 ${successes} 次成功试片（上限 ${maxSuccess}），不再提交` };
  }
  if (nonTech.length) {
    return { ...base, ok: false, code: 'NON_TECH_FAILURE', reason: `${date} 已因选段/参考图问题（${nonTech.map((e) => e.failureKind).join('、')}）失败，当晚不连环烧币，修流程留到下一晚` };
  }
  if (tech > maxTechRetries) {
    return { ...base, ok: false, code: 'RETRY_EXHAUSTED', reason: `${date} 技术失败 ${tech} 次，已用完首跑 + ${maxTechRetries} 次重试` };
  }
  return { ...base, ok: true, code: null, attemptKind: tech === 0 ? 'first' : 'retry', reason: tech === 0 ? `${date} 首次试片` : `${date} 技术失败后重试（第 ${tech} 次重试）` };
}

export function recordLipsyncAttempt(ledger, entry = {}) {
  const list = Array.isArray(ledger) ? ledger : [];
  if (!DATE_RE.test(String(entry.date || ''))) throw new Error('recordLipsyncAttempt: date 需为 YYYY-MM-DD');
  if (entry.status !== 'success' && entry.status !== 'failed') throw new Error('recordLipsyncAttempt: status 需为 success | failed');
  if (entry.status === 'failed' && !LIPSYNC_FAILURE_KINDS.includes(entry.failureKind)) {
    throw new Error(`recordLipsyncAttempt: failed 需带 failureKind（${LIPSYNC_FAILURE_KINDS.join(' | ')}）`);
  }
  const clean = { date: entry.date, status: entry.status };
  if (entry.status === 'failed') clean.failureKind = entry.failureKind;
  if (entry.taskId) clean.taskId = String(entry.taskId);
  if (entry.workflowId) clean.workflowId = String(entry.workflowId);
  if (toNum(entry.coins) !== null) clean.coins = toNum(entry.coins);
  if (entry.note) clean.note = String(entry.note);
  return [...list, clean];
}

export function planLipsyncPreflight({ trialPlan, account, ledger, date, minCoins, maxSuccess, maxTechRetries } = {}) {
  const trial = trialPlan && trialPlan.ok
    ? { ok: true, code: null, reason: trialPlan.reason }
    : { ok: false, code: 'TRIAL_GATE', reason: trialPlan?.reason || '缺少口型试片计划（先跑 mv-lipsync-prep）' };
  const budget = checkLipsyncBudget({ account, minCoins });
  const quota = checkLipsyncDailyQuota({ ledger, date, maxSuccess, maxTechRetries });
  const failed = [trial, budget, quota].filter((c) => !c.ok);
  const codes = failed.map((c) => c.code);
  return {
    go: failed.length === 0,
    mode: failed.length === 0 ? 'go' : 'skip',
    codes,
    workflowId: trialPlan?.workflowId,
    checks: { trial, budget, quota },
    reason: failed.length === 0
      ? `可提交（${quota.attemptKind === 'retry' ? '技术重试' : '首跑'}）：${budget.reason}`
      : `跳过试片：${failed.map((c) => c.reason).join('；')}`,
  };
}
