import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFileCb);

const SRT_FORCE_STYLE =
  "Fontsize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=24";

/**
 * Normalize path for ffmpeg `subtitles=` filter: forward slashes + escape `:`.
 * Same idea as redub burn-in (Windows drive letters).
 * @param {string} filePath
 * @returns {string}
 */
export function escapeSubtitlesFilterPath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:');
}

/**
 * @param {{ videoPath: string, subtitlePath: string, outputPath: string, mode?: string }} input
 * @returns {string[]}
 */
export function buildBurnFfmpegArgs(input) {
  const videoPath = String(input?.videoPath || '');
  const subtitlePath = String(input?.subtitlePath || '');
  const outputPath = String(input?.outputPath || '');
  if (!videoPath) throw new Error('buildBurnFfmpegArgs 需要 videoPath');
  if (!subtitlePath) throw new Error('buildBurnFfmpegArgs 需要 subtitlePath');
  if (!outputPath) throw new Error('buildBurnFfmpegArgs 需要 outputPath');

  const escaped = escapeSubtitlesFilterPath(subtitlePath);
  const ext = path.extname(subtitlePath).toLowerCase();
  const isAss = ext === '.ass' || ext === '.ssa';
  const vf = isAss
    ? `subtitles='${escaped}'`
    : `subtitles='${escaped}':force_style='${SRT_FORCE_STYLE}'`;

  return [
    '-hide_banner',
    '-y',
    '-i',
    videoPath,
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'copy',
    outputPath,
  ];
}

/**
 * Prefer bilingual ASS from writeBilingualSubtitles result; else first SRT; else conventional ASS path.
 * @param {{
 *   outDir: string,
 *   basename: string,
 *   assPath?: string,
 *   srtPath?: string,
 *   written?: { ass?: string, srtSource?: string, srtTarget?: string, cueCount?: number },
 * }} input
 * @returns {string}
 */
export function resolveBurnSubtitleFile(input) {
  const outDir = String(input?.outDir || '');
  const basename = String(input?.basename || 'subtitles');
  const written = input?.written;

  if (input?.assPath) return String(input.assPath);
  if (written?.ass) return String(written.ass);
  if (input?.srtPath) return String(input.srtPath);
  if (written?.srtSource) return String(written.srtSource);
  if (written?.srtTarget) return String(written.srtTarget);

  return path.join(outDir, `${basename}.bilingual.ass`);
}

/**
 * @param {{ execFile?: (file: string, args: string[], options?: object) => Promise<unknown> }} [deps]
 * @returns {Promise<{ available: boolean, path: string }>}
 */
export async function probeFfmpeg(deps = {}) {
  const bin = 'ffmpeg';
  const execFile = deps.execFile || ((file, args, options) => execFileAsync(file, args, options || {}));
  try {
    await execFile(bin, ['-version'], { windowsHide: true, timeout: 15000 });
    return { available: true, path: bin };
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    if (code === 'ENOENT' || code === 'ENOTFOUND') {
      return { available: false, path: bin };
    }
    // Non-zero exit still means binary exists for -version in some builds; treat other throws as unavailable.
    if (err && typeof err === 'object' && 'stdout' in err) {
      return { available: true, path: bin };
    }
    return { available: false, path: bin };
  }
}

/**
 * @param {{
 *   videoPath: string,
 *   subtitlePath: string,
 *   outputPath: string,
 *   requireFfmpeg?: boolean,
 * }} input
 * @param {{
 *   execFile?: (file: string, args: string[], options?: object) => Promise<unknown>,
 *   probe?: () => Promise<{ available: boolean, path: string }>,
 * }} [deps]
 */
export async function burnSubtitlesIntoVideo(input, deps = {}) {
  const videoPath = String(input?.videoPath || '').trim();
  const subtitlePath = String(input?.subtitlePath || '').trim();
  const outputPath = String(input?.outputPath || '').trim();
  if (!videoPath) {
    throw new Error('burnSubtitlesIntoVideo 需要 videoPath（视频路径）');
  }
  if (!subtitlePath) {
    throw new Error('burnSubtitlesIntoVideo 需要 subtitlePath（字幕路径）');
  }
  if (!outputPath) {
    throw new Error('burnSubtitlesIntoVideo 需要 outputPath');
  }

  const probe = deps.probe || (() => probeFfmpeg({ execFile: deps.execFile }));
  const probed = await probe();
  if (!probed?.available) {
    if (input.requireFfmpeg) {
      throw new Error(
        'ffmpeg not found / 未找到 ffmpeg：硬字幕烧录需要本机 ffmpeg。请安装后重试，或去掉 --burn 仅导出软字幕。',
      );
    }
    return { status: 'skipped', reason: 'ffmpeg-not-found', outputPath: null };
  }

  const ffmpegArgs = buildBurnFfmpegArgs({ videoPath, subtitlePath, outputPath });
  const execFile = deps.execFile || ((file, args, options) => execFileAsync(file, args, options || {}));
  await execFile(probed.path || 'ffmpeg', ffmpegArgs, {
    windowsHide: true,
    timeout: 600000,
  });

  return { status: 'burned', outputPath, ffmpegArgs };
}
