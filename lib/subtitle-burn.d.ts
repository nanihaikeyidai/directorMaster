export function escapeSubtitlesFilterPath(filePath: string): string;

export function buildBurnFfmpegArgs(input: {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  mode?: string;
}): string[];

export function resolveBurnSubtitleFile(input: {
  outDir: string;
  basename: string;
  assPath?: string;
  srtPath?: string;
  written?: {
    ass?: string;
    srtSource?: string;
    srtTarget?: string;
    cueCount?: number;
  };
}): string;

export type FfmpegProbeResult = {
  available: boolean;
  path: string;
};

export type BurnSubtitlesInput = {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  requireFfmpeg?: boolean;
};

export type BurnSubtitlesDeps = {
  execFile?: (
    file: string,
    args: string[],
    options?: object,
  ) => Promise<unknown>;
  probe?: () => Promise<FfmpegProbeResult>;
};

export type BurnSubtitlesResult =
  | {
      status: 'burned';
      outputPath: string;
      ffmpegArgs: string[];
    }
  | {
      status: 'skipped';
      reason: string;
      outputPath: null;
      ffmpegArgs?: string[];
    };

export function probeFfmpeg(deps?: {
  execFile?: (
    file: string,
    args: string[],
    options?: object,
  ) => Promise<unknown>;
}): Promise<FfmpegProbeResult>;

export function burnSubtitlesIntoVideo(
  input: BurnSubtitlesInput,
  deps?: BurnSubtitlesDeps,
): Promise<BurnSubtitlesResult>;
