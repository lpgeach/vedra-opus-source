/**
 * Reading what our ffmpeg may not (H.264, AAC and the like) through the operating
 * system's own licensed decoders (docs/briefs/R3-os-decoders.md): `vo-decode`,
 * our helper beside ffmpeg on Windows (Media Foundation) and macOS (AVFoundation),
 * decodes; our ffmpeg only encodes, to WebM or MP3, as for any other file.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { progressSeconds } from './ffmpeg';
import type { MediaTools } from './ffmpeg';

/** What `vo-decode info` says the system can read in a file. */
export interface SystemInfo {
  duration: number | null;
  video: { width: number; height: number; fps: string; rotation: number } | null;
  audio: { sampleRate: number; channels: number } | null;
  /** Tracks the file has that the system cannot decode. */
  unreadable: ('video' | 'audio')[];
}

/** `vo-decode info`'s line of JSON. Throws on anything else. */
export function parseSystemInfo(json: string): SystemInfo {
  const data = JSON.parse(json) as Partial<SystemInfo>;
  const duration = Number(data.duration);
  const video = data.video ?? null;
  if (video && !(video.width > 0 && video.height > 0 && /^\d+\/\d+$/.test(video.fps))) {
    throw new Error('the system described the picture oddly');
  }
  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    video,
    audio: data.audio ?? null,
    unreadable: (data.unreadable ?? []).filter(
      (each): each is 'video' | 'audio' => each === 'video' || each === 'audio',
    ),
  };
}

/** The filter that turns a picture upright, from the degrees it is turned (clockwise). */
export function uprightFilter(rotation: number): string[] {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return ['-vf', 'transpose=clock'];
    case 180:
      return ['-vf', 'hflip,vflip'];
    case 270:
      return ['-vf', 'transpose=cclock'];
    default:
      return [];
  }
}

/**
 * The colour standard of the system decoder's pictures, which YUV4MPEG2 cannot carry:
 * BT.709 from 720 lines up, BT.601 below, as the decoders and players take an untagged
 * picture to be. Tagged on the WebM, so it shows as ffmpeg's own conversions do.
 */
export function colourArgs(width: number, height: number): string[] {
  const standard = Math.min(width, height) >= 720 ? 'bt709' : 'smpte170m';
  return ['-colorspace', standard, '-color_primaries', standard, '-color_trc', standard];
}

/** The system could not read the file (or not all of it); `format` names what it is in. */
export class SystemDecodeError extends Error {
  constructor(
    reason: string,
    readonly format: string | null = null,
  ) {
    super(reason);
    this.name = 'SystemDecodeError';
  }
}

interface Run {
  done: Promise<void>;
}

/** Start a program; `done` settles when it ends, with the end of its error output on failure. */
function start(
  command: string,
  args: readonly string[],
  stdio: ('pipe' | 'ignore')[],
  onStdoutLine?: (line: string) => void,
): { child: ReturnType<typeof spawn> } & Run {
  const child = spawn(command, args, { stdio, windowsHide: true });
  let err = '';
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    err = (err + chunk).slice(-2000);
  });
  if (onStdoutLine && child.stdout) {
    let partial = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines) onStdoutLine(line.trim());
    });
  }
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim().split('\n').pop() || `exited with code ${code}`));
    });
  });
  return { child, done };
}

/** `vo-decode info`: what the system can read in `input`. */
export async function systemInfo(decoder: string, input: string): Promise<SystemInfo> {
  let out = '';
  const run = start(decoder, ['info', input], ['ignore', 'pipe', 'pipe']);
  run.child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
  try {
    await run.done;
  } catch (error) {
    throw new SystemDecodeError(error instanceof Error ? error.message : String(error));
  }
  return parseSystemInfo(out.trim());
}

/** The arguments for VP9 and Opus in WebM, as for any converted video (normalise.ts). */
export const WEBM_ARGS = [
  '-c:v',
  'libvpx-vp9',
  '-crf',
  '33',
  '-b:v',
  '0',
  '-deadline',
  'good',
  '-cpu-used',
  '5',
  '-row-mt',
  '1',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'libopus',
  '-b:a',
  '96k',
];

/** The arguments for MP3, as for any converted sound. */
export const MP3_ARGS = ['-c:a', 'libmp3lame', '-q:a', '2'];

/**
 * Convert `input` through the system's decoders into `workDir`: WebM for a
 * picture (with its sound), MP3 for sound alone. Returns the output's path and kind.
 */
export async function convertThroughSystem(
  tools: MediaTools & { decoder: string },
  input: string,
  workDir: string,
  onProgress?: (fraction: number) => void,
): Promise<{ path: string; kind: 'audio' | 'video' }> {
  const info = await systemInfo(tools.decoder, input);
  if (info.unreadable.length > 0) {
    throw new SystemDecodeError(
      info.unreadable.length === 2
        ? 'its picture and sound'
        : `its ${info.unreadable[0] === 'video' ? 'picture' : 'sound'}`,
    );
  }
  if (!info.video && !info.audio) throw new SystemDecodeError('its picture and sound');
  const wav = join(workDir, 'system-sound.wav');
  if (info.audio) {
    try {
      await start(tools.decoder, ['audio', input, wav], ['ignore', 'ignore', 'pipe']).done;
    } catch (error) {
      throw new SystemDecodeError(error instanceof Error ? error.message : String(error));
    }
  }
  const progress = (line: string) => {
    const done = progressSeconds(line);
    if (done !== null && info.duration && onProgress) onProgress(Math.min(1, done / info.duration));
  };
  const common = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];
  const tail = ['-progress', 'pipe:1', '-nostats'];

  if (!info.video) {
    const output = join(workDir, 'converted.mp3');
    await start(
      tools.ffmpeg,
      [...common, '-i', wav, '-map', '0:a:0', ...MP3_ARGS, ...tail, output],
      ['ignore', 'pipe', 'pipe'],
      progress,
    ).done;
    return { path: output, kind: 'audio' };
  }

  // The picture streams from the system's decoder straight into ffmpeg; the sound waits in the WAV.
  const output = join(workDir, 'converted.webm');
  const ffmpeg = start(
    tools.ffmpeg,
    [
      '-hide_banner',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'yuv4mpegpipe',
      '-i',
      'pipe:0',
      ...(info.audio ? ['-i', wav] : []),
      '-map',
      '0:v:0',
      ...(info.audio ? ['-map', '1:a:0'] : []),
      ...uprightFilter(info.video.rotation),
      ...colourArgs(info.video.width, info.video.height),
      ...WEBM_ARGS,
      ...tail,
      output,
    ],
    ['pipe', 'pipe', 'pipe'],
    progress,
  );
  const decode = start(tools.decoder, ['video', input], ['ignore', 'pipe', 'pipe']);
  // If ffmpeg stops early, the decoder's writes fail; its own exit says what happened.
  ffmpeg.child.stdin?.on('error', () => undefined);
  decode.child.stdout?.pipe(ffmpeg.child.stdin!);
  const [decoded, encoded] = await Promise.allSettled([decode.done, ffmpeg.done]);
  if (decoded.status === 'rejected') {
    throw new SystemDecodeError(
      decoded.reason instanceof Error ? decoded.reason.message : String(decoded.reason),
    );
  }
  if (encoded.status === 'rejected') throw encoded.reason;
  return { path: output, kind: 'video' };
}
