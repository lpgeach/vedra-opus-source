import { createTransition, transitionDirections, transitionKinds } from '@vedraopus/model';
import type { Transition } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { layerTransitionKeyframes, transitionKeyframes } from './transition';

const stage = { width: 960, height: 540 };
const of = (kind: Transition['kind'], direction?: Transition['direction']) =>
  transitionKeyframes({ ...createTransition(kind), ...(direction ? { direction } : {}) }, stage);

describe('transition keyframes', () => {
  it('has keyframes for every kind and direction, moving the new slide, the old, or both', () => {
    for (const kind of transitionKinds) {
      const directions =
        transitionDirections[kind].length > 0 ? transitionDirections[kind] : [null];
      for (const direction of directions) {
        const frames = transitionKeyframes({ ...createTransition(kind), direction }, stage);
        expect(frames.incoming ?? frames.outgoing, `${kind} ${direction}`).not.toBeNull();
      }
    }
  });

  it('pushes the old slide out the way the new one comes from', () => {
    // From the right: the new one starts a stage width (960) right, the old ends 960 left.
    expect(of('push', 'right')).toMatchObject({
      incoming: [{ transform: 'translate(960px, 0px)' }, { transform: 'translate(0px, 0px)' }],
      outgoing: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(-960px, 0px)' }],
      oldOnTop: false,
    });
    expect(of('push', 'top').incoming![0]).toEqual({ transform: 'translate(0px, -540px)' });
  });

  it('covers over a still slide, and uncovers by moving the old one away on top', () => {
    expect(of('cover', 'bottom')).toMatchObject({
      incoming: [{ transform: 'translate(0px, 540px)' }, { transform: 'translate(0px, 0px)' }],
      outgoing: null,
    });
    expect(of('uncover', 'left')).toMatchObject({
      incoming: null,
      outgoing: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(-960px, 0px)' }],
      oldOnTop: true,
    });
  });

  it('fades, wipes, splits, opens a circle and zooms the new slide in', () => {
    expect(of('fade').incoming).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(of('wipe', 'left').incoming![0]).toEqual({ clipPath: 'inset(0px 100% 0px 0px)' });
    expect(of('wipe', 'bottom').incoming![0]).toEqual({ clipPath: 'inset(100% 0px 0px 0px)' });
    expect(of('split', 'vertical').incoming![0]).toEqual({ clipPath: 'inset(0px 50% 0px 50%)' });
    expect(of('iris').incoming!.at(-1)).toEqual({ clipPath: 'circle(72% at 50% 50%)' });
    expect(of('zoom').incoming![0]).toEqual({ transform: 'scale(0.5)', opacity: 0 });
  });

  it('brings a layer in by its incoming keyframes, or an uncover from where it sends the old', () => {
    expect(layerTransitionKeyframes(createTransition('fade'), stage).keyframes).toEqual([
      { opacity: 0 },
      { opacity: 1 },
    ]);
    // Uncover to the right, reversed: in from 960 right.
    expect(layerTransitionKeyframes(createTransition('uncover'), stage).keyframes).toEqual([
      { transform: 'translate(960px, 0px)' },
      { transform: 'translate(0px, 0px)' },
    ]);
  });
});

describe('reduced motion', () => {
  it('draws every transition as the new one fading in over the old, which stays still', () => {
    for (const kind of transitionKinds) {
      expect(transitionKeyframes(createTransition(kind), stage, { reduced: true })).toEqual({
        incoming: [{ opacity: 0 }, { opacity: 1 }],
        outgoing: null,
        oldOnTop: false,
        easing: expect.any(String),
      });
      expect(
        layerTransitionKeyframes(createTransition(kind), stage, { reduced: true }).keyframes,
      ).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    }
  });
});
