import {
  createAudioObject,
  createButtonObject,
  createEmptyProject,
  createGroupObject,
  createId,
  createLayer,
  createScene,
  createSlide,
} from '@vedraopus/model';
import type {
  AudioObject,
  Project,
  Slide,
  Trigger,
  TriggerAction,
  TriggerEvent,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { Engine, EngineEvent, MediaView } from './index';

const HASH = 'a'.repeat(64);

function trigger(owner: Trigger['owner'], event: TriggerEvent, action: TriggerAction): Trigger {
  return {
    id: createId('trigger'),
    owner,
    event,
    action,
    conditions: null,
    otherwise: null,
    enabled: true,
  };
}

/**
 * A 10 s slide with narration (6 s, from 0 s, with the timeline), a sound
 * effect waiting for a trigger (2 s), a button, and an overlay layer with
 * its own audio. `build` may change any of it.
 */
function setup(
  build?: (s: {
    slide: Slide;
    narration: AudioObject;
    effect: AudioObject;
    overlayAudio: AudioObject;
    button: ReturnType<typeof createButtonObject>;
  }) => void,
) {
  const project: Project = createEmptyProject('Media');
  project.assets[HASH] = {
    kind: 'audio',
    fileName: 'a.wav',
    ext: 'wav',
    mimeType: 'audio/wav',
    byteLength: 1,
  };
  const slide = createSlide('One');
  slide.baseLayer.timeline.duration = 10;
  const narration = createAudioObject(HASH, 6, {}, 'Narration');
  const effect = createAudioObject(HASH, 2, {}, 'Effect');
  effect.props.startOn = 'trigger';
  effect.timing = { start: 0, duration: 'untilEnd' };
  const button = createButtonObject('Go');
  button.timing = { start: 0, duration: 'untilEnd' };
  const overlay = createLayer('Overlay');
  overlay.timeline.duration = 5;
  const overlayAudio = createAudioObject(HASH, 3, {}, 'Overlay audio');
  overlay.objects.push(overlayAudio);
  slide.baseLayer.objects.push(narration, effect, button);
  slide.layers.push(overlay);
  build?.({ slide, narration, effect, overlayAudio, button });
  project.scenes = [{ ...createScene(), slides: [slide, createSlide('Two')] }];
  const engine = createEngine(project);
  const events: EngineEvent[] = [];
  engine.on((event) => events.push(event));
  let now = 0;
  engine.tick(now);
  const at = (seconds: number) => {
    now += seconds * 1000;
    engine.tick(now);
  };
  const media = (id: string): MediaView | undefined =>
    engine
      .getView()
      .layers.flatMap((layer) => layer.media)
      .find((each) => each.id === id);
  const base = () => engine.getView().layers[0]!;
  const completed = () =>
    events
      .filter((e) => e.type === 'mediaComplete')
      .map((e) => (e as { objectId: string }).objectId);
  return {
    engine,
    slide,
    narration,
    effect,
    overlay,
    overlayAudio,
    button,
    at,
    media,
    base,
    completed,
    events,
  };
}

const click = (engine: Engine, id: string) => engine.pointer('click', id);

describe('audio with the timeline', () => {
  it('plays from where the playhead is, and stops at its end with one media-complete', () => {
    const { at, media, narration, completed } = setup();
    expect(media(narration.id)).toEqual({
      id: narration.id,
      playing: true,
      time: 0,
      volume: 1,
      caption: null,
    });
    at(2.5);
    expect(media(narration.id)).toMatchObject({ playing: true, time: 2.5 });
    at(4);
    expect(media(narration.id)).toMatchObject({ playing: false, time: 6 });
    expect(completed()).toEqual([narration.id]);
    at(1);
    expect(completed()).toEqual([narration.id]);
  });

  it('starts when the playhead reaches it, and stops without completing if it leaves the timeline early', () => {
    const { at, media, narration, completed } = setup(({ narration }) => {
      narration.timing = { start: 2, duration: 3 };
    });
    expect(media(narration.id)).toMatchObject({ playing: false, time: 0 });
    at(3);
    expect(media(narration.id)).toMatchObject({ playing: true, time: 1 });
    at(3);
    // Off the timeline at 5 s, three seconds in: silent, and not complete.
    expect(media(narration.id)).toMatchObject({ playing: false, time: 3 });
    expect(completed()).toEqual([]);
  });

  it('pauses with its timeline, by trigger or by an overlay that pauses the base', () => {
    const { engine, at, media, narration, overlay, base } = setup(({ slide }) => {
      slide.layers[0]!.properties.pauseBaseTimeline = true;
    });
    at(1);
    engine.setPaused(base().id, true);
    at(2);
    expect(media(narration.id)).toMatchObject({ playing: false, time: 1 });
    engine.setPaused(base().id, false);
    at(1);
    expect(media(narration.id)).toMatchObject({ playing: true, time: 2 });
    engine.showLayer(overlay.id);
    at(1);
    expect(media(narration.id)).toMatchObject({ playing: false, time: 2 });
    engine.hideLayer(overlay.id);
    at(1);
    expect(media(narration.id)).toMatchObject({ playing: true, time: 3 });
  });

  it('carries its volume to the view', () => {
    const { media, narration } = setup(({ narration }) => {
      narration.props.volume = 0.25;
    });
    expect(media(narration.id)?.volume).toBe(0.25);
  });
});

describe('play, pause and stop media', () => {
  it('waits for a trigger when set to, then plays on its own and completes', () => {
    const { engine, at, media, effect, button, slide, completed } = setup(
      ({ slide, effect, button }) => {
        slide.triggers.push(
          trigger(
            { kind: 'object', id: button.id },
            { type: 'click', object: button.id },
            { type: 'playMedia', object: effect.id },
          ),
        );
      },
    );
    void slide;
    at(1);
    expect(media(effect.id)).toMatchObject({ playing: false, time: 0 });
    click(engine, button.id);
    at(1.5);
    expect(media(effect.id)).toMatchObject({ playing: true, time: 1.5 });
    at(1);
    expect(media(effect.id)).toMatchObject({ playing: false, time: 2 });
    expect(completed()).toEqual([effect.id]);
    // Played again after completing: from the start.
    click(engine, button.id);
    expect(media(effect.id)).toMatchObject({ playing: true, time: 0 });
  });

  it('pauses where it is, plays on from there, and stops back to the start', () => {
    const { engine, at, media, narration, slide } = setup();
    const run = (type: 'playMedia' | 'pauseMedia' | 'stopMedia') => {
      slide.triggers.length = 0;
      // Drive the action through a key trigger, as a learner would.
      slide.triggers.push(
        trigger(
          { kind: 'slide', id: slide.id },
          { type: 'keyPress', key: type[0]! },
          { type, object: narration.id },
        ),
      );
      engine.key(type[0]!);
    };
    at(1);
    run('pauseMedia');
    at(2);
    expect(media(narration.id)).toMatchObject({ playing: false, time: 1 });
    run('playMedia');
    at(1);
    // Now on its own: two seconds of timeline passed, one second of sound.
    expect(media(narration.id)).toMatchObject({ playing: true, time: 2 });
    run('stopMedia');
    at(1);
    expect(media(narration.id)).toMatchObject({ playing: false, time: 0 });
    // Stopped, it waits: the timeline going on does not start it again.
    at(1);
    expect(media(narration.id)).toMatchObject({ playing: false, time: 0 });
  });

  it('leaves audio already playing with the timeline alone', () => {
    const { engine, at, media, narration, slide } = setup(({ slide, narration }) => {
      slide.triggers.push(
        trigger(
          { kind: 'slide', id: slide.id },
          { type: 'keyPress', key: 'p' },
          { type: 'playMedia', object: narration.id },
        ),
      );
    });
    void slide;
    at(2);
    engine.key('p');
    at(1);
    // Still tied to the playhead (3 s), not restarted.
    expect(media(narration.id)).toMatchObject({ playing: true, time: 3 });
    engine.seek(engine.getView().layers[0]!.id, 1);
    expect(media(narration.id)).toMatchObject({ time: 1 });
  });

  it('runs media-completes triggers', () => {
    const { at, engine, narration } = setup(({ slide, narration }) => {
      slide.triggers.push(
        trigger(
          { kind: 'slide', id: slide.id },
          { type: 'mediaCompletes', object: narration.id },
          { type: 'jumpToSlide', target: { kind: 'next' } },
        ),
      );
    });
    void narration;
    at(5.9);
    expect(engine.getView().slideIndex).toBe(0);
    at(0.2);
    expect(engine.getView().slideIndex).toBe(1);
  });
});

describe('the audio keeps the time', () => {
  it('moves its layer’s playhead with the reported time, not the clock', () => {
    const { engine, at, base, narration } = setup();
    at(0.5);
    expect(base().playhead).toBeCloseTo(0.5);
    // The audio is behind the clock (it took a moment to start): the timeline waits for it.
    engine.mediaTime(narration.id, 0.6);
    at(1);
    expect(base().playhead).toBeCloseTo(0.6);
    engine.mediaTime(narration.id, 1.6);
    at(1);
    expect(base().playhead).toBeCloseTo(1.6);
  });

  it('holds the timeline while the audio stalls, and never moves it back', () => {
    const { engine, at, base, narration } = setup();
    engine.mediaTime(narration.id, 2);
    at(0.1);
    expect(base().playhead).toBeCloseTo(2);
    for (let i = 0; i < 3; i++) {
      engine.mediaTime(narration.id, 2);
      at(0.5);
    }
    expect(base().playhead).toBeCloseTo(2);
    engine.mediaTime(narration.id, 1);
    at(0.1);
    expect(base().playhead).toBeCloseTo(2);
  });

  it('waits at most two seconds for audio that reports but never moves on', () => {
    const { engine, at, base, narration } = setup();
    engine.mediaTime(narration.id, 1);
    at(0.1);
    // Stuck at 1 s, as a browser that cannot play the file on would report.
    // Stalled 0.1 s, then 0.6, 1.1, 1.6: still within two seconds, so held.
    for (let i = 0; i < 3; i++) {
      engine.mediaTime(narration.id, 1);
      at(0.5);
    }
    expect(base().playhead).toBeCloseTo(1);
    for (let i = 0; i < 3; i++) {
      engine.mediaTime(narration.id, 1);
      at(0.5);
    }
    // 2.1, 2.6, 3.1 s: past two seconds the clock moves it on, 0.5 s a step: 1 → 2.5.
    expect(base().playhead).toBeCloseTo(2.5);
    // Once the audio moves on again, it keeps the time again.
    const now = base().playhead;
    engine.mediaTime(narration.id, now + 0.2);
    at(1);
    expect(base().playhead).toBeCloseTo(now + 0.2);
  });

  it('falls back to the clock when the audio stops reporting', () => {
    const { engine, at, base, narration } = setup();
    engine.mediaTime(narration.id, 1);
    at(0.1);
    at(1);
    expect(base().playhead).toBeCloseTo(2);
  });

  it('is the earliest-starting audio playing with the timeline; other reports are ignored', () => {
    const { engine, at, base, narration, effect } = setup(({ narration, effect }) => {
      narration.timing = { start: 1, duration: 6 };
      effect.props.startOn = 'timeline';
      effect.props.length = 8;
      effect.timing = { start: 0, duration: 8 };
    });
    engine.mediaTime(narration.id, 3);
    at(0.5);
    // Narration starts later, so the effect (from 0 s) keeps time: the clock moved it.
    expect(base().playhead).toBeCloseTo(0.5);
    engine.mediaTime(effect.id, 2);
    at(0.1);
    expect(base().playhead).toBeCloseTo(2);
  });

  it('keeps the place of audio playing on its own', () => {
    const { engine, at, media, effect, button } = setup(({ slide, effect, button }) => {
      slide.triggers.push(
        trigger(
          { kind: 'object', id: button.id },
          { type: 'click', object: button.id },
          { type: 'playMedia', object: effect.id },
        ),
      );
    });
    click(engine, button.id);
    engine.mediaTime(effect.id, 1.25);
    expect(media(effect.id)?.time).toBe(1.25);
    void at;
  });

  it('ignores reports for audio that is not playing', () => {
    const { engine, at, base, effect } = setup();
    engine.mediaTime(effect.id, 1.5);
    at(0.5);
    expect(base().playhead).toBeCloseTo(0.5);
  });
});

describe('resetting', () => {
  it('starts again on entering the slide, and showing a layer starts its audio', () => {
    const { engine, at, media, narration, overlay, overlayAudio } = setup();
    at(2);
    engine.showLayer(overlay.id);
    at(1);
    expect(media(overlayAudio.id)).toMatchObject({ playing: true, time: 1 });
    engine.hideLayer(overlay.id);
    expect(media(overlayAudio.id)).toBeUndefined();
    engine.showLayer(overlay.id);
    expect(media(overlayAudio.id)).toMatchObject({ playing: true, time: 0 });
    engine.next();
    engine.previous();
    expect(media(narration.id)).toMatchObject({ playing: true, time: 0 });
  });

  it('finds audio inside groups', () => {
    const { media, narration } = setup(({ slide, narration }) => {
      slide.baseLayer.objects = slide.baseLayer.objects.filter((o) => o !== narration);
      slide.baseLayer.objects.push(createGroupObject([narration]));
    });
    expect(media(narration.id)).toMatchObject({ playing: true });
  });
});
