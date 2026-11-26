import {
  createAudioObject,
  createEmptyProject,
  createId,
  createScene,
  createSlide,
  createVideoObject,
} from '@vedraopus/model';
import type { AudioObject, CaptionCue, VideoObject } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';

const cue = (start: number, end: number, text: string): CaptionCue => ({
  id: createId('caption'),
  start,
  end,
  text,
});

/** A 10 s slide with one piece of media on it; `at(s)` moves the clock on. */
function setup(media: AudioObject | VideoObject) {
  const project = createEmptyProject('Captions');
  project.assets[media.props.asset] = {
    kind: media.type === 'video' ? 'video' : 'audio',
    fileName: 'm',
    ext: media.type === 'video' ? 'webm' : 'mp3',
    mimeType: 'x',
    byteLength: 1,
  };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 10;
  slide.baseLayer.objects.push(media);
  project.scenes = [{ ...createScene(), slides: [slide] }];
  const engine = createEngine(project);
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const caption = () => engine.getView().layers[0]!.media.find((m) => m.id === media.id)!.caption;
  return { engine, at, caption, slide };
}

describe('captions in the view', () => {
  it('show the cue at the media’s place, joining overlapping ones, and none between cues', () => {
    const audio = createAudioObject('a'.repeat(64), 6);
    audio.props.captions = [cue(0, 2, 'Hello'), cue(1.5, 3, 'and welcome'), cue(4, 6, 'Bye')];
    const { at, caption } = setup(audio);
    expect(caption()).toBe('Hello'); // 0 s
    at(1.6); // 1.6 s: in both 0–2 and 1.5–3
    expect(caption()).toBe('Hello\nand welcome');
    at(1); // 2.6 s: only 1.5–3
    expect(caption()).toBe('and welcome');
    at(0.6); // 3.2 s: between cues
    expect(caption()).toBeNull();
    at(1); // 4.2 s: in 4–6
    expect(caption()).toBe('Bye');
    at(3); // 7.2 s: the 6 s sound has finished
    expect(caption()).toBeNull();
  });

  it('count a trimmed video’s time from its file, so imported captions line up', () => {
    const video = createVideoObject('b'.repeat(64), 10);
    video.props.trimStart = 3;
    video.props.trimEnd = 8;
    video.timing = { start: 0, duration: 5 };
    // Cue times are in the file: the first is cut away by the trim.
    video.props.captions = [cue(1, 2, 'Cut away'), cue(3, 4.5, 'First seen'), cue(5, 6, 'Later')];
    const { at, caption } = setup(video);
    expect(caption()).toBe('First seen');
    at(2.2);
    expect(caption()).toBe('Later');
  });

  it('stay while the media is paused part way, and go when it is stopped or waiting to start', () => {
    const audio = createAudioObject('a'.repeat(64), 6);
    audio.timing = { start: 1, duration: 6 };
    audio.props.captions = [cue(0, 6, 'Talking')];
    const { engine, at, caption } = setup(audio);
    // Its place on the timeline is not reached yet.
    expect(caption()).toBeNull();
    at(1.5);
    expect(caption()).toBe('Talking');
    engine.setPaused(engine.getView().layers[0]!.id, true);
    at(1);
    expect(caption()).toBe('Talking');
  });

  it('go when the media is stopped by a trigger', () => {
    const audio = createAudioObject('a'.repeat(64), 6);
    audio.props.captions = [cue(0, 6, 'Talking')];
    const { engine, at, caption, slide } = setup(audio);
    slide.triggers.push({
      id: createId('trigger'),
      owner: { kind: 'slide', id: slide.id },
      event: { type: 'keyPress', key: 's' },
      action: { type: 'stopMedia', object: audio.id },
      conditions: null,
      otherwise: null,
      enabled: true,
    });
    at(1);
    expect(caption()).toBe('Talking');
    engine.key('s');
    expect(caption()).toBeNull();
  });
});
