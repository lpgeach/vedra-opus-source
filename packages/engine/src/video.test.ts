import {
  createAudioObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  createVideoObject,
} from '@vedraopus/model';
import type { Project, Trigger, VideoObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine, playedLength } from './index';
import type { EngineEvent, MediaView } from './index';

const FILM = 'b'.repeat(64);
const SOUND = 'c'.repeat(64);

/** A 10 s slide with a 6 s video (played from 1 s to 4 s of its file). */
function setup(edit?: (s: { video: VideoObject; project: Project }) => void) {
  const project = createEmptyProject('Video');
  project.assets[FILM] = {
    kind: 'video',
    fileName: 'f.webm',
    ext: 'webm',
    mimeType: 'video/webm',
    byteLength: 1,
  };
  project.assets[SOUND] = {
    kind: 'audio',
    fileName: 's.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: 1,
  };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 10;
  const video = createVideoObject(FILM, 6, {}, 'Film');
  video.props.trimStart = 1;
  video.props.trimEnd = 4;
  video.timing = { start: 0, duration: 3 };
  slide.baseLayer.objects.push(video);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  edit?.({ video, project });
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const media = (id = video.id): MediaView | undefined =>
    engine
      .getView()
      .layers.flatMap((l) => l.media)
      .find((m) => m.id === id);
  const completed = () => events.filter((e) => e.type === 'mediaComplete').length;
  return { engine, video, at, media, completed, slide };
}

describe('video as media', () => {
  it('plays only between its trim points, and completes at the end of them', () => {
    const { at, media, video, completed } = setup();
    expect(playedLength(video)).toBe(3);
    at(1);
    expect(media()).toMatchObject({ playing: true, time: 1 });
    at(2.5);
    expect(media()).toMatchObject({ playing: false, time: 3 });
    expect(completed()).toBe(1);
  });

  it('keeps its layer’s time like audio, and the earliest of audio and video is the master', () => {
    const { engine, at, video } = setup(({ project, video }) => {
      const audio = createAudioObject(SOUND, 5);
      audio.timing = { start: 0.5, duration: 5 };
      project.scenes[0]!.slides[0]!.baseLayer.objects.push(audio);
      void video;
    });
    engine.mediaTime(video.id, 0.2);
    at(1);
    expect(engine.getView().layers[0]!.playhead).toBeCloseTo(0.2);
  });

  it('plays and pauses on a click when set to start on a click, and the click’s triggers still run', () => {
    const { engine, at, media, video, slide } = setup(({ video, project }) => {
      video.props.startOn = 'click';
      project.variables.push({ id: 'var_clicks', name: 'Clicks', type: 'boolean', default: false });
      const slide = project.scenes[0]!.slides[0]!;
      const toggle: Trigger = {
        id: createId('trigger'),
        owner: { kind: 'object', id: video.id },
        event: { type: 'click', object: video.id },
        action: { type: 'toggleVariable', variable: 'var_clicks' },
        conditions: null,
        otherwise: null,
        enabled: true,
      };
      slide.triggers.push(toggle);
    });
    void slide;
    at(0.5);
    expect(media()).toMatchObject({ playing: false, time: 0 });
    engine.pointer('click', video.id);
    at(1);
    expect(media()).toMatchObject({ playing: true, time: 1 });
    engine.pointer('click', video.id);
    at(1);
    expect(media()).toMatchObject({ playing: false, time: 1 });
    expect(engine.getVariable('Clicks')).toBe(false);
    engine.pointer('click', video.id);
    expect(media()).toMatchObject({ playing: true, time: 1 });
  });

  it('leaves a click on a video with controls to the controls', () => {
    const { engine, at, media, video } = setup(({ video }) => {
      video.props.startOn = 'click';
      video.props.controls = true;
    });
    engine.pointer('click', video.id);
    at(0.5);
    expect(media()).toMatchObject({ playing: false, time: 0 });
    // The player reports what the controls did.
    engine.mediaControl(video.id, true, 0);
    at(0.5);
    expect(media()).toMatchObject({ playing: true, time: 0.5 });
  });

  it('a click does nothing to a video that starts with the timeline', () => {
    const { engine, at, media, video } = setup();
    at(1);
    engine.pointer('click', video.id);
    at(0.5);
    expect(media()).toMatchObject({ playing: true, time: 1.5 });
  });

  it('follows the learner’s own controls: pause, play and moving it', () => {
    const { engine, at, media, video } = setup();
    at(1);
    engine.mediaControl(video.id, false, 1.2);
    at(1);
    expect(media()).toMatchObject({ playing: false, time: 1.2 });
    engine.mediaControl(video.id, true, 0.5);
    at(1);
    // Now on its own: from 0.5 s, one second on, although the timeline is at 3 s.
    expect(media()).toMatchObject({ playing: true, time: 1.5 });
    engine.mediaControl(video.id, true, 99);
    expect(media()).toMatchObject({ playing: false, time: 3 });
  });
});
