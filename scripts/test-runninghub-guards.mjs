import assert from 'node:assert/strict';
import path from 'node:path';
import {
  SINGLE_SEGMENT_KINDS,
  assertSegmentCountForKind,
  resolveDirectorRoot,
  resolveRunningHubKeySource,
  redactSecret,
  summarizeCloudJob,
  isSingleSegmentKind,
  inferWorkflowKindFromNodes,
  annotateWorkflowListing,
  attachJobSummary,
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

// --- isSingleSegmentKind / infer / annotate / attachJobSummary (Sprint 2 observability)
assert.equal(isSingleSegmentKind('mv-reference'), true);
assert.equal(isSingleSegmentKind('feihou-remix'), true);
assert.equal(isSingleSegmentKind('director'), false);
assert.equal(isSingleSegmentKind(null), false);
assert.equal(isSingleSegmentKind(undefined), false);
assert.equal(isSingleSegmentKind(''), false);

assert.equal(
  inferWorkflowKindFromNodes({ '1': { class_type: 'FeiHouEasyH3RH', inputs: {} } }),
  'feihou-remix',
);
assert.equal(
  inferWorkflowKindFromNodes({ '1': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: {} } }),
  'mv-reference',
);
assert.equal(
  inferWorkflowKindFromNodes({ '1': { class_type: 'MiniMaxH3Director', inputs: {} } }),
  'director',
);
// FeiHou wins over Reference when both present
assert.equal(
  inferWorkflowKindFromNodes({
    a: { class_type: 'MiniMaxH3ReferenceToVideo' },
    b: { class_type: 'FeiHouEasyH3RH' },
  }),
  'feihou-remix',
);
assert.equal(inferWorkflowKindFromNodes({ '1': { class_type: 'LoadImage' } }), null);
assert.equal(inferWorkflowKindFromNodes(null), null);
assert.equal(inferWorkflowKindFromNodes({}), null);
assert.doesNotThrow(() => inferWorkflowKindFromNodes({ broken: true }));

const annotated = annotateWorkflowListing(
  { path: '/w/ref.json', fileName: 'ref.json', nodeCount: 1 },
  { '9': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: {} } },
);
assert.equal(annotated.kind, 'mv-reference');
assert.equal(annotated.singleSegment, true);
assert.equal(annotated.fileName, 'ref.json');
assert.equal(annotated.kindError, undefined);

const directorListing = annotateWorkflowListing(
  { path: '/w/d.json', fileName: 'd.json', nodeCount: 2 },
  { '1': { class_type: 'MiniMaxH3Director' }, '2': { class_type: 'LoadImage' } },
);
assert.equal(directorListing.kind, 'director');
assert.equal(directorListing.singleSegment, false);

const unknown = annotateWorkflowListing(
  { path: '/w/x.json', fileName: 'x.json', nodeCount: 1 },
  { '1': { class_type: 'LoadImage' } },
);
assert.equal(unknown.kind, null);
assert.equal(unknown.singleSegment, false);
assert.match(String(unknown.kindError || ''), /工作流|节点|识别/);

const emptyAnnotate = annotateWorkflowListing(
  { path: '/w/empty.json', fileName: 'empty.json', nodeCount: 0 },
  null,
);
assert.equal(emptyAnnotate.kind, null);
assert.equal(emptyAnnotate.singleSegment, false);

const withSummary = attachJobSummary(
  {
    id: 'j3',
    status: 'FAILED',
    stage: '生成失败',
    workflowKind: 'director',
    taskId: 't1',
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:45.000Z',
    error: 'fail secret-xyz',
    segmentCount: 2,
  },
  { secret: 'secret-xyz' },
);
assert.equal(withSummary.id, 'j3');
assert.equal(withSummary.status, 'FAILED');
assert.ok(withSummary.summary);
assert.equal(withSummary.summary.elapsedSec, 45);
assert.equal(withSummary.summary.workflowKind, 'director');
assert.equal(withSummary.summary.segmentCount, 2);
assert.equal(withSummary.summary.terminal, true);
assert.equal(withSummary.summary.error, 'fail ***');
assert.equal(JSON.stringify(withSummary.summary).includes('secret-xyz'), false);
// Original job fields are preserved on the API envelope; summary is the safe view.
assert.equal(withSummary.error, 'fail secret-xyz');

console.log('runninghub-guards ok');
