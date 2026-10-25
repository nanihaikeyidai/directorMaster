import assert from 'node:assert/strict';
import {
  indexesNeedingResumePoll,
  normalizePersistedQueue,
  serializeActiveGeneration,
  restoreActiveGeneration,
} from '../lib/mv-generation-resume.mjs';

// --- indexesNeedingResumePoll ---
{
  const generation = {
    0: { provider: 'runninghub', status: 'running', message: '生成中', jobId: 'job-a' },
    1: { provider: 'runninghub', status: 'done', message: '完成', jobId: 'job-b', outputPath: '/x.mp4' },
    2: { provider: 'local', status: 'running', message: '本地', jobId: undefined },
    3: { provider: 'runninghub', status: 'queued', message: '排队', jobId: 'job-c' },
    4: { provider: 'runninghub', status: 'preparing', message: '准备', jobId: 'job-d' },
    5: { provider: 'runninghub', status: 'error', message: '失败', jobId: 'job-e' },
    6: { provider: 'runninghub', status: 'running', message: '无 id' },
  };
  const need = indexesNeedingResumePoll(generation);
  assert.deepEqual(need, [
    { index: 0, jobId: 'job-a' },
    { index: 3, jobId: 'job-c' },
    { index: 4, jobId: 'job-d' },
  ]);
  assert.deepEqual(indexesNeedingResumePoll({}), []);
}

// --- normalizePersistedQueue: only queued (running with job covered by poll) ---
{
  const queue = [
    { id: '1', provider: 'runninghub', indexes: [0], status: 'queued', message: '等待', createdAt: 1 },
    { id: '2', provider: 'runninghub', indexes: [1], status: 'running', message: '跑', createdAt: 2 },
    { id: '3', provider: 'local', indexes: [2], status: 'done', message: '完', createdAt: 3 },
    { id: '4', provider: 'local', indexes: [3], status: 'error', message: '错', createdAt: 4 },
  ];
  const normalized = normalizePersistedQueue(queue);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, '1');
  assert.equal(normalized[0].status, 'queued');
  assert.deepEqual(normalizePersistedQueue(null), []);
  assert.deepEqual(normalizePersistedQueue(undefined), []);
}

// --- serializeActiveGeneration: non-done with useful state ---
{
  const generation = {
    0: { provider: 'runninghub', status: 'running', message: '生成中', jobId: 'job-a' },
    1: { provider: 'runninghub', status: 'done', message: '完成', outputPath: '/x.mp4', jobId: 'job-b' },
    2: { provider: 'runninghub', status: 'error', message: '失败', jobId: 'job-e' },
    3: { provider: 'local', status: 'queued', message: '排队' },
  };
  const serialized = serializeActiveGeneration(generation);
  assert.deepEqual(serialized, [
    { index: 1, provider: 'runninghub', status: 'running', message: '生成中', jobId: 'job-a' },
    { index: 3, provider: 'runninghub', status: 'error', message: '失败', jobId: 'job-e' },
    { index: 4, provider: 'local', status: 'queued', message: '排队' },
  ]);
}

console.log('test-mv-generation-resume: ok');

// --- restoreActiveGeneration ---
{
  const restored = restoreActiveGeneration([
    { index: 1, provider: 'runninghub', status: 'running', message: '生成中', jobId: 'job-a' },
    { index: 2, provider: 'runninghub', status: 'done', message: '忽略' },
    { index: 3, provider: 'local', status: 'error', message: '失败' },
  ]);
  assert.deepEqual(restored[0], { provider: 'runninghub', status: 'running', message: '生成中', jobId: 'job-a' });
  assert.equal(restored[1], undefined);
  assert.deepEqual(restored[2], { provider: 'local', status: 'error', message: '失败' });
  assert.deepEqual(restoreActiveGeneration(null), {});
}
