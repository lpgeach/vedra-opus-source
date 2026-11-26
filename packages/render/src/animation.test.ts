import {
  createEffect,
  createGroupObject,
  createShapeObject,
  effectDirections,
  effectKinds,
} from '@vedraopus/model';
import type { Effect } from '@vedraopus/model';
import { describe, expect, it } from 'vitest';
import { effectKeyframes, objectBounds, rotatedBounds } from './animation';
import type { EffectOptions } from './animation';

const stage = { width: 960, height: 540 };
/** A 200 × 100 object at (100, 50), unturned. */
const options: EffectOptions = {
  box: { left: 0, top: 0, width: 200, height: 100 },
  bounds: { left: 100, top: 50, width: 200, height: 100 },
  stage,
  rotation: 0,
  opacity: 1,
};
const frames = (effect: Effect, extra: Partial<EffectOptions> = {}) =>
  effectKeyframes(effect, { ...options, ...extra }).keyframes;
const effect = (kind: Effect['kind'], direction: Effect['direction'] = null): Effect => ({
  ...createEffect(kind),
  direction: direction ?? createEffect(kind).direction,
});

describe('effect keyframes', () => {
  it('has keyframes for every effect in every direction, starting hidden and ending as drawn', () => {
    for (const kind of effectKinds) {
      const directions: readonly (Effect['direction'] | null)[] =
        effectDirections[kind].length > 0 ? effectDirections[kind] : [null];
      for (const direction of directions) {
        const { keyframes, easing } = effectKeyframes(effect(kind, direction), options);
        expect(keyframes.length, `${kind} ${direction}`).toBeGreaterThanOrEqual(2);
        expect(easing).toBeTruthy();
      }
    }
  });

  it('fades to the object’s own opacity', () => {
    expect(frames(effect('fade'), { opacity: 0.5 })).toEqual([{ opacity: 0 }, { opacity: 0.5 }]);
  });

  it('flies in from fully off the stage, keeping the object’s own turn', () => {
    // From the left: −(100 + 200) − 8 = −308. From the right: 960 − 100 + 8 = 868.
    expect(frames(effect('fly', 'left'))[0]).toEqual({ transform: 'translate(-308px, 0px)' });
    expect(frames(effect('fly', 'right'))[0]).toEqual({ transform: 'translate(868px, 0px)' });
    // From below: 540 − 50 + 8 = 498. From above: −(50 + 100) − 8 = −158.
    expect(frames(effect('fly', 'bottomRight'))[0]).toEqual({
      transform: 'translate(868px, 498px)',
    });
    expect(frames(effect('fly', 'top'))[0]).toEqual({ transform: 'translate(0px, -158px)' });
    expect(frames(effect('fly', 'left'), { rotation: 30 })).toEqual([
      { transform: 'translate(-308px, 0px) rotate(30deg)' },
      { transform: 'translate(0px, 0px) rotate(30deg)' },
    ]);
  });

  it('floats a tenth of the stage while fading', () => {
    // 540 / 10 = 54 from below; 960 / 10 = 96 from the left.
    expect(frames(effect('float', 'bottom'))).toEqual([
      { transform: 'translate(0px, 54px)', opacity: 0 },
      { transform: 'translate(0px, 0px)', opacity: 1 },
    ]);
    expect(frames(effect('float', 'left'))[0]).toEqual({
      transform: 'translate(-96px, 0px)',
      opacity: 0,
    });
  });

  it('wipes, splits and opens a circle over the box, with room for outlines', () => {
    // The room is min(64, 200 / 4) = 50 on every side.
    const shown = 'polygon(-50px -50px, 250px -50px, 250px 150px, -50px 150px)';
    expect(frames(effect('wipe', 'left'))).toEqual([
      { clipPath: 'polygon(-50px -50px, -50px -50px, -50px 150px, -50px 150px)' },
      { clipPath: shown },
    ]);
    expect(frames(effect('wipe', 'bottom'))[0]).toEqual({
      clipPath: 'polygon(-50px 150px, 250px 150px, 250px 150px, -50px 150px)',
    });
    // Split across the middle, 50 down.
    expect(frames(effect('split', 'horizontal'))[0]).toEqual({
      clipPath: 'polygon(-50px 50px, 250px 50px, 250px 50px, -50px 50px)',
    });
    // Half the diagonal, √(200² + 100²) / 2 = 111.803, plus 50.
    expect(frames(effect('iris'))).toEqual([
      { clipPath: 'circle(0px at 100px 50px)' },
      { clipPath: 'circle(161.803px at 100px 50px)' },
    ]);
  });

  it('grows, spins and swivels about the middle', () => {
    expect(frames(effect('grow'))).toEqual([{ transform: 'scale(0)' }, { transform: 'scale(1)' }]);
    expect(frames(effect('spin', 'clockwise'))[0]).toEqual({
      transform: 'rotate(-360deg)',
      opacity: 0,
    });
    expect(frames(effect('spin', 'anticlockwise'))[0]!.transform).toBe('rotate(360deg)');
    expect(frames(effect('spinGrow'))[0]).toEqual({ transform: 'rotate(-360deg) scale(0)' });
    expect(frames(effect('swivel', 'vertical'))[0]!.transform).toBe(
      'perspective(1000px) rotateX(90deg)',
    );
  });

  it('bounces in from above the stage', () => {
    // Falls 50 + 100 + 8 = 158; bounces min(80, 158 / 4) = 39.5, then 39.5 × 0.4 = 15.8.
    const bounce = frames(effect('bounce'));
    expect(bounce.map((frame) => [frame.offset, frame.transform])).toEqual([
      [0, 'translate(0px, -158px)'],
      [0.55, 'translate(0px, 0px)'],
      [0.75, 'translate(0px, -39.5px)'],
      [0.9, 'translate(0px, 0px)'],
      [0.96, 'translate(0px, -15.8px)'],
      [1, 'translate(0px, 0px)'],
    ]);
  });

  it('turns a group about the middle of what it holds', () => {
    const grown = frames(effect('grow'), { origin: { x: 150, y: 100 } });
    expect(grown[0]).toEqual({ transform: 'scale(0)', transformOrigin: '150px 100px' });
  });
});

describe('bounds', () => {
  it('measures a turned frame, and a group by its children', () => {
    // 100 × 50 turned a quarter: 50 wide and 100 high, about the same middle (50, 25).
    const turned = rotatedBounds({ x: 0, y: 0, width: 100, height: 50, rotation: 90 });
    expect(turned.left).toBeCloseTo(25);
    expect(turned.top).toBeCloseTo(-25);
    expect(turned.width).toBeCloseTo(50);
    expect(turned.height).toBeCloseTo(100);
    const group = createGroupObject([
      createShapeObject({ kind: 'rect' }, { x: 10, y: 20, width: 30, height: 40 }),
      createShapeObject({ kind: 'rect' }, { x: 100, y: 5, width: 10, height: 10 }),
    ]);
    // From x 10 to 110 and y 5 to 60.
    expect(objectBounds(group)).toEqual({ left: 10, top: 5, width: 100, height: 55 });
  });
});

describe('reduced motion', () => {
  it('draws every effect as a fade to the object’s own opacity', () => {
    for (const kind of effectKinds) {
      expect(
        effectKeyframes(effect(kind), { ...options, opacity: 0.8, reduced: true }).keyframes,
      ).toEqual([{ opacity: 0 }, { opacity: 0.8 }]);
    }
  });
});
