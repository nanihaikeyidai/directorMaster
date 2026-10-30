import assert from 'node:assert/strict';
import path from 'node:path';

const {
  escapeSubtitlesFilterPath,
  buildBurnFfmpegArgs,
  resolveBurnSubtitleFile,
  probeFfmpeg,
  burnSubtitlesIntoVideo,
} = await import('../lib/subtitle-burn.mjs');

// --- escapeSubtitlesFilterPath ---
{
  const win = escapeSubtitlesFilterPath('C:\\subs\\a.ass');
  assert.equal(win, 'C\\:/subs/a.ass');
  assert.ok(!win.includes('\\\\'), 'no Windows path separators left');
  assert.ok(win.includes('\\:'), 'drive colon escaped as \\:');
  assert.ok(win.startsWith('C\\:') || win.includes('C\\:/'), 'escaped drive letter');
  assert.ok(win.includes('subs/a.ass') || win.endsWith('subs/a.ass'));

  const posix = escapeSubtitlesFilterPath('/tmp/foo bar.ass');
  assert.equal(posix, '/tmp/foo bar.ass');
  assert.ok(posix.includes(' '), 'spaces preserved; quoting is arg-builder concern');
}

// --- buildBurnFfmpegArgs ASS vs SRT ---
{
  const assArgs = buildBurnFfmpegArgs({
    videoPath: '/v/in.mp4',
    subtitlePath: '/tmp/subs/a.ass',
    outputPath: '/v/out.mp4',
  });
  assert.ok(Array.isArray(assArgs));
  assert.ok(assArgs.includes('-hide_banner'));
  assert.ok(assArgs.includes('-y'));
  assert.ok(assArgs.includes('-i'));
  assert.ok(assArgs.includes('/v/in.mp4'));
  assert.ok(assArgs.includes('-vf'));
  const vfAss = assArgs[assArgs.indexOf('-vf') + 1];
  assert.ok(typeof vfAss === 'string' && vfAss.includes('subtitles='));
  assert.equal(vfAss.includes('force_style'), false, 'ASS must not force_style');
  assert.ok(assArgs.includes('-c:v'));
  assert.ok(assArgs.includes('libx264'));
  assert.ok(assArgs.includes('-preset'));
  assert.ok(assArgs.includes('veryfast'));
  assert.ok(assArgs.includes('-crf'));
  assert.ok(assArgs.includes('18'));
  assert.ok(assArgs.includes('-c:a'));
  assert.ok(assArgs.includes('copy'));
  assert.equal(assArgs[assArgs.length - 1], '/v/out.mp4');

  const srtArgs = buildBurnFfmpegArgs({
    videoPath: '/v/in.mp4',
    subtitlePath: '/tmp/subs/a.srt',
    outputPath: '/v/out.mp4',
  });
  const vfSrt = srtArgs[srtArgs.indexOf('-vf') + 1];
  assert.ok(vfSrt.includes('subtitles='));
  assert.ok(vfSrt.includes('force_style'), 'SRT must include force_style');
  assert.ok(vfSrt.includes('Fontsize=18'));
}

// --- probeFfmpeg ---
{
  const missing = await probeFfmpeg({
    execFile: async () => {
      const err = new Error('spawn ffmpeg ENOENT');
      err.code = 'ENOENT';
      throw err;
    },
  });
  assert.equal(missing.available, false);
  assert.ok(typeof missing.path === 'string');

  const ok = await probeFfmpeg({
    execFile: async () => ({ stdout: 'ffmpeg version 7.0', stderr: '' }),
  });
  assert.equal(ok.available, true);
  assert.ok(typeof ok.path === 'string');
}

// --- burnSubtitlesIntoVideo: missing ffmpeg → skipped ---
{
  const result = await burnSubtitlesIntoVideo(
    {
      videoPath: '/v/in.mp4',
      subtitlePath: '/tmp/a.ass',
      outputPath: '/v/out.burned.mp4',
    },
    {
      probe: async () => ({ available: false, path: 'ffmpeg' }),
      execFile: async () => {
        throw new Error('should not exec');
      },
    },
  );
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'ffmpeg-not-found');
  assert.equal(result.outputPath, null);
}

// --- burnSubtitlesIntoVideo: happy mock ---
{
  /** @type {string[] | null} */
  let recordedArgs = null;
  const outputPath = '/v/out.burned.mp4';
  const subtitlePath = 'C:\\subs\\a.ass';
  const result = await burnSubtitlesIntoVideo(
    {
      videoPath: '/v/in.mp4',
      subtitlePath,
      outputPath,
    },
    {
      probe: async () => ({ available: true, path: 'ffmpeg' }),
      execFile: async (_bin, args) => {
        recordedArgs = args;
        return { stdout: '', stderr: '' };
      },
    },
  );
  assert.equal(result.status, 'burned');
  assert.equal(result.outputPath, outputPath);
  assert.ok(Array.isArray(result.ffmpegArgs));
  assert.deepEqual(recordedArgs, result.ffmpegArgs);
  const vf = result.ffmpegArgs[result.ffmpegArgs.indexOf('-vf') + 1];
  assert.ok(vf.includes('subtitles='));
  assert.ok(vf.includes('\\:') || vf.includes('C\\:'), 'escaped path in filter');
  assert.equal(result.ffmpegArgs[result.ffmpegArgs.length - 1], outputPath);
}

// --- missing videoPath / subtitlePath → throw ---
{
  await assert.rejects(
    () =>
      burnSubtitlesIntoVideo(
        { videoPath: '', subtitlePath: '/a.ass', outputPath: '/o.mp4' },
        { probe: async () => ({ available: true, path: 'ffmpeg' }) },
      ),
    /video|视频/i,
  );
  await assert.rejects(
    () =>
      burnSubtitlesIntoVideo(
        { videoPath: '/v.mp4', subtitlePath: '', outputPath: '/o.mp4' },
        { probe: async () => ({ available: true, path: 'ffmpeg' }) },
      ),
    /subtitle|字幕/i,
  );
}

// --- resolveBurnSubtitleFile prefers written.ass ---
{
  const resolved = resolveBurnSubtitleFile({
    outDir: '/out',
    basename: 'subtitles',
    written: {
      srtSource: '/out/subtitles.zh.srt',
      srtTarget: '/out/subtitles.en.srt',
      ass: '/out/subtitles.bilingual.ass',
      cueCount: 2,
    },
  });
  assert.equal(resolved, '/out/subtitles.bilingual.ass');

  const fallback = resolveBurnSubtitleFile({
    outDir: '/out',
    basename: 'clip',
    written: {
      srtSource: '/out/clip.zh.srt',
      srtTarget: '/out/clip.en.srt',
      cueCount: 1,
    },
  });
  assert.ok(
    fallback === '/out/clip.zh.srt' ||
      fallback === '/out/clip.en.srt' ||
      fallback.endsWith('.srt'),
  );

  const conventional = resolveBurnSubtitleFile({
    outDir: '/out',
    basename: 'subtitles',
  });
  assert.ok(
    conventional === path.join('/out', 'subtitles.bilingual.ass') ||
      String(conventional).includes('bilingual.ass'),
  );
}

console.log('test-subtitle-burn: ok');
