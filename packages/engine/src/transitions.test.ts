import {
  createEmptyProject,
  createLayer,
  createScene,
  createShapeObject,
  createSlide,
  createTransition,
} from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { createEngine } from './index';
import type { SessionState } from './types';

/** Three slides; the second and third have a 1 s push; the second has a pop-up with a 0.5 s fade. */
function setup() {
  const project = createEmptyProject('Transitions');
  const slides = [createSlide('One'), createSlide('Two'), createSlide('Three')];
  slides[1]!.properties.transition = { ...createTransition('push', 1), direction: 'left' };
  slides[2]!.properties.transition = createTransition('fade', 1);
  const popUp = createLayer('Pop-up');
  popUp.properties.transition = createTransition('fade', 0.5);
  const box = createShapeObject({ kind: 'rect' });
  popUp.objects.push(box);
  slides[1]!.layers.push(popUp);
  project.scenes = [{ ...createScene(), slides }];
  const make = (restore?: SessionState) => {
    const engine = createEngine(project, restore ? { restore } : {});
    let now = 0;
    engine.tick(now);
    const at = (seconds: number) => {
      now += seconds * 1000;
      engine.tick(now);
    };
    return { engine, at };
  };
  return { slides, popUp, box, make };
}

describe('slide transitions', () => {
  it('play from the slide left, on the engine clock, and end', () => {
    const { slides, make } = setup();
    const { engine, at } = make();
    // None on the first slide.
    expect(engine.getView().transition).toBeUndefined();
    engine.next();
    expect(engine.getView().transition).toEqual({
      kind: 'push',
      direction: 'left',
      duration: 1,
      time: 0,
      fromSlideId: slides[0]!.id,
    });
    // Pausing the timeline does not pause it.
    engine.setPaused(slides[1]!.baseLayer.id, true);
    at(0.25);
    expect(engine.getView().transition!.time).toBeCloseTo(0.25);
    at(1);
    expect(engine.getView().transition).toBeUndefined();
  });

  it('play going back and jumping too, and give way to the next one', () => {
    const { slides, make } = setup();
    const { engine, at } = make();
    engine.jumpToSlide(slides[2]!.id);
    expect(engine.getView().transition).toMatchObject({ kind: 'fade', fromSlideId: slides[0]!.id });
    at(0.5);
    engine.previous();
    // Slide Two's own transition, from Three, from the start.
    expect(engine.getView().transition).toMatchObject({
      kind: 'push',
      time: 0,
      fromSlideId: slides[2]!.id,
    });
    engine.previous();
    // Slide One has none.
    expect(engine.getView().transition).toBeUndefined();
  });

  it('do not play when a session is resumed', () => {
    const { slides, make } = setup();
    const { engine } = make();
    engine.next();
    const resumed = make(engine.getState()).engine;
    expect(resumed.getView().slideId).toBe(slides[1]!.id);
    expect(resumed.getView().transition).toBeUndefined();
  });
});

describe('layer transitions', () => {
  it('play in when shown and out when hidden, the layer drawn but closed until it has gone', () => {
    const { popUp, box, make } = setup();
    const { engine, at } = make();
    engine.next();
    at(2);
    engine.showLayer(popUp.id);
    const shown = () => engine.getView().layers.find((layer) => layer.id === popUp.id);
    expect(shown()!.transition).toMatchObject({ kind: 'fade', phase: 'in', time: 0 });
    at(0.6);
    expect(shown()!.transition).toBeUndefined();
    expect(engine.pointer('click', box.id)).toBe(true);

    engine.hideLayer(popUp.id);
    expect(shown()).toMatchObject({ shown: false, transition: { phase: 'out', time: 0 } });
    // Still drawn as it was…
    expect(shown()!.objects[0]).toMatchObject({ id: box.id, onStage: true, visible: true });
    // …but taking no input.
    expect(engine.pointer('click', box.id)).toBe(false);
    at(0.3);
    expect(shown()!.transition!.time).toBeCloseTo(0.3);
    at(0.3);
    expect(shown()).toBeUndefined();
  });

  it('turn round part way without jumping, and end when the slide is left', () => {
    const { popUp, make } = setup();
    const { engine, at } = make();
    engine.next();
    engine.showLayer(popUp.id);
    at(0.2);
    engine.hideLayer(popUp.id);
    const view = () => engine.getView().layers.find((layer) => layer.id === popUp.id);
    // 0.2 s into a 0.5 s fade in: the fade out starts 0.5 − 0.2 = 0.3 s in.
    expect(view()!.transition).toMatchObject({ phase: 'out' });
    expect(view()!.transition!.time).toBeCloseTo(0.3);
    at(0.1);
    engine.showLayer(popUp.id);
    // 0.4 s into the way out: 0.5 − 0.4 = 0.1 s into the way in.
    expect(view()!.transition).toMatchObject({ phase: 'in' });
    expect(view()!.transition!.time).toBeCloseTo(0.1);
    engine.hideLayer(popUp.id);
    engine.next();
    expect(engine.getView().layers.map((layer) => layer.id)).toHaveLength(1);
  });
});
