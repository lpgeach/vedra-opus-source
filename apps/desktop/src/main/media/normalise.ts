/**
 * Turning imported and recorded media into files every current browser plays
 * and can seek in: MP3 for sound, WebM (VP9 and Opus) for video. Luke chose
 * these over H.264/AAC (docs/briefs/P6.3-media-pipeline.md).
 */
import { join } from 'node:path';
import { probe, runFfmpeg } from './ffmpeg';
import type { MediaTools, Probe } from './ffmpeg';
import { convertThroughSystem, MP3_ARGS, SystemDecodeError, WEBM_ARGS } from './system-decoder';

export type MediaPlan =
  | { action: 'keep' }
  | {
      action: 'remux' | 'convert';
      kind: 'audio' | 'video';
      ext: 'mp3' | 'webm';
      mimeType: string;
      args: string[];
    };

/**
 * Formats our ffmpeg reads: only those known to be royalty-free. Anything that
 * needs a patent licence to decode is refused on Linux, which has no licensed
 * decoder of its own (Luke, 2026-11-17; docs/licences.md). An allow-list, so a
 * format nobody thought of is refused rather than let through. On Windows and
 * macOS the operating system's own decoders read the rest (`vo-decode`, R3).
 */
export const ROYALTY_FREE = {
  video: new Set(['vp8', 'vp9', 'av1', 'theora']),
  audio: new Set(['opus', 'vorbis', 'flac', 'mp3']),
} as const;
/** PCM in all its sample formats (WAV and the like) is free too. */
const isPcm = (codec: string) => codec.startsWith('pcm_');

/** The names authors know formats by; anything else is shown as ffmpeg names it. */
const FORMAT_NAMES: Record<string, string> = {
  h264: 'H.264',
  hevc: 'H.265 (HEVC)',
  vvc: 'H.266 (VVC)',
  mpeg2video: 'MPEG-2 video',
  mpeg4: 'MPEG-4 Part 2',
  mpeg1video: 'MPEG-1 video',
  prores: 'ProRes',
  wmv1: 'Windows Media Video',
  wmv2: 'Windows Media Video',
  wmv3: 'Windows Media Video',
  vc1: 'VC-1',
  aac: 'AAC',
  ac3: 'Dolby Digital (AC-3)',
  eac3: 'Dolby Digital Plus (E-AC-3)',
  dts: 'DTS',
  alac: 'Apple Lossless',
  amr_nb: 'AMR',
  amr_wb: 'AMR-WB',
  wmav2: 'Windows Media Audio',
};
const formatName = (codec: string) => FORMAT_NAMES[codec] ?? codec.toUpperCase();

/** A file in a format Vedra Opus will not read here. `message` is safe to show the author. */
export class PatentedFormatError extends Error {
  constructor(readonly format: string) {
    super(`uses ${format}`);
    this.name = 'PatentedFormatError';
  }
}

export interface PlanOptions {
  /** Read only royalty-free formats (our ffmpeg has no patented decoders). */
  refusePatented?: boolean;
}

const WEBM_VIDEO = new Set(['vp8', 'vp9']);
const WEBM_AUDIO = new Set(['opus', 'vorbis']);

/** What to do with a file ffprobe described. Throws for a file with neither sound nor picture. */
export function planFor(info: Probe, options: PlanOptions = {}): MediaPlan {
  if (options.refusePatented) {
    const refused = [
      info.video && !ROYALTY_FREE.video.has(info.video.codec) ? formatName(info.video.codec) : null,
      info.audio && !ROYALTY_FREE.audio.has(info.audio.codec) && !isPcm(info.audio.codec)
        ? formatName(info.audio.codec)
        : null,
    ].filter((name): name is string => name !== null);
    if (refused.length > 0) throw new PatentedFormatError(refused.join(' and '));
  }
  if (info.video) {
    const webm = info.container.split(',').includes('webm');
    if (
      webm &&
      WEBM_VIDEO.has(info.video.codec) &&
      (!info.audio || WEBM_AUDIO.has(info.audio.codec))
    ) {
      // Already right; copied into a fresh file so it has a seek index and a duration.
      return {
        action: 'remux',
        kind: 'video',
        ext: 'webm',
        mimeType: 'video/webm',
        args: ['-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy'],
      };
    }
    return {
      action: 'convert',
      kind: 'video',
      ext: 'webm',
      mimeType: 'video/webm',
      args: ['-map', '0:v:0', '-map', '0:a:0?', ...WEBM_ARGS],
    };
  }
  if (info.audio) {
    if (info.audio.codec === 'mp3' && info.container.split(',').includes('mp3'))
      return { action: 'keep' };
    return {
      action: 'convert',
      kind: 'audio',
      ext: 'mp3',
      mimeType: 'audio/mpeg',
      args: ['-vn', '-map', '0:a:0', ...MP3_ARGS],
    };
  }
  throw new Error('has no sound or picture in it');
}

export interface Normalised {
  /** The file to store: the input itself when it was kept. */
  path: string;
  kind: 'audio' | 'video';
  ext: string;
  mimeType: string;
  info: Probe;
  changed: boolean;
}

/**
 * Probe `input`, and convert or remux it into `workDir` when it needs it.
 * `ext` is the input's own extension, kept when the file is kept.
 */
export async function normalise(
  tools: MediaTools,
  input: string,
  ext: string,
  mimeType: string,
  workDir: string,
  onProgress?: (fraction: number) => void,
  options: PlanOptions = {},
): Promise<Normalised> {
  const before = await probe(tools, input);
  let plan: MediaPlan;
  try {
    plan = planFor(before, options);
  } catch (error) {
    // A format our ffmpeg may not read: the system's own decoders read it, where they can.
    if (!(error instanceof PatentedFormatError) || !tools.decoder) throw error;
    let decoded;
    try {
      decoded = await convertThroughSystem(
        { ...tools, decoder: tools.decoder },
        input,
        workDir,
        onProgress,
      );
    } catch (failure) {
      if (failure instanceof SystemDecodeError) {
        throw new SystemDecodeError(failure.message, error.format);
      }
      throw failure;
    }
    return {
      path: decoded.path,
      kind: decoded.kind,
      ext: decoded.kind === 'video' ? 'webm' : 'mp3',
      mimeType: decoded.kind === 'video' ? 'video/webm' : 'audio/mpeg',
      info: await probe(tools, decoded.path),
      changed: true,
    };
  }
  if (plan.action === 'keep') {
    return {
      path: input,
      kind: before.video ? 'video' : 'audio',
      ext,
      mimeType,
      info: before,
      changed: false,
    };
  }
  const output = join(workDir, `converted.${plan.ext}`);
  await runFfmpeg(tools, input, plan.args, output, {
    duration: before.duration,
    ...(onProgress ? { onProgress } : {}),
  });
  const after = await probe(tools, output);
  return {
    path: output,
    kind: plan.kind,
    ext: plan.ext,
    mimeType: plan.mimeType,
    info: after,
    changed: true,
  };
}

/** Where a poster frame is taken: a second in, or a tenth of the way through a short video. */
export const posterTime = (duration: number | null) => Math.min(1, (duration ?? 0) / 10);

/** Save the frame at `seconds` as a PNG. */
export async function extractPoster(
  tools: MediaTools,
  video: string,
  seconds: number,
  output: string,
): Promise<void> {
  await runFfmpeg(tools, video, ['-ss', String(seconds), '-frames:v', '1', '-update', '1'], output);
}
