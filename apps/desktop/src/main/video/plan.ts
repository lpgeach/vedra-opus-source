/**
 * What a course video holds (docs/briefs/P11.3-video-and-handout.md, part C):
 * the slides in order with their lengths, the sounds and where they fall, and
 * the ffmpeg command that makes the WebM. Pure: no Electron, no disk.
 */
import { forEachObject, opensAsLightbox } from '@vedraopus/model';
import type { AssetMeta, Project } from '@vedraopus/model';

export const VIDEO_FPS = 30;

export interface VideoSlide {
  slideId: string;
  title: string;
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds: the slide's timeline. */
  duration: number;
  /** Frames it is shown for. */
  frames: number;
}

/** The slides in course order, each for its timeline's length. */
export function videoSchedule(project: Project, fps = VIDEO_FPS): VideoSlide[] {
  const slides: VideoSlide[] = [];
  let frame = 0;
  for (const scene of project.scenes) {
    for (const slide of scene.slides) {
      if (opensAsLightbox(project, slide.id)) continue;
      const duration = Math.max(0.5, slide.baseLayer.timeline.duration);
      const frames = Math.max(1, Math.round(duration * fps));
      slides.push({ slideId: slide.id, title: slide.title, start: frame / fps, duration, frames });
      frame += frames;
    }
  }
  return slides;
}

/** Seconds the whole video lasts. */
export const videoLength = (schedule: readonly VideoSlide[], fps = VIDEO_FPS) =>
  schedule.reduce((frames, slide) => frames + slide.frames, 0) / fps;

export interface VideoSound {
  hash: string;
  meta: AssetMeta;
  /** Seconds from the start of the video. */
  at: number;
  /** Seconds it plays for: to its end, or its slide's. */
  length: number;
  volume: number;
}

/**
 * The sounds that play with their slides' timelines, placed in the video. A
 * sound a trigger plays is not in a run-through; nor is a video's own sound.
 */
export function videoSounds(project: Project, schedule: readonly VideoSlide[]): VideoSound[] {
  const sounds: VideoSound[] = [];
  const slides = new Map(
    project.scenes.flatMap((scene) => scene.slides).map((slide) => [slide.id, slide]),
  );
  for (const entry of schedule) {
    const slide = slides.get(entry.slideId);
    if (!slide) continue;
    forEachObject(slide.baseLayer.objects, (object) => {
      if (object.type !== 'audio' || object.props.startOn !== 'timeline') return;
      const meta = project.assets[object.props.asset];
      if (!meta) return;
      const begins = object.timing.start;
      if (begins >= entry.duration) return;
      const until =
        object.timing.duration === 'untilEnd'
          ? entry.duration
          : Math.min(entry.duration, begins + object.timing.duration);
      const length = Math.min(object.props.length, until - begins);
      if (length <= 0) return;
      sounds.push({
        hash: object.props.asset,
        meta,
        at: entry.start + begins,
        length,
        volume: object.props.volume,
      });
    });
  }
  return sounds;
}

/** A number for ffmpeg: no exponent, a few decimals. */
const n = (value: number) => String(Math.round(value * 1000) / 1000);

/**
 * ffmpeg's arguments: raw frames from a pipe, each sound placed and mixed,
 * VP9 and Opus in WebM, cut to the video's length.
 */
export function ffmpegArguments(options: {
  /** The size of each raw frame written to the pipe (BGRA). */
  frame: { width: number; height: number };
  /** The video's size: the stage, made even for the encoder. */
  size: { width: number; height: number };
  fps: number;
  length: number;
  sounds: readonly { path: string; at: number; length: number; volume: number }[];
  output: string;
}): string[] {
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const width = even(options.size.width);
  const height = even(options.size.height);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'bgra',
    '-s',
    `${options.frame.width}x${options.frame.height}`,
    '-r',
    String(options.fps),
    '-i',
    'pipe:0',
  ];
  for (const sound of options.sounds) args.push('-i', sound.path);
  const filters = [`[0:v]scale=${width}:${height}:flags=lanczos,format=yuv420p[v]`];
  if (options.sounds.length > 0) {
    options.sounds.forEach((sound, index) => {
      const delay = Math.round(sound.at * 1000);
      filters.push(
        `[${index + 1}:a]atrim=0:${n(sound.length)},asetpts=PTS-STARTPTS,volume=${n(sound.volume)},adelay=${delay}:all=1[a${index}]`,
      );
    });
    filters.push(
      `${options.sounds.map((_, index) => `[a${index}]`).join('')}amix=inputs=${options.sounds.length}:normalize=0:duration=longest,apad[a]`,
    );
  }
  args.push('-filter_complex', filters.join(';'), '-map', '[v]');
  if (options.sounds.length > 0) args.push('-map', '[a]', '-c:a', 'libopus', '-b:a', '128k');
  args.push(
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '32',
    '-deadline',
    'good',
    '-cpu-used',
    '4',
    '-row-mt',
    '1',
    '-t',
    n(options.length),
    options.output,
  );
  return args;
}
