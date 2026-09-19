/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { patchDirectorProject, validateDirectorReferences } from '../lib/workflow';

export type RunningHubWorkflowKind = 'feihou-remix' | 'mv-reference' | 'director';

function workflowNodes(workflow: any) {
  return Object.entries(workflow || {}).filter(([, value]: any) => value && typeof value === 'object');
}

export function detectRunningHubWorkflowKind(workflow: any): RunningHubWorkflowKind {
  const classes = new Set(workflowNodes(workflow).map(([, value]: any) => value.class_type));
  if (classes.has('FeiHouEasyH3RH')) return 'feihou-remix';
  if (classes.has('MiniMaxH3ReferenceToVideo')) return 'mv-reference';
  if (classes.has('MiniMaxH3Director')) return 'director';
  throw new Error('云端工作流缺少受支持的 MiniMax H3 主节点');
}

function assetFileName(asset: any) {
  return String(asset?.fileName || path.basename(String(asset?.path || ''))).trim();
}

function resolutionLabel(megapixels: number) {
  if (megapixels >= 0.9) return '1080P';
  if (megapixels >= 0.6) return '720P';
  return '540P';
}

function patchFeiHouRemixWorkflow(original: any, segment: any, settings: any) {
  const workflow = structuredClone(original);
  const entry = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'FeiHouEasyH3RH');
  if (!entry) throw new Error('肥猴 Remix 工作流缺少 FeiHouEasyH3RH 节点');
  const [, node] = entry as [string, any];
  const inputs = node.inputs || (node.inputs = {});
  const pictures = Array.isArray(segment.pictures) ? segment.pictures : [];
  const audios = Array.isArray(segment.audios) ? segment.audios : [];
  if (!pictures.length) throw new Error('肥猴 Remix 工作流至少需要一张人物或场景图片');
  if (pictures.length > 9 || audios.length > 3) throw new Error('肥猴 Remix 最多支持 9 张图片、3 条参考音频');

  const media = [
    ...pictures.map((asset: any) => ({ media_type: 'image', fileName: assetFileName(asset) })),
    ...audios.map((asset: any) => ({ media_type: 'audio', fileName: assetFileName(asset) })),
  ];
  if (media.some((asset) => !asset.fileName)) throw new Error('肥猴 Remix 素材缺少可用文件名');
  for (let index = 1; index <= 12; index += 1) {
    delete inputs[`media_${index}`];
    delete inputs[`media_type_${index}`];
    delete inputs[`media_trim_${index}`];
  }
  media.forEach((asset, index) => {
    inputs[`media_${index + 1}`] = asset.fileName;
    inputs[`media_type_${index + 1}`] = asset.media_type;
    inputs[`media_trim_${index + 1}`] = '';
  });
  inputs.embedded_media_json = JSON.stringify(media.map((asset, index) => ({
    media_type: asset.media_type,
    ordinal: index + 1,
    filename: asset.fileName,
    subfolder: '',
    storage: 'input',
    audio_trim: '',
  })));
  inputs.mode = 'reference';
  inputs.prompt = String(segment.prompt || '');
  inputs.seconds = Math.max(1, Math.min(15, Number(segment.durationSec || 5)));
  inputs.audio_duration_auto = 'off';
  inputs.fps = Number(settings.frameRate || 24);
  inputs.aspect_ratio = String(settings.aspectRatio || '16:9');
  inputs.width = Number(settings.width || 1056);
  inputs.height = Number(settings.height || 608);
  inputs.resolution = resolutionLabel(Number(settings.megapixels || 0.6));
  inputs.reference_mention_mode = 'index';
  inputs.reference_text_only = false;
  inputs.prompt_optimizer_enabled = false;

  const resolution = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'FeiHouEasyH3RHResolution')?.[1] as any;
  if (resolution?.inputs) {
    resolution.inputs.resolution = inputs.resolution;
    resolution.inputs.width = inputs.width;
    resolution.inputs.height = inputs.height;
    resolution.inputs.aspect_ratio = inputs.aspect_ratio;
  }
  const schedulers = workflowNodes(workflow)
    .filter(([, value]: any) => value.class_type === 'BasicScheduler')
    .sort(([left], [right]) => Number(left) - Number(right));
  schedulers.forEach(([, scheduler]: any, index) => {
    if (scheduler.inputs) scheduler.inputs.steps = index === 0 ? Number(settings.steps || 8) : Math.min(4, Number(settings.steps || 8));
  });
  const faceRefine = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'FeiHouEasyH3RHFaceRefine')?.[1] as any;
  if (faceRefine?.inputs) faceRefine.inputs.steps = Number(settings.steps || 8);
  const audioSwitch = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'ComfySwitchNodeV2')?.[1] as any;
  if (audioSwitch?.inputs && audios.length) audioSwitch.inputs.switch = true;
  return workflow;
}

function patchMvReferenceWorkflow(original: any, segment: any, settings: any) {
  const workflow = structuredClone(original);
  const directorEntry = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'MiniMaxH3ReferenceToVideo');
  if (!directorEntry) throw new Error('MV 工作流缺少 MiniMaxH3ReferenceToVideo 节点');
  const [, director] = directorEntry as [string, any];
  const inputs = director.inputs || (director.inputs = {});
  const pictureAssets = Array.isArray(segment.pictures) ? segment.pictures : [];
  const audioAssets = Array.isArray(segment.audios) ? segment.audios : [];
  if (!pictureAssets.length) throw new Error('MV 云端工作流至少需要一张人物或场景图片');
  if (pictureAssets.length > 9 || audioAssets.length > 3) throw new Error('MV 云端最多支持 9 张图片、3 条参考音频');
  const numericIds = Object.keys(workflow).map(Number).filter(Number.isFinite);
  let nextId = Math.max(190, ...numericIds) + 1;
  const imageNodes = workflowNodes(workflow).filter(([, value]: any) => value.class_type === 'LoadImage');
  pictureAssets.forEach((asset: any, index: number) => {
    const nodeId = (imageNodes[index]?.[0] as string | undefined) || String(nextId++);
    workflow[nodeId] = { class_type: 'LoadImage', inputs: { image: assetFileName(asset) } };
    inputs[`ref_images.ref_image_${index}`] = [nodeId, 0];
  });
  for (let index = pictureAssets.length; index < 9; index += 1) delete inputs[`ref_images.ref_image_${index}`];
  const audioNode = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'LoadAudio')?.[0] as string | undefined;
  if (audioAssets[0]) {
    const nodeId = audioNode || String(nextId++);
    workflow[nodeId] = { class_type: 'LoadAudio', inputs: { audio: assetFileName(audioAssets[0]), audioUI: '' } };
    inputs['ref_audios.ref_audio_0'] = [nodeId, 0];
  } else delete inputs['ref_audios.ref_audio_0'];
  for (let index = 1; index < 3; index += 1) delete inputs[`ref_audios.ref_audio_${index}`];
  const resolution = workflow['115']?.inputs;
  if (resolution) resolution.megapixels = settings.megapixels;
  const scheduler = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'BasicScheduler')?.[1] as any;
  if (scheduler?.inputs) scheduler.inputs.steps = settings.steps;
  const durationNode = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'Audio Duration (mtb)')?.[1] as any;
  if (durationNode?.inputs && inputs['ref_audios.ref_audio_0']) durationNode.inputs.audio = inputs['ref_audios.ref_audio_0'];
  inputs.prompt = String(segment.prompt || '');
  return workflow;
}

function finalizeDirectorWorkflow(workflow: any) {
  const director = workflowNodes(workflow).find(([, value]: any) => value.class_type === 'MiniMaxH3Director')?.[1] as any;
  if (!director?.inputs) return workflow;
  delete director.inputs.refine;
  const timeline = JSON.parse(director.inputs.timeline_data);
  timeline.keyframes = [];
  timeline.videoWorkspaces = {};
  timeline.runSelection = [];
  timeline.batchWorkspaces = { r2v: { segments: timeline.segments, runSelectEnabled: false, runSelection: [], selectedIndex: 0, editMode: 'segment', globalCommon: { commonEnabled: false, prompt: '', refs: [], refAudios: [] } } };
  director.inputs.timeline_data = JSON.stringify(timeline);
  return workflow;
}

export function adaptRunningHubWorkflow(original: any, segments: any[], settings: any, finalize = false) {
  const kind = detectRunningHubWorkflowKind(original);
  let workflow: any;
  if (kind === 'feihou-remix') workflow = patchFeiHouRemixWorkflow(original, segments[0], settings);
  else if (kind === 'mv-reference') workflow = patchMvReferenceWorkflow(original, segments[0], settings);
  else {
    workflow = patchDirectorProject(original, segments, settings);
    validateDirectorReferences(workflow, segments);
    if (finalize) workflow = finalizeDirectorWorkflow(workflow);
  }
  return { kind, workflow };
}
