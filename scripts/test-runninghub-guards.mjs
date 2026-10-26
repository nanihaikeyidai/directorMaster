import assert from 'node:assert/strict';
import path from 'node:path';
import {
  SINGLE_SEGMENT_KINDS,
  assertSegmentCountForKind,
  resolveDirectorRoot,
  resolveRunningHubKeySource,
  redactSecret,
  summarizeCloudJob,
} from '../lib/runninghub-guards.mjs';

// --- multi-segment guard: no more silent segments[0]
assert.deepEqual([...SINGLE_SEGMENT_KINDS].sort(), ['feihou-remix', 'mv-reference']);
assert.doesNotThrow(() => assertSegmentCountForKind('director', 5));
assert.doesNotThrow(() => assertSegmentCountForKind('mv-reference', 1));
assert.throws(() => assertSegmentCountForKind('mv-reference', 0), (e) => e.code === 'RH_NO_SEGMENTS' && e.status === 400);
assert.throws(
  () => assertSegmentCountForKind('mv-reference', 3),
  (e) => e.code === 'RH_MULTI_SEGMENT_UNSUPPORTED' && e.status === 400 && /3/.test(e.message) && /逐段|单段/.test(e.message),
);
assert.throws(() => assertSegmentCountForKind('feihou-remix', 2), (e) => e.code === 'RH_MULTI_SEGMENT_UNSUPPORTED');

// --- portable root
assert.equal(resolveDirectorRoot({ DIRECTOR_MASTER_ROOT: '/data/dm' }, '/cwd'), path.resolve('/data/dm'));
assert.equal(resolveDirectorRoot({ DIRECTOR_MASTER_ROOT: '   ' }, '/cwd'), path.resolve('/cwd'));
assert.equal(resolveDirectorRoot({}, '/cwd'), path.resolve('/cwd'));

// --- key source (never returns the secret itself)
const envSrc = resolveRunningHubKeySource({ RUNNINGHUB_API_KEY: ' sk-abc ' }, 'linux');
assert.equal(envSrc.type, 'env');
assert.equal(JSON.stringify(envSrc).includes('sk-abc'), false);
const dpapi = resolveRunningHubKeySource({ USERPROFILE: 'C:\\Users\\me' }, 'win32');
assert.equal(dpapi.type, 'dpapi');
assert.match(dpapi.file, /me.*runninghub-api-key\.dpapi$/);
assert.equal(resolveRunningHubKeySource({ RUNNINGHUB_DPAPI_FILE: 'E:\\k.dpapi' }, 'win32').file, 'E:\\k.dpapi');
const missing = resolveRunningHubKeySource({}, 'linux');
assert.equal(missing.type, 'missing');
assert.match(missing.message, /RUNNINGHUB_API_KEY/);

// --- redaction
assert.equal(redactSecret('bad key sk-abc in sk-abc', 'sk-abc'), 'bad key *** in ***');
assert.equal(redactSecret('nothing', ''), 'nothing');
assert.equal(redactSecret(undefined, 'x'), '');

// --- observability summary
const s = summarizeCloudJob({ id: 'j1', status: 'FAILED', stage: '生成失败', workflowKind: 'mv-reference', taskId: 't9', createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:01:30.000Z', error: 'boom sk-abc', segmentCount: 1, apiKey: 'sk-abc' }, { secret: 'sk-abc' });
assert.deepEqual(s, { id: 'j1', status: 'FAILED', stage: '生成失败', workflowKind: 'mv-reference', taskId: 't9', segmentCount: 1, elapsedSec: 90, error: 'boom ***', terminal: true });
assert.equal(summarizeCloudJob({ id: 'j2', status: 'RUNNING', createdAt: 'x' }).elapsedSec, null);
assert.equal(summarizeCloudJob({ id: 'j2', status: 'RUNNING' }).terminal, false);

console.log('runninghub-guards ok');
