/**
 * @typedef {{ provider: string, status: string, message?: string, jobId?: string, outputPath?: string }} GenerationLike
 * @typedef {{ id: string, provider: string, indexes: number[], status: string, message?: string, createdAt?: number, prepared?: unknown }} QueueLike
 */

const RESUMABLE_STATUSES = new Set(['preparing', 'queued', 'running']);

/**
 * @param {Record<number|string, GenerationLike>} generation
 * @returns {{ index: number, jobId: string }[]}
 */
export function indexesNeedingResumePoll(generation) {
  const out = [];
  for (const [key, value] of Object.entries(generation || {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || !value) continue;
    if (value.provider !== 'runninghub') continue;
    if (!RESUMABLE_STATUSES.has(value.status)) continue;
    const jobId = value.jobId ? String(value.jobId) : '';
    if (!jobId) continue;
    out.push({ index, jobId });
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Persist only items that still need drain (queued). Running RH jobs resume via jobId poll.
 * @param {QueueLike[] | null | undefined} queue
 * @returns {QueueLike[]}
 */
export function normalizePersistedQueue(queue) {
  if (!Array.isArray(queue)) return [];
  return queue
    .filter((item) => item && item.status === 'queued' && Array.isArray(item.indexes) && item.indexes.length)
    .map((item) => ({
      id: String(item.id),
      provider: item.provider === 'local' ? 'local' : 'runninghub',
      indexes: item.indexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0),
      status: 'queued',
      message: String(item.message || '等待执行'),
      createdAt: Number(item.createdAt) || Date.now(),
      ...(item.prepared ? { prepared: item.prepared } : {}),
    }))
    .filter((item) => item.indexes.length);
}

/**
 * Serialize non-done generation entries for project persistence (1-based index).
 * @param {Record<number|string, GenerationLike>} generation
 * @returns {Array<Record<string, unknown>>}
 */
export function serializeActiveGeneration(generation) {
  const out = [];
  for (const [key, value] of Object.entries(generation || {})) {
    const index0 = Number(key);
    if (!Number.isInteger(index0) || !value) continue;
    if (value.status === 'done' || value.status === 'cancelled') continue;
    out.push({
      index: index0 + 1,
      provider: value.provider === 'local' ? 'local' : 'runninghub',
      status: value.status,
      message: String(value.message || ''),
      ...(value.jobId ? { jobId: String(value.jobId) } : {}),
      ...(value.outputPath ? { outputPath: String(value.outputPath) } : {}),
    });
  }
  return out.sort((a, b) => Number(a.index) - Number(b.index));
}

/**
 * @param {Array<Record<string, any>> | null | undefined} saved
 * @returns {Record<number, GenerationLike>}
 */
export function restoreActiveGeneration(saved) {
  /** @type {Record<number, GenerationLike>} */
  const out = {};
  if (!Array.isArray(saved)) return out;
  for (const item of saved) {
    if (!item || !Number.isInteger(Number(item.index))) continue;
    const index0 = Number(item.index) - 1;
    if (index0 < 0) continue;
    const status = String(item.status || '');
    if (!['preparing', 'queued', 'running', 'error'].includes(status)) continue;
    out[index0] = {
      provider: item.provider === 'local' ? 'local' : 'runninghub',
      status,
      message: String(item.message || ''),
      ...(item.jobId ? { jobId: String(item.jobId) } : {}),
      ...(item.outputPath ? { outputPath: String(item.outputPath) } : {}),
    };
  }
  return out;
}
