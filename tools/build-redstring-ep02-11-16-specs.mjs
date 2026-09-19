import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = 'D:/HermesWorkspace/ai小说/红绳';
const episodeRoot = path.join(projectRoot, '05-workflow/ep02');
const outputRoot = 'D:/HermesWorkspace/directorMaster/workspace/production/redstring-ep02-11-16';
const workflow = 'F:/ComfyUI_V6.0/MiniMax H3 导演台全能工作流红绳_api.json';
const ids = [11, 12, 13, 14, 15, 16];

function fenced(markdown, label) {
  const match = markdown.match(new RegExp('## ' + label + '[\\s\\S]*?```text\\r?\\n([\\s\\S]*?)\\r?\\n```'));
  if (!match) throw new Error('未找到 ' + label);
  return match[1].trim();
}

function promptAssets(markdown, segmentDir) {
  const lines = markdown.split(/\r?\n/);
  const assets = [];
  for (const line of lines) {
    const match = line.match(/^- `@图片\d+` → `<Picture \d+>`[\s\S]*?文件 `([^`]+)`/);
    if (!match) continue;
    const file = path.resolve(segmentDir, match[1]);
    if (!existsSync(file)) throw new Error('素材缺失: ' + file);
    assets.push({ path: file, mediaType: 'image', description: 'Project-approved reference asset for this segment.' });
  }
  const board = path.join(segmentDir, '故事板.png');
  const firstFrame = path.join(segmentDir, '首帧图.png');
  if (!existsSync(board) || !existsSync(firstFrame)) throw new Error('缺少故事板或首帧: ' + segmentDir);
  assets.push({ path: board, mediaType: 'image', description: 'Storyboard planning reference for shot order only; do not render panel borders or text.' });
  assets.push({ path: firstFrame, mediaType: 'image', description: 'Opening-frame composition reference; do not inherit any readable text.' });
  return assets;
}

function negative(markdown) { return fenced(markdown, 'negativePrompt'); }

mkdirSync(outputRoot, { recursive: true });
for (const id of ids) {
  const segmentDir = path.join(episodeRoot, `红绳片段${id}`);
  const markdown = readFileSync(path.join(segmentDir, '视频提示词.md'), 'utf8');
  const assets = promptAssets(markdown, segmentDir);
  const spec = {
    workflow,
    settings: { fps: 24, width: 1376, height: 768, megapixels: 2, steps: 20, seed: 666, cfg: 1, audioMode: 'generate' },
    outputDir: path.join(outputRoot, `segment${id}`),
    segments: [{
      id: `redstring_ep02_segment${id}`,
      title: `红绳 EP02 片段${id}`,
      durationSec: 15,
      continuityFromPrev: false,
      finalPrompt: fenced(markdown, '可直接粘贴的主提示词'),
      negativePrompt: negative(markdown),
      assets
    }]
  };
  const target = path.join(outputRoot, `segment${id}.json`);
  writeFileSync(target, JSON.stringify(spec, null, 2));
  console.log(target);
}
