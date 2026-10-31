import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_WORKFLOW_ID = '2087128116820013058';
const DEFAULT_API_BASE = 'https://www.runninghub.cn';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveMvProject(projectArg, workspaceRoot = process.env.DIRECTOR_MASTER_ROOT || repoRoot()) {
  const raw = String(projectArg || '').trim();
  if (!raw) throw new Error('需要 --project <projectId|project.json路径>');
  if (raw.endsWith('.json') || raw.includes('/') || raw.includes('\\')) {
    const projectFile = path.resolve(raw);
    if (!existsSync(projectFile)) throw new Error('项目文件不存在：' + projectFile);
    return { projectFile, manifest: JSON.parse(readFileSync(projectFile, 'utf8')) };
  }
  const projectFile = path.join(path.resolve(workspaceRoot), 'workspace', 'mv', raw, 'project.json');
  if (!existsSync(projectFile)) throw new Error('未找到 MV 项目：' + projectFile);
  return { projectFile, manifest: JSON.parse(readFileSync(projectFile, 'utf8')) };
}

function workflowNodes(workflow) {
  return Object.entries(workflow || {}).filter(([, v]) => v && typeof v === 'object');
}

export function patchMvWorkflow(original, segment, uploaded, settings = {}) {
  const workflow = structuredClone(original);
  const directorEntry = workflowNodes(workflow).find(([, v]) => v.class_type === 'MiniMaxH3ReferenceToVideo');
  if (!directorEntry) throw new Error('缺少 MiniMaxH3ReferenceToVideo 节点');
  const [, director] = directorEntry;
  const inputs = director.inputs || (director.inputs = {});
  const numericIds = Object.keys(workflow).map(Number).filter(Number.isFinite);
  let nextId = Math.max(190, ...numericIds) + 1;
  const imageNodes = workflowNodes(workflow).filter(([, v]) => v.class_type === 'LoadImage');
  const pictures = segment.pictures || [];
  pictures.forEach((fileName, index) => {
    const nodeId = imageNodes[index]?.[0] || String(nextId++);
    workflow[nodeId] = { class_type: 'LoadImage', inputs: { image: uploaded[fileName] } };
    inputs[`ref_images.ref_image_${index}`] = [nodeId, 0];
  });
  for (let i = pictures.length; i < 9; i += 1) delete inputs[`ref_images.ref_image_${i}`];
  const audioKey = segment.audio;
  const audioNode = workflowNodes(workflow).find(([, v]) => v.class_type === 'LoadAudio')?.[0] || String(nextId++);
  workflow[audioNode] = { class_type: 'LoadAudio', inputs: { audio: uploaded[audioKey], audioUI: '' } };
  inputs['ref_audios.ref_audio_0'] = [audioNode, 0];
  for (let i = 1; i < 3; i += 1) delete inputs[`ref_audios.ref_audio_${i}`];
  if (workflow['115']?.inputs) workflow['115'].inputs.megapixels = Number(settings.megapixels ?? 0.6);
  const scheduler = workflowNodes(workflow).find(([, v]) => v.class_type === 'BasicScheduler')?.[1];
  if (scheduler?.inputs) scheduler.inputs.steps = Number(settings.steps ?? 8);
  const durationNode = workflowNodes(workflow).find(([, v]) => v.class_type === 'Audio Duration (mtb)')?.[1];
  if (durationNode?.inputs && inputs['ref_audios.ref_audio_0']) durationNode.inputs.audio = inputs['ref_audios.ref_audio_0'];
  inputs.prompt = segment.prompt;
  return workflow;
}

async function callRh(apiBase, apiKey, endpoint, body) {
  const res = await fetch(apiBase + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, apiKey }),
    signal: AbortSignal.timeout(180000),
  });
  return res.json();
}

async function uploadRh(apiBase, apiKey, filePath) {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append('apiKey', apiKey);
  form.append('file', new Blob([bytes]), path.basename(filePath));
  const res = await fetch(apiBase + '/task/openapi/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(180000) });
  const json = await res.json();
  if (json.code !== 0 || !json.data?.fileName) throw new Error('upload fail ' + path.basename(filePath) + ' ' + JSON.stringify(json));
  return json.data.fileName;
}

async function waitRh(apiBase, apiKey, taskId, label) {
  for (let i = 0; i < 180; i += 1) {
    const st = await callRh(apiBase, apiKey, '/task/openapi/status', { taskId });
    const status = st.data;
    console.error(`[${label}] ${taskId} ${status}`);
    if (status === 'SUCCESS') {
      const out = await callRh(apiBase, apiKey, '/task/openapi/outputs', { taskId });
      if (out.code !== 0) throw new Error('outputs ' + JSON.stringify(out));
      return out.data;
    }
    if (status === 'FAILED') {
      const out = await callRh(apiBase, apiKey, '/task/openapi/outputs', { taskId });
      throw new Error('FAILED ' + JSON.stringify(out));
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error('timeout ' + taskId);
}

export function planMvGenerate(manifest, { workflowId = DEFAULT_WORKFLOW_ID, outDir } = {}) {
  const segments = (manifest.segments || []).map((seg) => ({
    index: seg.index,
    duration: seg.duration,
    promptChars: String(seg.prompt || '').length,
    audio: seg.path,
    pictures: (manifest.visualAssets || []).filter((a) => a.mediaType !== 'audio').map((a) => a.path),
  }));
  return {
    status: 'planned',
    projectId: manifest.projectId,
    template: manifest.template || 'band',
    workflowId,
    outDir: outDir || path.join(path.dirname(manifest.projectFile || '.'), 'cloud-out'),
    segmentCount: segments.length,
    segments,
  };
}

export async function runMvGenerate({
  manifest,
  projectFile,
  apiKey,
  watch = false,
  dryRun = true,
  workflowId = DEFAULT_WORKFLOW_ID,
  apiBase = DEFAULT_API_BASE,
  workflowTemplatePath,
  outDir,
  settings = { steps: 8, megapixels: 0.6 },
}) {
  const root = path.dirname(projectFile);
  const destRoot = outDir ? path.resolve(outDir) : path.join(root, 'cloud-out');
  mkdirSync(destRoot, { recursive: true });
  const plan = planMvGenerate({ ...manifest, projectFile }, { workflowId, outDir: destRoot });
  writeFileSync(path.join(destRoot, 'generate-plan.json'), JSON.stringify(plan, null, 2));
  if (dryRun || !watch) {
    return { ...plan, dryRun: true, message: watch ? undefined : 'dry-run：未提交 RunningHub。加 --watch 才会扣币生成。' };
  }
  if (!apiKey) throw new Error('mv-generate --watch 需要 RUNNINGHUB_API_KEY');

  const templatePath = workflowTemplatePath
    || path.join(repoRoot(), 'workspace', 'workflows', 'mv', 'cloud', 'minimax_h3_multiref_pixel_fantasy_api.json');
  if (!existsSync(templatePath)) throw new Error('缺少云工作流模板：' + templatePath);
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));

  const wallet0 = await callRh(apiBase, apiKey, '/uc/openapi/accountStatus', {});
  const visualPaths = (manifest.visualAssets || []).filter((a) => a.mediaType !== 'audio').map((a) => a.path);
  const results = [];

  for (const seg of manifest.segments || []) {
    const label = `seg${String(seg.index).padStart(2, '0')}`;
    const prompt = String(seg.prompt || '').trim();
    if (!prompt) throw new Error(`${label} 缺少 generated prompt；请先 mv-cut / 审核提示词`);
    const uploaded = {};
    for (const picture of visualPaths) {
      console.error('[upload]', path.basename(picture));
      uploaded[picture] = await uploadRh(apiBase, apiKey, picture);
    }
    console.error('[upload]', path.basename(seg.path));
    uploaded[seg.path] = await uploadRh(apiBase, apiKey, seg.path);
    const workflow = patchMvWorkflow(template, {
      pictures: visualPaths,
      audio: seg.path,
      prompt,
    }, uploaded, settings);
    writeFileSync(path.join(destRoot, `${label}.workflow.json`), JSON.stringify(workflow, null, 2));

    let created = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      created = await callRh(apiBase, apiKey, '/task/openapi/create', {
        workflowId,
        instanceType: 'plus',
        workflow: JSON.stringify(workflow),
        nodeInfoList: [],
      });
      writeFileSync(path.join(destRoot, `${label}.create-try${attempt}.json`), JSON.stringify(created, null, 2));
      if (created.code === 0 && created.data?.taskId) break;
      if (created.code === 421 || /QUEUE/i.test(created.msg || '')) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      if (created.code === 605) throw new Error('605 NOT_ENOUGH_BALANCE');
      throw new Error('create failed ' + JSON.stringify(created));
    }
    if (!(created?.code === 0 && created.data?.taskId)) throw new Error('create giveup ' + label);
    const taskId = String(created.data.taskId);
    const outputs = await waitRh(apiBase, apiKey, taskId, label);
    const videos = (outputs || []).filter((o) => /mp4|webm/i.test(String(o.fileType || o.fileUrl || '')));
    const pick = videos[0] || outputs[0];
    const dest = path.join(destRoot, `${label}.mp4`);
    const res = await fetch(pick.fileUrl, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error('download ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    results.push({ id: label, taskId, dest, size: buf.length, consumeCoins: pick.consumeCoins });
    writeFileSync(path.join(destRoot, 'RESULTS-partial.json'), JSON.stringify(results, null, 2));
  }

  const finalPath = await muxOriginalAudio({
    videoPaths: results.map((r) => r.dest),
    audioPath: manifest.sourcePath,
    outPath: path.join(destRoot, `${manifest.projectId || 'mv'}-final.mp4`),
  });

  const wallet1 = await callRh(apiBase, apiKey, '/uc/openapi/accountStatus', {});
  const summary = {
    status: 'success',
    results,
    finalPath,
    wallet_before: { apiType: wallet0.data?.apiType, coins: wallet0.data?.remainCoins },
    wallet_after: { apiType: wallet1.data?.apiType, coins: wallet1.data?.remainCoins },
  };
  writeFileSync(path.join(destRoot, 'RESULTS.json'), JSON.stringify(summary, null, 2));
  return summary;
}

export function muxOriginalAudio({ videoPaths, audioPath, outPath }) {
  if (!videoPaths?.length) throw new Error('没有可拼接的视频段');
  if (!audioPath || !existsSync(audioPath)) throw new Error('缺少原音频：' + audioPath);
  const dir = path.dirname(outPath);
  mkdirSync(dir, { recursive: true });
  const listFile = path.join(dir, 'concat-list.txt');
  writeFileSync(listFile, videoPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const silentConcat = path.join(dir, 'concat-silent.mp4');
  let ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silentConcat], { encoding: 'utf8' });
  if (ff.status !== 0) {
    ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-an', silentConcat], { encoding: 'utf8' });
    if (ff.status !== 0) throw new Error(ff.stderr || 'concat failed');
  }
  const mux = spawnSync('ffmpeg', [
    '-y', '-i', silentConcat, '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-shortest',
    outPath,
  ], { encoding: 'utf8' });
  if (mux.status !== 0) throw new Error(mux.stderr || 'mux failed');
  return outPath;
}
