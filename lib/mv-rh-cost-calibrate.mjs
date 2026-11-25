// RunningHub 费用观测与预估校准。纯函数、浏览器安全：无 node:、无 fs、无网络。
// 不导入生成或口型预检模块，避免循环依赖。

/** 与生成预检 DEFAULT_MV_COINS_PER_SEC 对齐；此处复制以免循环导入。 */
const FALLBACK_COST_PER_SEC = 24;
/** 与口型预检 DEFAULT_LIPSYNC_MIN_COINS 对齐；未校准时以该模块导出值为准。 */
const FALLBACK_LIPSYNC_MIN_COST = 400;

export const DEFAULT_RH_COST_MARGIN = 1.25;

/** 2026-11-21 像素幻想 15s 实跑：两个输出展示同一 chargedPoint，只记一条。 */
export const SEED_RH_COST_OBSERVATIONS = Object.freeze([
  Object.freeze({
    workflowId: '2087128116820013058',
    durationSec: 15,
    cost: 116.28,
    source: 'chargedPoint',
    settleMode: 'POINT',
    unit: 'points',
    taskId: '2124001118332866561',
    date: '2026-11-21',
    workflowName: '像素幻想 MiniMaxH3ReferenceToVideo',
  }),
  Object.freeze({
    workflowId: '2089048490512052225',
    durationSec: 10,
    cost: 77.05,
    source: 'chargedPoint',
    settleMode: 'POINT',
    unit: 'points',
    taskId: '2124176812794929154',
    date: '2026-11-22',
    workflowName: '迅风幻影自动版',
    note: 'vocal window 176-186s; wallet delta 77.05',
  }),
  Object.freeze({
    workflowId: '2087128116820013058',
    durationSec: 10,
    cost: 82.28,
    source: 'chargedPoint',
    settleMode: 'POINT',
    unit: 'points',
    taskId: '2124900188027047937',
    date: '2026-11-24',
    workflowName: '像素幻想 MiniMaxH3ReferenceToVideo',
    note: 'vocal window 176-186s swimsuit close-up; wallet 325.27→242.99, chargedPoint 82.28, two outputs billed once',
  }),
]);

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeObservation(entry) {
  const workflowId = String(entry?.workflowId || '').trim();
  if (!workflowId) throw new Error('appendCostObservation: workflowId 必填');
  const durationSec = toNum(entry?.durationSec);
  if (!(durationSec > 0)) throw new Error('appendCostObservation: durationSec 须 > 0');
  const cost = toNum(entry?.cost);
  if (cost === null || cost < 0) throw new Error('appendCostObservation: cost 须 >= 0');
  const unit = String(entry?.unit || '').trim();
  if (unit !== 'points' && unit !== 'coins') throw new Error('appendCostObservation: unit 须为 points 或 coins');
  const obs = {
    workflowId,
    durationSec,
    cost,
    unit,
    source: entry?.source != null && entry.source !== '' ? String(entry.source) : 'manual',
  };
  if (entry?.settleMode != null && entry.settleMode !== '') obs.settleMode = String(entry.settleMode);
  if (entry?.taskId) obs.taskId = String(entry.taskId);
  if (entry?.date) obs.date = String(entry.date);
  if (entry?.workflowName) obs.workflowName = String(entry.workflowName);
  if (entry?.note) obs.note = String(entry.note);
  return obs;
}

export function appendCostObservation(observations, entry) {
  const list = Array.isArray(observations) ? observations.slice() : [];
  const item = normalizeObservation(entry);
  if (item.taskId && list.some((row) => row && row.taskId && String(row.taskId) === item.taskId)) {
    return list;
  }
  list.push(item);
  return list;
}

export function observationFromSettledJob(job = {}) {
  const charged = toNum(job?.chargedPoint);
  const coins = toNum(job?.consumeCoins);
  let cost;
  let source;
  let unit;
  if (charged !== null) {
    cost = charged;
    source = 'chargedPoint';
    unit = 'points';
  } else if (coins !== null) {
    cost = coins;
    source = 'consumeCoins';
    unit = 'coins';
  } else {
    return null;
  }
  const durationSec = toNum(job.durationSec);
  const workflowId = String(job.workflowId || '').trim();
  if (!(durationSec > 0) || !workflowId) return null;
  try {
    return normalizeObservation({
      workflowId,
      durationSec,
      cost,
      source,
      unit,
      settleMode: job.settleMode,
      taskId: job.taskId,
      date: job.date,
      workflowName: job.workflowName,
      note: job.note,
    });
  } catch {
    return null;
  }
}

function mergeObservations({ observations, useSeed = true } = {}) {
  let list = [];
  if (useSeed !== false) {
    for (const seed of SEED_RH_COST_OBSERVATIONS) list = appendCostObservation(list, seed);
  }
  for (const entry of Array.isArray(observations) ? observations : []) {
    list = appendCostObservation(list, entry);
  }
  return list;
}

export function resolveMvCostPerSec({
  unit,
  workflowId,
  observations,
  margin,
  useSeed = true,
} = {}) {
  const resolvedMargin = Number.isFinite(Number(margin)) && Number(margin) > 0
    ? Number(margin)
    : DEFAULT_RH_COST_MARGIN;
  const resolvedUnit = String(unit || '').trim();
  const resolvedWorkflowId = String(workflowId || '').trim();
  const fallback = {
    coinsPerSec: FALLBACK_COST_PER_SEC,
    source: 'default',
    observationCount: 0,
    maxObservedPerSec: null,
    margin: resolvedMargin,
    workflowId: resolvedWorkflowId || undefined,
    unit: resolvedUnit || undefined,
  };
  if ((resolvedUnit !== 'points' && resolvedUnit !== 'coins') || !resolvedWorkflowId) {
    return fallback;
  }
  const matches = mergeObservations({ observations, useSeed }).filter(
    (row) => row.unit === resolvedUnit && String(row.workflowId) === resolvedWorkflowId,
  );
  if (!matches.length) return fallback;
  const maxObservedPerSec = Math.max(...matches.map((row) => row.cost / row.durationSec));
  return {
    coinsPerSec: maxObservedPerSec * resolvedMargin,
    source: 'calibrated',
    observationCount: matches.length,
    maxObservedPerSec,
    margin: resolvedMargin,
    workflowId: resolvedWorkflowId,
    unit: resolvedUnit,
  };
}

export function resolveLipsyncMinCost({
  unit,
  workflowId,
  observations,
  margin,
  durationSec = 15,
  useSeed = true,
} = {}) {
  const duration = Number.isFinite(Number(durationSec)) && Number(durationSec) > 0 ? Number(durationSec) : 15;
  const rate = resolveMvCostPerSec({ unit, workflowId, observations, margin, useSeed });
  if (rate.source === 'calibrated') {
    return {
      minCoins: Math.ceil(duration * rate.coinsPerSec),
      source: 'calibrated',
      coinsPerSec: rate.coinsPerSec,
      observationCount: rate.observationCount,
      maxObservedPerSec: rate.maxObservedPerSec,
      margin: rate.margin,
      workflowId: rate.workflowId,
      unit: rate.unit,
      durationSec: duration,
    };
  }
  return {
    minCoins: FALLBACK_LIPSYNC_MIN_COST,
    source: 'default',
    coinsPerSec: rate.coinsPerSec,
    observationCount: rate.observationCount,
    maxObservedPerSec: rate.maxObservedPerSec,
    margin: rate.margin,
    workflowId: rate.workflowId,
    unit: rate.unit,
    durationSec: duration,
  };
}
