import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  DEFAULT_SUBTITLE_ASR_WORKFLOW_ID,
  hasSubtitleAsrKey,
  resolveSubtitleAsrConfig,
  buildSubtitleAsrSubmitBody,
  extractAsrRawFromCloudOutputs,
  runSubtitleAsrPipeline,
} = await import('../lib/subtitle-rh-asr.mjs');

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8'));
}

// --- defaults / key / config ---
{
  assert.equal(DEFAULT_SUBTITLE_ASR_WORKFLOW_ID, '2104649076645130241');
  assert.equal(hasSubtitleAsrKey({}), false);
  assert.equal(hasSubtitleAsrKey({ RUNNINGHUB_API_KEY: '' }), false);
  assert.equal(hasSubtitleAsrKey({ RUNNINGHUB_API_KEY: '  ' }), false);
  assert.equal(hasSubtitleAsrKey({ RUNNINGHUB_X_API_KEY: 'x' }), false);
  assert.equal(hasSubtitleAsrKey({ RUNNINGHUB_API_KEY: ' secret ' }), true);

  const cfg = resolveSubtitleAsrConfig({
    outDir: '/tmp/out',
    env: { RUNNINGHUB_SUBTITLE_WORKFLOW_ID: '999' },
  });
  assert.equal(cfg.workflowId, '999');
  assert.equal(cfg.apiBase, 'https://www.runninghub.cn');
  assert.equal(cfg.outDir, '/tmp/out');

  const cfg2 = resolveSubtitleAsrConfig({
    outDir: '/tmp/out',
    workflowId: '111',
    jobId: 'job-a',
    env: {},
  });
  assert.equal(cfg2.workflowId, '111');
  assert.ok(String(cfg2.outDir).includes('job-a') || cfg2.jobId === 'job-a');
}

// --- buildSubtitleAsrSubmitBody (pure) ---
{
  const body = buildSubtitleAsrSubmitBody({
    workflowId: '2104649076645130241',
    fileName: 'clip.mp4',
  });
  assert.equal(body.workflowId, '2104649076645130241');
  assert.equal(body.instanceType, 'plus');
  assert.ok(Array.isArray(body.nodeInfoList));
  assert.equal(JSON.stringify(body).includes('apiKey'), false);
  assert.ok(
    body.nodeInfoList.some((n) =>
      JSON.stringify(n).includes('clip.mp4'),
    ) || body.fileName === 'clip.mp4' || JSON.stringify(body).includes('clip.mp4'),
  );
}

// --- extractAsrRawFromCloudOutputs ---
{
  const segments = loadFixture('rh-asr-segments.json');
  const fromText = extractAsrRawFromCloudOutputs([
    { fileName: 'out.json', text: JSON.stringify(segments) },
  ]);
  assert.ok(fromText && fromText.segments);
  assert.equal(fromText.segments.length, 2);
  assert.equal(fromText.segments[0].text, '跟着灯光向前走');

  const fromNested = extractAsrRawFromCloudOutputs({
    data: [{ text: JSON.stringify(segments) }],
  });
  assert.ok(fromNested);

  const fromInline = extractAsrRawFromCloudOutputs([
    { text: '跟着灯光向前走。别回头。' },
  ]);
  assert.ok(
    typeof fromInline === 'string' ||
      fromInline.text ||
      Array.isArray(fromInline) ||
      fromInline.segments ||
      fromInline.sentences,
  );

  assert.throws(() => extractAsrRawFromCloudOutputs([]), /输出|output|ASR/i);
  assert.throws(() => extractAsrRawFromCloudOutputs(null), /输出|output|ASR/i);
}

// --- pipeline: missing key ---
{
  await assert.rejects(
    () =>
      runSubtitleAsrPipeline(
        { videoPath: '/tmp/v.mp4', outDir: '/tmp/o' },
        {
          getApiKey: async () => '',
          uploadFile: async () => { throw new Error('should not upload'); },
          createTask: async () => { throw new Error('should not create'); },
          getStatus: async () => { throw new Error('should not status'); },
          getOutputs: async () => { throw new Error('should not outputs'); },
        },
      ),
    /RUNNINGHUB_API_KEY|密钥|API key/i,
  );
}

// --- pipeline: dryRun planned ---
{
  const outDir = mkdtempSync(path.join(tmpdir(), 'sub-rh-dry-'));
  try {
    const result = await runSubtitleAsrPipeline(
      {
        videoPath: path.join(outDir, 'fake.mp4'),
        outDir,
        dryRun: true,
        basename: 'subtitles',
      },
      {
        getApiKey: async () => 'test-key-not-for-network',
        uploadFile: async () => { throw new Error('dryRun must not upload'); },
        createTask: async () => { throw new Error('dryRun must not create'); },
        getStatus: async () => { throw new Error('dryRun must not status'); },
        getOutputs: async () => { throw new Error('dryRun must not outputs'); },
      },
    );
    assert.equal(result.status, 'planned');
    assert.equal(result.cueCount, 0);
    assert.ok(result.jobId);
    assert.ok(result.files?.plan);
    assert.ok(existsSync(result.files.plan));
    const plan = JSON.parse(readFileSync(result.files.plan, 'utf8'));
    assert.equal(plan.workflowId, DEFAULT_SUBTITLE_ASR_WORKFLOW_ID);
    assert.equal(plan.videoBasename, 'fake.mp4');
    assert.equal(JSON.stringify(result).includes('test-key'), false);
    assert.equal(JSON.stringify(plan).includes('test-key'), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// --- pipeline: happy path (mock) ---
{
  const outDir = mkdtempSync(path.join(tmpdir(), 'sub-rh-ok-'));
  const videoPath = path.join(outDir, 'clip.mp4');
  writeFileSync(videoPath, Buffer.alloc(0));
  const segments = loadFixture('rh-asr-segments.json');
  let polls = 0;
  try {
    const result = await runSubtitleAsrPipeline(
      {
        videoPath,
        outDir,
        basename: 'demo',
        langs: ['zh', 'en'],
        maxPolls: 5,
        pollIntervalMs: 0,
      },
      {
        getApiKey: async () => 'mock-key',
        uploadFile: async (p) => {
          assert.equal(p, videoPath);
          return { fileName: 'uploaded-clip.mp4' };
        },
        createTask: async (body) => {
          assert.equal(body.workflowId, DEFAULT_SUBTITLE_ASR_WORKFLOW_ID);
          assert.ok(JSON.stringify(body).includes('uploaded-clip.mp4'));
          assert.equal(JSON.stringify(body).includes('mock-key'), false);
          return { taskId: 'task-1' };
        },
        getStatus: async (taskId) => {
          assert.equal(taskId, 'task-1');
          polls += 1;
          if (polls < 2) return { status: 'RUNNING' };
          return { status: 'SUCCESS' };
        },
        getOutputs: async (taskId) => {
          assert.equal(taskId, 'task-1');
          return [{ fileName: 'asr.json', text: JSON.stringify(segments) }];
        },
        sleep: async () => {},
      },
    );
    assert.equal(result.status, 'written');
    assert.equal(result.cueCount, 2);
    assert.equal(result.taskId, 'task-1');
    assert.ok(result.files?.srtSource || result.files?.ass);
    assert.ok(existsSync(result.files.ass || result.files.srtSource));
    assert.equal(JSON.stringify(result).includes('mock-key'), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// --- pipeline: FAILED ---
{
  const outDir = mkdtempSync(path.join(tmpdir(), 'sub-rh-fail-'));
  const videoPath = path.join(outDir, 'clip.mp4');
  writeFileSync(videoPath, Buffer.alloc(0));
  try {
    await assert.rejects(
      () =>
        runSubtitleAsrPipeline(
          { videoPath, outDir, maxPolls: 3, pollIntervalMs: 0 },
          {
            getApiKey: async () => 'k',
            uploadFile: async () => ({ fileName: 'a.mp4' }),
            createTask: async () => ({ taskId: 't-fail' }),
            getStatus: async () => ({ status: 'FAILED', error: 'boom' }),
            getOutputs: async () => { throw new Error('should not get outputs on FAILED'); },
            sleep: async () => {},
          },
        ),
      /FAILED|失败|boom/i,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// --- pipeline: poll timeout / cap ---
{
  const outDir = mkdtempSync(path.join(tmpdir(), 'sub-rh-timeout-'));
  const videoPath = path.join(outDir, 'clip.mp4');
  writeFileSync(videoPath, Buffer.alloc(0));
  let statusCalls = 0;
  try {
    await assert.rejects(
      () =>
        runSubtitleAsrPipeline(
          { videoPath, outDir, maxPolls: 3, pollIntervalMs: 0 },
          {
            getApiKey: async () => 'k',
            uploadFile: async () => ({ fileName: 'a.mp4' }),
            createTask: async () => ({ taskId: 't-slow' }),
            getStatus: async () => {
              statusCalls += 1;
              return { status: 'RUNNING' };
            },
            getOutputs: async () => { throw new Error('should not outputs on timeout'); },
            sleep: async () => {},
          },
        ),
      /timeout|超时|poll|轮询/i,
    );
    assert.ok(statusCalls <= 3);
    assert.ok(statusCalls >= 1);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

console.log('test-subtitle-rh-asr: ok');
