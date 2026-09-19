/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LibraryAsset } from './asset-db';

export type WorkflowFormat = 'ui' | 'api';
export type DirectorInfo = { format: WorkflowFormat; id: string; node: Record<string, any> };
export type TaskType = 't2v' | 'i2v' | 'fl2v' | 'r2v' | 'v2v' | 'rv2v';

export type DirectorSettings = {
  taskType: TaskType;
  frameRate: number;
  width: number;
  height: number;
  megapixels: number;
  refMaxSize: number;
  cfg: number;
  seed: number;
  steps: number;
  sampler: string;
  scheduler: string;
  shiftVideo: number;
  shiftAudio: number;
  audioMode: 'generate' | 'source' | 'mute';
  exportMode: 'all' | 'segments';
  continuityEnabled: boolean;
  continuityOverlapFrames: number;
  runSelectEnabled: boolean;
  clearVram: boolean;
  exportSourceImages: boolean;
};

export type SegmentPlan = {
  durationSec: number;
  enabled: boolean;
  continuityFromPrev: boolean;
};

export type DirectorSegmentInput = SegmentPlan & {
  id: string;
  prompt: string;
  negativePrompt: string;
  definitions: string;
  /** Independent prompt channels retained for Director Master auditing. */
  referencePrompt?: string;
  commonPrompt?: string;
  shotPrompt?: string;
  pictures: LibraryAsset[];
  audios: LibraryAsset[];
};

const taskLabels: Record<TaskType, string> = {
  t2v: 't2v — 文生视频(Text to Video)',
  i2v: 'i2v — 图生视频(Image to Video)',
  fl2v: 'fl2v — 首尾帧生视频(First/Last Frame to Video)',
  r2v: 'r2v — 参考主体生视频(Reference to Video)',
  v2v: 'v2v — 视频转视频(Video to Video)',
  rv2v: 'rv2v — 参考素材改视频(Reference Video to Video)',
};

export function framesForDuration(durationSec: number, frameRate: number) {
  const target = Math.max(1, durationSec) * frameRate;
  return Math.max(22, Math.round((target - 5) / 17) * 17 + 5);
}

export function findDirector(workflow: Record<string, any>): DirectorInfo | null {
  if (Array.isArray(workflow?.nodes)) {
    const node = workflow.nodes.find((item: Record<string, any>) => item.type === 'MiniMaxH3Director');
    return node ? { format: 'ui', id: String(node.id), node } : null;
  }
  const entry = Object.entries(workflow || {}).find(([, value]) =>
    (value as Record<string, any>)?.class_type === 'MiniMaxH3Director',
  );
  return entry ? { format: 'api', id: entry[0], node: entry[1] as Record<string, any> } : null;
}

function referenceData(pictures: LibraryAsset[], audios: LibraryAsset[]) {
  return {
    refs: pictures.map((asset, index) => ({ index, imageFile: asset.fileName, fileName: asset.fileName, type: 'input', subfolder: '' })),
    refAudios: audios.map((asset, index) => ({ index, audioFile: asset.fileName, fileName: asset.fileName, type: 'input', subfolder: '' })),
  };
}

function patchProjectTimeline(raw: string, segments: DirectorSegmentInput[], settings: DirectorSettings) {
  const timeline = JSON.parse(raw || '{}');
  const taskLabel = taskLabels[settings.taskType];
  timeline.version = Math.max(5, Number(timeline.version || 0));
  timeline.frameRate = settings.frameRate;
  timeline.width = settings.width;
  timeline.height = settings.height;
  timeline.refMaxSize = settings.refMaxSize;
  timeline.output = {
    ...(timeline.output || {}), mode: 'fixed', width: settings.width, height: settings.height,
    audioMode: settings.audioMode, exportMode: settings.exportMode,
    continuityEnabled: settings.continuityEnabled, continuityOverlapFrames: settings.continuityOverlapFrames,
    megapixels: settings.megapixels,
  };
  timeline.runSelectEnabled = settings.runSelectEnabled;
  let cursor = 0;
  timeline.segments = segments.map((segment, index) => {
    const frameCount = framesForDuration(segment.durationSec, settings.frameRate);
    const refs = referenceData(segment.pictures, segment.audios);
    const item = {
      id: segment.id, start: cursor, length: frameCount, frameCount,
      durationSec: segment.durationSec, prompt: segment.prompt,
      referencePrompt: segment.referencePrompt || segment.definitions || '',
      material_prompt: segment.referencePrompt || segment.definitions || '',
      commonPrompt: segment.commonPrompt || '',
      common_prompt: segment.commonPrompt || '',
      shotPrompt: segment.shotPrompt || segment.prompt,
      shot_prompt: segment.shotPrompt || segment.prompt,
      negativePrompt: segment.negativePrompt, taskType: '',
      continuityFromPrev: index > 0 && segment.continuityFromPrev,
      selected: segment.enabled, ...refs, refVideos: [], genImage: { imageFile: '', fileName: '' },
    };
    cursor += frameCount;
    return item;
  });
  timeline.totalFrames = cursor;
  timeline.durationSec = segments.reduce((sum, segment) => sum + segment.durationSec, 0);
  timeline.runSelection = settings.runSelectEnabled ? timeline.segments.filter((_: unknown, index: number) => segments[index].enabled).map((segment: Record<string, any>) => segment.id) : [];
  const globalRefs = { refs: [], refAudios: [] };
  timeline.global = { ...(timeline.global || {}), taskType: taskLabel, prompt: '', ...globalRefs };
  timeline.directorMaster = {
    ...(timeline.directorMaster || {}),
    promptChannels: 'reference-material / project-common / shot-direction',
    referencePrompts: timeline.segments.map((segment: Record<string, any>) => segment.referencePrompt || ''),
    commonPrompts: timeline.segments.map((segment: Record<string, any>) => segment.commonPrompt || ''),
  };
  const workspace = timeline.batchWorkspaces?.[settings.taskType];
  if (workspace) {
    workspace.runSelectEnabled = settings.runSelectEnabled;
    workspace.runSelection = timeline.runSelection;
    workspace.segments = timeline.segments.map((segment: Record<string, any>) => ({ ...segment }));
    workspace.globalCommon = { ...(workspace.globalCommon || {}), commonEnabled: false, prompt: '', ...globalRefs };
  }
  return { raw: JSON.stringify(timeline), totalFrames: cursor };
}

function patchTimeline(
  raw: string,
  definitions: string,
  finalPrompt: string,
  pictures: LibraryAsset[],
  audios: LibraryAsset[],
  activeIndex: number,
  settings: DirectorSettings,
  plans: SegmentPlan[],
) {
  const timeline = JSON.parse(raw || '{}');
  const references = referenceData(pictures, audios);
  const taskLabel = taskLabels[settings.taskType];
  timeline.version = Math.max(5, Number(timeline.version || 0));
  timeline.frameRate = settings.frameRate;
  timeline.width = settings.width;
  timeline.height = settings.height;
  timeline.refMaxSize = settings.refMaxSize;
  timeline.global = { ...(timeline.global || {}), taskType: taskLabel, prompt: definitions, ...references };
  timeline.output = {
    ...(timeline.output || {}),
    mode: 'fixed',
    width: settings.width,
    height: settings.height,
    audioMode: settings.audioMode,
    exportMode: settings.exportMode,
    continuityEnabled: settings.continuityEnabled, megapixels: settings.megapixels,
    continuityOverlapFrames: settings.continuityOverlapFrames,
  };
  timeline.runSelectEnabled = settings.runSelectEnabled;
  timeline.segments = Array.isArray(timeline.segments) ? timeline.segments : [];

  let cursor = 0;
  plans.forEach((plan, index) => {
    const frameCount = framesForDuration(plan.durationSec, settings.frameRate);
    const existing = timeline.segments[index] || {
      id: `dm-${Date.now()}-${index}`,
      prompt: '', negativePrompt: '', refs: [], refAudios: [], refVideos: [],
    };
    timeline.segments[index] = {
      ...existing,
      start: cursor,
      length: frameCount,
      frameCount,
      durationSec: plan.durationSec,
      continuityFromPrev: index > 0 && plan.continuityFromPrev,
      selected: plan.enabled,
      ...(index === activeIndex ? {
        prompt: finalPrompt,
        refs: references.refs,
        refAudios: references.refAudios,
        referencePrompt: definitions,
        material_prompt: definitions,
        commonPrompt: '',
        common_prompt: '',
        shotPrompt: finalPrompt,
        shot_prompt: finalPrompt,
      } : {}),
    };
    cursor += frameCount;
  });
  timeline.segments = timeline.segments.slice(0, plans.length);
  timeline.totalFrames = cursor;
  timeline.runSelection = settings.runSelectEnabled
    ? timeline.segments.filter((_: unknown, index: number) => plans[index]?.enabled).map((segment: Record<string, any>) => segment.id)
    : [];

  const workspace = timeline.batchWorkspaces?.[settings.taskType];
  if (workspace) {
    workspace.runSelectEnabled = settings.runSelectEnabled;
    workspace.runSelection = timeline.runSelection;
    workspace.globalCommon = { ...(workspace.globalCommon || {}), prompt: definitions, ...references };
    workspace.segments = timeline.segments.map((segment: Record<string, any>) => ({ ...segment }));
  }
  return JSON.stringify(timeline);
}

export function patchDirectorWorkflow(
  original: Record<string, any>,
  definitions: string,
  finalPrompt: string,
  pictures: LibraryAsset[],
  audios: LibraryAsset[],
  activeIndex: number,
  settings: DirectorSettings,
  plans: SegmentPlan[],
) {
  const workflow = structuredClone(original);
  const info = findDirector(workflow);
  if (!info) throw new Error('未找到 MiniMaxH3Director 节点');
  const taskLabel = taskLabels[settings.taskType];
  const totalFrames = plans.reduce((sum, plan) => sum + framesForDuration(plan.durationSec, settings.frameRate), 0);

  if (info.format === 'ui') {
    const values = info.node.widgets_values;
    if (!Array.isArray(values) || typeof values[11] !== 'string') throw new Error('Director 节点缺少可写入的 timeline_data');
    values[0] = taskLabel;
    values[1] = definitions;
    values[3] = settings.cfg;
    values[4] = settings.seed;
    values[5] = 'fixed';
    values[6] = settings.frameRate;
    values[7] = settings.width;
    values[8] = settings.height;
    values[9] = settings.refMaxSize;
    values[10] = totalFrames;
    values[11] = patchTimeline(values[11], definitions, finalPrompt, pictures, audios, activeIndex, settings, plans);
    values[13] = settings.steps;
    values[14] = settings.sampler;
    values[15] = settings.scheduler;
    values[16] = settings.shiftVideo;
    values[17] = settings.shiftAudio;
    values[19] = settings.clearVram;
    values[20] = settings.exportSourceImages;
  } else {
    const inputs = info.node.inputs || (info.node.inputs = {});
    Object.assign(inputs, {
      task_type: taskLabel,
      global_prompt: definitions,
      cfg: settings.cfg,
      seed: settings.seed,
      frame_rate: settings.frameRate,
      width: settings.width,
      height: settings.height,
      ref_max_size: settings.refMaxSize,
      total_frames: totalFrames,
      steps: settings.steps,
      sampler: settings.sampler,
      scheduler: settings.scheduler,
      shift_video: settings.shiftVideo,
      shift_audio: settings.shiftAudio,
      clear_vram_between_segments: settings.clearVram,
      export_source_images: settings.exportSourceImages,
    });
    inputs.timeline_data = patchTimeline(inputs.timeline_data, definitions, finalPrompt, pictures, audios, activeIndex, settings, plans);
  }
  return workflow;
}

export function patchDirectorProject(
  original: Record<string, any>,
  segments: DirectorSegmentInput[],
  settings: DirectorSettings,
) {
  if (!segments.length) throw new Error('至少需要一个片段');
  const workflow = structuredClone(original);
  const info = findDirector(workflow);
  if (!info) throw new Error('未找到 MiniMaxH3Director 节点');
  const taskLabel = taskLabels[settings.taskType];
  if (info.format === 'ui') {
    const values = info.node.widgets_values;
    if (!Array.isArray(values) || typeof values[11] !== 'string') throw new Error('Director 节点缺少 timeline_data');
    const patched = patchProjectTimeline(values[11], segments, settings);
    values[0] = taskLabel; values[1] = ''; values[3] = settings.cfg; values[4] = settings.seed;
    values[5] = 'fixed'; values[6] = settings.frameRate; values[7] = settings.width; values[8] = settings.height;
    values[9] = settings.refMaxSize; values[10] = patched.totalFrames; values[11] = patched.raw;
    values[13] = settings.steps; values[14] = settings.sampler; values[15] = settings.scheduler;
    values[16] = settings.shiftVideo; values[17] = settings.shiftAudio; values[19] = settings.clearVram; values[20] = settings.exportSourceImages;
  } else {
    const inputs = info.node.inputs || (info.node.inputs = {});
    const patched = patchProjectTimeline(inputs.timeline_data, segments, settings);
    Object.assign(inputs, {
      task_type: taskLabel, global_prompt: '', cfg: settings.cfg, seed: settings.seed,
      frame_rate: settings.frameRate, width: settings.width, height: settings.height,
      ref_max_size: settings.refMaxSize, total_frames: patched.totalFrames, timeline_data: patched.raw,
      steps: settings.steps, sampler: settings.sampler, scheduler: settings.scheduler,
      shift_video: settings.shiftVideo, shift_audio: settings.shiftAudio,
      clear_vram_between_segments: settings.clearVram, export_source_images: settings.exportSourceImages,
    });
  }
  return workflow;
}

function promptLabels(prompt: string, prefix: 'Picture'|'Audio') {
  return Array.from(new Set(Array.from(prompt.matchAll(new RegExp(`<${prefix}\\s+(\\d+)>`, 'g')), (match) => Number(match[1])))).sort((a,b)=>a-b);
}

export function validateDirectorReferences(workflow: Record<string, any>, segments: DirectorSegmentInput[]) {
  const info = findDirector(workflow);
  if (!info) throw new Error('引用校验失败：未找到 MiniMaxH3Director 节点');
  const raw = info.format === 'ui' ? info.node.widgets_values?.[11] : info.node.inputs?.timeline_data;
  if (typeof raw !== 'string') throw new Error('引用校验失败：Director timeline_data 不可解析');
  const timeline = JSON.parse(raw);
  const compiled = Array.isArray(timeline.segments) ? timeline.segments : [];
  const issues: string[] = [];
  if (compiled.length !== segments.length) issues.push(`片段数量不一致：输入 ${segments.length}，工作流 ${compiled.length}`);
  const allAssets = segments.flatMap((segment)=>[...segment.pictures,...segment.audios]);
  const sourcesByFileName = new Map<string, Set<string>>();
  allAssets.forEach((asset) => {
    const source = String(asset.path || asset.id || asset.fileName).toLowerCase();
    const sources = sourcesByFileName.get(asset.fileName) || new Set<string>();
    sources.add(source);
    sourcesByFileName.set(asset.fileName, sources);
  });
  const collisions = Array.from(sourcesByFileName.entries())
    .filter(([, sources]) => sources.size > 1)
    .map(([fileName]) => fileName);
  if (collisions.length)
    issues.push('存在来源不同、会在 ComfyUI 上传区互相覆盖的同名素材：'+collisions.join('、'));
  segments.forEach((source,index)=>{
    const target = compiled[index];
    const label = `SEG ${String(index+1).padStart(2,'0')}`;
    if (!target) return issues.push(label+' 缺少工作流片段');
    const pictureLabels = promptLabels(source.prompt,'Picture');
    const audioLabels = promptLabels(source.prompt,'Audio');
    const referencePrompt = source.referencePrompt || source.definitions || '';
    const referencePictureLabels = promptLabels(referencePrompt,'Picture');
    const referenceAudioLabels = promptLabels(referencePrompt,'Audio');
    const expectedPictures = source.pictures.map((_,assetIndex)=>assetIndex+1);
    const expectedAudios = source.audios.map((_,assetIndex)=>assetIndex+1);
    if (JSON.stringify(pictureLabels)!==JSON.stringify(expectedPictures)) issues.push(label+` Picture 标签与所选图片数量/顺序不一致（提示词: ${pictureLabels.join(',') || '无'}；素材: ${expectedPictures.join(',') || '无'}）`);
    if (JSON.stringify(audioLabels)!==JSON.stringify(expectedAudios)) issues.push(label+` Audio 标签与所选音频数量/顺序不一致（提示词: ${audioLabels.join(',') || '无'}；素材: ${expectedAudios.join(',') || '无'}）`);
    if (JSON.stringify(referencePictureLabels)!==JSON.stringify(expectedPictures)) issues.push(label+` 独立素材引用提示词的 Picture 标签不一致`);
    if (JSON.stringify(referenceAudioLabels)!==JSON.stringify(expectedAudios)) issues.push(label+` 独立素材引用提示词的 Audio 标签不一致`);
    const refs = Array.isArray(target.refs)?target.refs:[];
    const refAudios = Array.isArray(target.refAudios)?target.refAudios:[];
    if (refs.length!==source.pictures.length) issues.push(label+` refs 数量错误：${refs.length}/${source.pictures.length}`);
    if (refAudios.length!==source.audios.length) issues.push(label+` refAudios 数量错误：${refAudios.length}/${source.audios.length}`);
    source.pictures.forEach((asset,assetIndex)=>{const ref=refs[assetIndex];if(!ref||ref.index!==assetIndex||ref.fileName!==asset.fileName||ref.imageFile!==asset.fileName)issues.push(label+` <Picture ${assetIndex+1}> 未正确绑定 ${asset.fileName}`)});
    source.audios.forEach((asset,assetIndex)=>{const ref=refAudios[assetIndex];if(!ref||ref.index!==assetIndex||ref.fileName!==asset.fileName||ref.audioFile!==asset.fileName)issues.push(label+` <Audio ${assetIndex+1}> 未正确绑定 ${asset.fileName}`)});
  });
  const workspaceSegments = timeline.batchWorkspaces?.r2v?.segments;
  if (workspaceSegments && JSON.stringify(workspaceSegments)!==JSON.stringify(compiled)) issues.push('timeline_data.segments 与 batchWorkspaces.r2v.segments 不一致');
  if (issues.length) throw new Error('素材引用契约校验未通过：\n- '+issues.join('\n- '));
  return { ok:true,segmentCount:segments.length,assetCount:allAssets.length };
}

export function uiWorkflowToApi(workflow: Record<string, any>) {
  if (!Array.isArray(workflow.nodes)) return workflow;
  const links = new Map<number, [string, number]>();
  for (const link of workflow.links || []) links.set(Number(link[0]), [String(link[1]), Number(link[2])]);
  const api: Record<string, any> = {};
  for (const node of workflow.nodes) {
    if (node.type === 'MarkdownNote') continue;
    const inputs: Record<string, any> = {};
    let widgetIndex = 0;
    for (const input of node.inputs || []) {
      const hasWidget = Boolean(input.widget);
      const widgetValue = hasWidget ? node.widgets_values?.[widgetIndex++] : undefined;
      if (input.link != null && links.has(Number(input.link))) inputs[input.name] = links.get(Number(input.link));
      else if (hasWidget) inputs[input.name] = widgetValue;
    }
    // MiniMax H3's UNet expects the matching 32B H3 text embedding width.
    // Some imported UI workflows select a general Qwen 4B encoder (or the
    // unavailable NVFP4 variant), which loads but fails during conditioning.
    // Preserve the workflow topology and use the verified local H3 encoder.
    if (node.type === 'CLIPLoader' && inputs.type === 'minimax')
      inputs.clip_name = 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors';
    if (node.type === 'MiniMaxH3Director') {
      const value = node.widgets_values || [];
      Object.assign(inputs, {
        task_type:value[0], global_prompt:value[1], bd_grp_sample:value[2], cfg:value[3], seed:value[4],
        frame_rate:value[6], width:value[7], height:value[8], ref_max_size:value[9], total_frames:value[10],
        timeline_data:value[11], bd_grp_advanced:value[12], steps:value[13], sampler:value[14],
        scheduler:value[15], shift_video:value[16], shift_audio:value[17], bd_grp_perf:value[18],
        clear_vram_between_segments:value[19], export_source_images:value[20],
      });
    }
    api[String(node.id)] = { inputs, class_type: node.type, _meta: { title: node.title || node.type } };
  }
  return api;
}
