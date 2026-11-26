import { createAudioObject, createEmptyProject, createId, createSlide } from '@vedraopus/model';
import type { Project } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { ffmpegArguments, videoLength, videoSchedule, videoSounds } from './plan';

/** What a course video holds (docs/briefs/P11.3-video-and-handout.md, part C). */

const HASH = 'c'.repeat(64);

function course(): Project {
  const project = createEmptyProject('Video');
  project.assets[HASH] = {
    kind: 'audio',
    fileName: 'voice.mp3',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    byteLength: 1,
    duration: 3,
  };
  const [first] = project.scenes[0]!.slides;
  first!.title = 'Welcome';
  first!.baseLayer.timeline.duration = 4;
  const second = createSlide('Exits');
  second.baseLayer.timeline.duration = 2.5;
  const narration = createAudioObject(HASH, 3, {}, 'Narration');
  narration.timing = { start: 1, duration: 'untilEnd' };
  const clicked = createAudioObject(HASH, 3, {}, 'Clicked');
  clicked.props.startOn = 'trigger';
  first!.baseLayer.objects.push(narration, clicked);
  const late = createAudioObject(HASH, 3, {}, 'Late');
  late.timing = { start: 1.5, duration: 'untilEnd' };
  late.props.volume = 0.5;
  second.baseLayer.objects.push(late);
  project.scenes[0]!.slides.push(second);
  return project;
}

describe('the video’s slides', () => {
  it('follow the course, each for its timeline, in whole frames', () => {
    const schedule = videoSchedule(course());
    expect(
      schedule.map(({ title, start, duration, frames }) => [title, start, duration, frames]),
    ).toEqual([
      ['Welcome', 0, 4, 120],
      ['Exits', 4, 2.5, 75],
    ]);
    expect(videoLength(schedule)).toBe(6.5);
  });

  it('leave out a slide that only opens as a lightbox', () => {
    const project = course();
    const [welcome, exits] = project.scenes[0]!.slides;
    welcome!.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: welcome!.id },
      event: { type: 'keyPress', key: 'h' },
      action: { type: 'openLightbox', slide: exits!.id, controls: true },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    expect(videoSchedule(project).map((slide) => slide.title)).toEqual(['Welcome']);
  });
});

describe('the video’s sounds', () => {
  it('are those that play with their timelines, placed in the video and cut at their slide’s end', () => {
    const project = course();
    const sounds = videoSounds(project, videoSchedule(project));
    expect(sounds.map(({ at, length, volume }) => [at, length, volume])).toEqual([
      // Welcome's narration: from 1 s, all 3 s of it.
      [1, 3, 1],
      // Exits': from 4 + 1.5 s, cut at the slide's end (1 s left).
      [5.5, 1, 0.5],
    ]);
  });
});

describe('the ffmpeg command', () => {
  it('takes raw frames from the pipe, places and mixes the sounds, and writes VP9 and Opus', () => {
    const args = ffmpegArguments({
      frame: { width: 1281, height: 721 },
      size: { width: 1281, height: 721 },
      fps: 30,
      length: 6.5,
      sounds: [
        { path: '/a.mp3', at: 1, length: 3, volume: 1 },
        { path: '/b.mp3', at: 5.5, length: 1, volume: 0.5 },
      ],
      output: '/out.webm',
    });
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    expect(at('-s')).toBe('1281x721');
    expect(at('-pix_fmt')).toBe('bgra');
    expect(args.filter((arg) => arg === '-i')).toHaveLength(3);
    const graph = at('-filter_complex')!;
    // Even sizes for the encoder.
    expect(graph).toContain('scale=1282:722');
    expect(graph).toContain('[1:a]atrim=0:3,asetpts=PTS-STARTPTS,volume=1,adelay=1000:all=1[a0]');
    expect(graph).toContain('adelay=5500:all=1[a1]');
    expect(graph).toContain('[a0][a1]amix=inputs=2:normalize=0');
    expect(at('-c:v')).toBe('libvpx-vp9');
    expect(at('-c:a')).toBe('libopus');
    expect(at('-t')).toBe('6.5');
    expect(args.at(-1)).toBe('/out.webm');
  });

  it('has no sound track when the course has no sounds', () => {
    const args = ffmpegArguments({
      frame: { width: 640, height: 360 },
      size: { width: 640, height: 360 },
      fps: 30,
      length: 2,
      sounds: [],
      output: '/out.webm',
    });
    expect(args).not.toContain('-c:a');
    expect(args.filter((arg) => arg === '-map')).toHaveLength(1);
  });
});
