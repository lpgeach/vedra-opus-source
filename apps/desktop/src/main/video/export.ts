/**
 * Making the course video (docs/briefs/P11.3-video-and-handout.md, part C):
 * the real player, in a hidden offscreen window, driven frame by frame on a
 * clock main sets, each frame captured and piped to ffmpeg with the sounds.
 */
import { publishWeb } from '@vedraopus/publish';
import type { GraphicLibrary } from '@vedraopus/publish';
import type { Project } from '@vedraopus/model';
import { BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { renameWithRetry } from '../fs-retry';
import { PREVIEW_PARTITION } from '../preview';
import type { Previews } from '../preview';
import { assetPath } from '../project/paths';
import { PREVIEW_SCHEME } from '../project/protocol';
import { ffmpegArguments, VIDEO_FPS, videoLength, videoSchedule, videoSounds } from './plan';

export class VideoCancelled extends Error {}

/**
 * The course page for the video: the player started without its own frame
 * loop and on a clock main sets, and media that never play (their time would
 * move timelines in real time, and the sound is mixed in by ffmpeg instead).
 */
function videoPage(page: string): string {
  const hold =
    '<script>window.__voClock=0;HTMLMediaElement.prototype.play=function(){return Promise.resolve();};</script>';
  return page
    .replace('<head>', `<head>${hold}`)
    .replace(
      "VedraOpusPlayer.startCourse(document.getElementById('course'), window.VEDRAOPUS_COURSE, {",
      "VedraOpusPlayer.startCourse(document.getElementById('course'), window.VEDRAOPUS_COURSE, {\n  autoStart: false, reducedMotion: false, clock: function () { return window.__voClock; },",
    );
}

export interface VideoRequest {
  project: Project;
  workspaceDir: string;
  output: string;
  ffmpeg: string;
  player: { js: string; css: string };
  notices?: Partial<Record<GraphicLibrary, string>>;
  previews: Previews;
  onProgress?: (fraction: number) => void;
  /** Checked between frames; true stops the export. */
  cancelled?: () => boolean;
}

/** Make the video at `output` (written beside it, then renamed when complete). */
export async function exportVideo(request: VideoRequest): Promise<{ seconds: number }> {
  const { project } = request;
  const schedule = videoSchedule(project);
  if (schedule.length === 0) throw new Error('The course has no slides to show.');
  const length = videoLength(schedule);
  const totalFrames = schedule.reduce((sum, slide) => sum + slide.frames, 0);

  // The course, as Preview builds it, with the video's page.
  const files = new Map<string, string | Uint8Array>();
  await publishWeb(project, {
    player: request.player,
    readAsset: (hash, meta) => readFile(assetPath(request.workspaceDir, hash, meta.ext)),
    write: async (path, data) => void files.set(path, data),
    preview: true,
    ...(request.notices ? { notices: request.notices } : {}),
  });
  files.set('index.html', videoPage(files.get('index.html') as string));
  const token = request.previews.host(files);

  const { width, height } = project.stage;
  const window = new BrowserWindow({
    show: false,
    width,
    height: height + 160,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: PREVIEW_PARTITION,
    },
  });
  // Held to the screen, or 1 x 1 with none (P11.3 part B): give it its size.
  window.setContentSize(width, height + 160);
  window.webContents.setAudioMuted(true);
  const partial = `${request.output}.part`;
  let ffmpeg: ReturnType<typeof spawn> | null = null;
  try {
    await window.loadURL(`${PREVIEW_SCHEME}://${token}/index.html`);
    const run = <T>(code: string) => window.webContents.executeJavaScript(code) as Promise<T>;
    await run(
      'new Promise((r) => { const w = () => window.VEDRAOPUS_PLAYER ? r(true) : setTimeout(w, 20); w(); })',
    );
    const rect = await run<{ x: number; y: number; width: number; height: number }>(
      "(() => { const r = document.querySelector('.vo-player-stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()",
    );
    // Rounded inwards, so no edge of the player's frame around the stage is caught.
    const left = Math.max(0, Math.ceil(rect.x));
    const top = Math.max(0, Math.ceil(rect.y));
    const area = {
      x: left,
      y: top,
      width: Math.max(2, Math.floor(rect.x + rect.width) - left),
      height: Math.max(2, Math.floor(rect.y + rect.height) - top),
    };

    const sounds = videoSounds(project, schedule).map((sound) => ({
      path: assetPath(request.workspaceDir, sound.hash, sound.meta.ext),
      at: sound.at,
      length: sound.length,
      volume: sound.volume,
    }));
    const args = ffmpegArguments({
      frame: { width: area.width, height: area.height },
      size: { width, height },
      fps: VIDEO_FPS,
      length,
      sounds,
      output: partial,
    });
    // The output is named by us, so ffmpeg is told its format.
    args.splice(args.length - 1, 0, '-f', 'webm');
    const child = spawn(request.ffmpeg, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    });
    ffmpeg = child;
    let errors = '';
    child.stderr!.on('data', (chunk: Buffer) => {
      if (errors.length < 4000) errors += chunk.toString();
    });
    const finished = new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    const write = (bytes: Buffer) =>
      new Promise<void>((resolve, reject) => {
        if (child.stdin!.write(bytes, (error) => (error ? reject(error) : undefined))) resolve();
        else child.stdin!.once('drain', resolve);
      });

    let frame = 0;
    for (const slide of schedule) {
      for (let index = 0; index < slide.frames; index++) {
        if (request.cancelled?.()) throw new VideoCancelled('The export was cancelled.');
        const ms = (frame * 1000) / VIDEO_FPS;
        const jump =
          index === 0
            ? `window.VEDRAOPUS_PLAYER.engine.jumpToSlide(${JSON.stringify(slide.slideId)});`
            : '';
        // Set the clock, move the slide on, and wait for the frame to be painted.
        await run(
          `window.__voClock = ${ms}; ${jump} window.VEDRAOPUS_PLAYER.tick(${ms}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
        );
        let image = await window.webContents.capturePage(area);
        const size = image.getSize();
        if (size.width !== area.width || size.height !== area.height) {
          image = image.resize({ width: area.width, height: area.height });
        }
        await write(image.toBitmap());
        frame += 1;
        request.onProgress?.(frame / totalFrames);
      }
    }
    child.stdin!.end();
    const code = await finished;
    if (code !== 0) {
      throw new Error(
        `ffmpeg could not make the video${errors.trim() ? `: ${errors.trim().split('\n')[0]}` : ''}`,
      );
    }
    await renameWithRetry(partial, request.output);
    return { seconds: length };
  } catch (error) {
    ffmpeg?.kill();
    await rm(partial, { force: true });
    throw error;
  } finally {
    request.previews.unhost(token);
    window.destroy();
  }
}
