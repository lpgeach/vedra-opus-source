/**
 * Running the bundled ffmpeg and ffprobe (docs/briefs/P6.3-media-pipeline.md).
 * They are separate programs started as child processes; nothing is linked
 * into the app.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface MediaTools {
  ffmpeg: string;
  ffprobe: string;
  /**
   * `vo-decode`, which reads H.264, AAC and the like through the operating system's
   * own licensed decoders (Windows and macOS; docs/briefs/R3-os-decoders.md).
   */
  decoder?: string;
}

/** The first of these folders that holds `bin/ffmpeg` and `bin/ffprobe`, or null. */
export function findMediaTools(folders: readonly (string | undefined)[]): MediaTools | null {
  const exe = process.platform === 'win32' ? '.exe' : '';
  for (const folder of folders) {
    if (!folder) continue;
    const ffmpeg = join(folder, 'bin', `ffmpeg${exe}`);
    const ffprobe = join(folder, 'bin', `ffprobe${exe}`);
    if (!existsSync(ffmpeg) || !existsSync(ffprobe)) continue;
    const decoder = join(folder, 'bin', `vo-decode${exe}`);
    const systemDecodes = process.platform === 'win32' || process.platform === 'darwin';
    return systemDecodes && existsSync(decoder)
      ? { ffmpeg, ffprobe, decoder }
      : { ffmpeg, ffprobe };
  }
  return null;
}

/** Where `npm run fetch:ffmpeg` puts the build for this machine. */
export function vendorFolder(repositoryRoot: string): string {
  const os =
    { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform as string] ?? process.platform;
  return join(repositoryRoot, 'vendor', 'ffmpeg', `${os}-${process.arch}`);
}

/** What ffprobe says about a file, in the parts the pipeline uses. */
export interface Probe {
  /** ffprobe's container names, such as "matroska,webm" or "mov,mp4,m4a,3gp,3g2,mj2". */
  container: string;
  /** Seconds, or null when the file does not say (recordings). */
  duration: number | null;
  video: { codec: string; width: number; height: number } | null;
  audio: { codec: string } | null;
}

/** ffprobe's JSON (`-show_format -show_streams`), reduced to a Probe. Throws on anything else. */
export function parseProbe(json: string): Probe {
  const data = JSON.parse(json) as {
    format?: { format_name?: string; duration?: string };
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      disposition?: { attached_pic?: number };
    }[];
  };
  if (!data.format?.format_name) throw new Error('not a media file');
  const streams = data.streams ?? [];
  // Cover art in an MP3 is a video stream too; it is not a picture that moves.
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === 'audio');
  const duration = Number(data.format.duration);
  return {
    container: data.format.format_name,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    video: video
      ? { codec: video.codec_name ?? '', width: video.width ?? 0, height: video.height ?? 0 }
      : null,
    audio: audio ? { codec: audio.codec_name ?? '' } : null,
  };
}

function collect(
  command: string,
  args: readonly string[],
  onLine?: (line: string) => void,
): Promise<{ out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    let partial = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      out += chunk;
      if (!onLine) return;
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines) onLine(line.trim());
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      // Keep the end: that is where ffmpeg says what went wrong.
      err = (err + chunk).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(err.trim().split('\n').pop() || `exited with code ${code}`));
    });
  });
}

export async function probe(tools: MediaTools, file: string): Promise<Probe> {
  const { out } = await collect(tools.ffprobe, [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    file,
  ]);
  return parseProbe(out);
}

/** How far ffmpeg is, from one line of its `-progress` output: seconds done, or null. */
export function progressSeconds(line: string): number | null {
  const match = /^out_time_us=(\d+)$/.exec(line);
  return match ? Number(match[1]) / 1_000_000 : null;
}

/**
 * Run ffmpeg on `input` to `output` with `args` between them. `onProgress`
 * gets the fraction done (0–1) when the input's length is known.
 */
export async function runFfmpeg(
  tools: MediaTools,
  input: string,
  args: readonly string[],
  output: string,
  options: { duration?: number | null; onProgress?: (fraction: number) => void } = {},
): Promise<void> {
  const { duration, onProgress } = options;
  await collect(
    tools.ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-loglevel',
      'error',
      '-i',
      input,
      ...args,
      '-progress',
      'pipe:1',
      '-nostats',
      output,
    ],
    (line) => {
      const done = progressSeconds(line);
      if (done !== null && duration && onProgress) onProgress(Math.min(1, done / duration));
    },
  );
}
