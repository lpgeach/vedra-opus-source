import type { Effect, EffectDirection, Frame, SceneObject } from '@vedraopus/model';
import { num } from './node';
import { TEXT_CLASS } from './text';

/**
 * Entrance and exit effects as Web Animations keyframes, and an animator that
 * holds them paused on the drawn elements and sets their time from the engine
 * (docs/briefs/P6.5-animations.md). The browser never runs these clocks
 * itself, so pausing, seeking and scrubbing are exact.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The keyframes of an entrance, from hidden to shown. An exit plays them backwards. */
export interface EffectFrames {
  keyframes: Keyframe[];
  /** The easing of the entrance as a whole. */
  easing: string;
}

/** Entrances ease out (so exits, played backwards, ease in). */
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';
/** Room around a revealed box for outlines and shadows drawn outside it. */
const reveal = (box: Box) => Math.min(64, 0.25 * Math.max(box.width, box.height));

/** The smallest stage-aligned box around a frame turned by its rotation. */
export function rotatedBounds(frame: Frame): Box {
  const { x, y, width, height, rotation } = frame;
  if (rotation % 360 === 0) return { left: x, top: y, width, height };
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = width * cos + height * sin;
  const h = width * sin + height * cos;
  return { left: x + width / 2 - w / 2, top: y + height / 2 - h / 2, width: w, height: h };
}

/** Where an object is on the stage, a group by everything inside it. */
export function objectBounds(object: SceneObject): Box {
  if (object.type !== 'group' || object.children.length === 0) return rotatedBounds(object.frame);
  const boxes = object.children.map(objectBounds);
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

const polygon = (left: number, top: number, right: number, bottom: number) =>
  `polygon(${px(left)} ${px(top)}, ${px(right)} ${px(top)}, ${px(right)} ${px(bottom)}, ${px(left)} ${px(bottom)})`;
const px = (value: number) => `${num(value)}px`;

export interface EffectOptions {
  /** The animated element's own box, in its own pixels (a group's element sits at the stage's corner). */
  box: Box;
  /** Where the object is on the stage, for effects that come from off it. */
  bounds: Box;
  stage: { width: number; height: number };
  /** The element's own rotation (degrees), kept inside any transform the effect sets. */
  rotation: number;
  /** The element's own opacity, which a fade ends at. */
  opacity: number;
  /** Set for an element whose box is not where it is drawn (a group): turn and scale about here. */
  origin?: { x: number; y: number };
  /** The learner asked for less motion: every effect is a fade (docs/briefs/reduced-motion.md). */
  reduced?: boolean;
}

/** How far to move an object from `direction` so that all of it is off the stage. */
function offStage(direction: EffectDirection | null, bounds: Box, stage: EffectOptions['stage']) {
  const margin = 8;
  const fromLeft = -(bounds.left + bounds.width) - margin;
  const fromRight = stage.width - bounds.left + margin;
  const fromTop = -(bounds.top + bounds.height) - margin;
  const fromBottom = stage.height - bounds.top + margin;
  switch (direction) {
    case 'left':
      return { x: fromLeft, y: 0 };
    case 'right':
      return { x: fromRight, y: 0 };
    case 'top':
      return { x: 0, y: fromTop };
    case 'topLeft':
      return { x: fromLeft, y: fromTop };
    case 'topRight':
      return { x: fromRight, y: fromTop };
    case 'bottomLeft':
      return { x: fromLeft, y: fromBottom };
    case 'bottomRight':
      return { x: fromRight, y: fromBottom };
    default:
      return { x: 0, y: fromBottom };
  }
}

/** The keyframes of `effect` as an entrance. */
export function effectKeyframes(effect: Effect, options: EffectOptions): EffectFrames {
  const { box, bounds, stage, rotation, opacity } = options;
  if (options.reduced) return { keyframes: [{ opacity: 0 }, { opacity }], easing: EASE_OUT };
  const turn = rotation !== 0 ? ` rotate(${num(rotation)}deg)` : '';
  const origin = options.origin
    ? { transformOrigin: `${px(options.origin.x)} ${px(options.origin.y)}` }
    : {};
  /** Keyframes that set a transform, with the element's own turn kept inside it. */
  const moved = (frames: { transform: string; [key: string]: string | number }[]) =>
    frames.map((frame) => ({ ...frame, ...origin, transform: `${frame.transform}${turn}`.trim() }));
  const left = box.left;
  const top = box.top;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const m = reveal(box);
  const shown = polygon(left - m, top - m, right + m, bottom + m);

  switch (effect.kind) {
    case 'fade':
      return { keyframes: [{ opacity: 0 }, { opacity }], easing: EASE_OUT };
    case 'fly': {
      const from = offStage(effect.direction, bounds, stage);
      return {
        keyframes: moved([
          { transform: `translate(${px(from.x)}, ${px(from.y)})` },
          { transform: 'translate(0px, 0px)' },
        ]),
        easing: EASE_OUT,
      };
    }
    case 'float': {
      const across = effect.direction === 'left' || effect.direction === 'right';
      const distance = (across ? stage.width : stage.height) / 10;
      const sign = effect.direction === 'left' || effect.direction === 'top' ? -1 : 1;
      const x = across ? sign * distance : 0;
      const y = across ? 0 : sign * distance;
      return {
        keyframes: moved([
          { transform: `translate(${px(x)}, ${px(y)})`, opacity: 0 },
          { transform: 'translate(0px, 0px)', opacity },
        ]),
        easing: EASE_OUT,
      };
    }
    case 'wipe': {
      // The edge that moves starts at the side it is revealed from.
      const start =
        effect.direction === 'right'
          ? polygon(right + m, top - m, right + m, bottom + m)
          : effect.direction === 'top'
            ? polygon(left - m, top - m, right + m, top - m)
            : effect.direction === 'bottom'
              ? polygon(left - m, bottom + m, right + m, bottom + m)
              : polygon(left - m, top - m, left - m, bottom + m);
      return { keyframes: [{ clipPath: start }, { clipPath: shown }], easing: EASE_OUT };
    }
    case 'split': {
      const middleX = left + box.width / 2;
      const middleY = top + box.height / 2;
      const start =
        effect.direction === 'vertical'
          ? polygon(middleX, top - m, middleX, bottom + m)
          : polygon(left - m, middleY, right + m, middleY);
      return { keyframes: [{ clipPath: start }, { clipPath: shown }], easing: EASE_OUT };
    }
    case 'iris': {
      const at = `at ${px(left + box.width / 2)} ${px(top + box.height / 2)}`;
      const radius = Math.hypot(box.width, box.height) / 2 + m;
      return {
        keyframes: [{ clipPath: `circle(0px ${at})` }, { clipPath: `circle(${px(radius)} ${at})` }],
        easing: EASE_OUT,
      };
    }
    case 'grow':
      return {
        keyframes: moved([{ transform: 'scale(0)' }, { transform: 'scale(1)' }]),
        easing: EASE_OUT,
      };
    case 'zoom':
      return {
        keyframes: moved([
          { transform: 'scale(0.5)', opacity: 0 },
          { transform: 'scale(1)', opacity },
        ]),
        easing: EASE_OUT,
      };
    case 'spin':
    case 'spinGrow': {
      // Clockwise: from a whole turn back, so it turns forwards into place.
      const from = effect.direction === 'anticlockwise' ? 360 : -360;
      const grow = effect.kind === 'spinGrow';
      return {
        keyframes: moved([
          {
            transform: `rotate(${from}deg)${grow ? ' scale(0)' : ''}`,
            ...(grow ? {} : { opacity: 0 }),
          },
          { transform: `rotate(0deg)${grow ? ' scale(1)' : ''}`, ...(grow ? {} : { opacity }) },
        ]),
        easing: EASE_OUT,
      };
    }
    case 'bounce': {
      const fall = bounds.top + bounds.height + 8;
      const first = Math.min(80, fall * 0.25);
      const second = first * 0.4;
      const at = (y: number) => `translate(0px, ${px(-y)})`;
      return {
        keyframes: moved([
          { offset: 0, transform: at(fall), easing: 'ease-in' },
          { offset: 0.55, transform: at(0), easing: 'ease-out' },
          { offset: 0.75, transform: at(first), easing: 'ease-in' },
          { offset: 0.9, transform: at(0), easing: 'ease-out' },
          { offset: 0.96, transform: at(second), easing: 'ease-in' },
          { offset: 1, transform: at(0) },
        ]),
        easing: 'linear',
      };
    }
    case 'swivel': {
      const axis = effect.direction === 'vertical' ? 'rotateX' : 'rotateY';
      return {
        keyframes: moved([
          { transform: `perspective(1000px) ${axis}(90deg)`, opacity: 0 },
          { transform: `perspective(1000px) ${axis}(0deg)`, opacity },
        ]),
        easing: EASE_OUT,
      };
    }
  }
}

// ---------------------------------------------------------------- animator

/** What the engine says an object is doing (its `ObjectView`). */
export interface AnimationState {
  effect?: { phase: 'entrance' | 'exit'; time: number };
  offset?: { x: number; y: number };
}

/** The paragraphs of a drawn text object that animate one by one: top-level paragraphs and list items. */
const PARAGRAPHS = [' > p', ' > ul > li', ' > ol > li']
  .map((tail) => `.${TEXT_CLASS}${tail}`)
  .join(', ');

interface Held {
  key: string;
  animations: Animation[];
}

export interface Animator {
  /**
   * Make `element` (an object as drawn) look as the engine says: moved by
   * its offset, and at its time in its entrance or exit. `object` is the
   * object as drawn (in its current state).
   */
  apply(element: HTMLElement, object: SceneObject, state: AnimationState): void;
  /** Take every animation off `element`. */
  clear(element: HTMLElement): void;
}

/** `reduced`: the learner asked for less motion, so every effect is drawn as a fade. */
export function createAnimator(
  stage: { width: number; height: number },
  { reduced = false }: { reduced?: boolean } = {},
): Animator {
  const held = new WeakMap<HTMLElement, Held>();

  const clear = (element: HTMLElement) => {
    const was = held.get(element);
    if (!was) return;
    for (const animation of was.animations) animation.cancel();
    held.delete(element);
  };

  const start = (
    element: HTMLElement,
    object: SceneObject,
    effect: Effect,
    phase: 'entrance' | 'exit',
  ): Animation[] => {
    const bounds = objectBounds(object);
    const direction: PlaybackDirection = phase === 'exit' ? 'reverse' : 'normal';
    const ms = effect.duration * 1000;
    const paragraphs = effect.byParagraph
      ? [...element.querySelectorAll<HTMLElement>(PARAGRAPHS)]
      : [];
    if (paragraphs.length > 0) {
      return paragraphs.map((paragraph, index) => {
        const { keyframes, easing } = effectKeyframes(effect, {
          box: { left: 0, top: 0, width: paragraph.offsetWidth, height: paragraph.offsetHeight },
          bounds,
          stage,
          rotation: 0,
          opacity: 1,
          reduced,
        });
        // Each in its turn; held at its first frame before then.
        const animation = paragraph.animate(keyframes, {
          duration: ms,
          delay: index * ms,
          fill: 'both',
          easing,
          direction,
        });
        animation.pause();
        return animation;
      });
    }
    const group = object.type === 'group';
    const { keyframes, easing } = effectKeyframes(effect, {
      box: group
        ? bounds
        : { left: 0, top: 0, width: object.frame.width, height: object.frame.height },
      bounds,
      stage,
      rotation: group ? 0 : object.frame.rotation,
      opacity: element.style.opacity === '' ? 1 : Number(element.style.opacity),
      reduced,
      ...(group
        ? { origin: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } }
        : {}),
    });
    const animation = element.animate(keyframes, { duration: ms, fill: 'both', easing, direction });
    animation.pause();
    return [animation];
  };

  return {
    clear,
    apply(element, object, state) {
      const translate = state.offset ? `${px(state.offset.x)} ${px(state.offset.y)}` : '';
      // Set every frame: drawing an object again in another state rewrites its style.
      element.style.translate = translate;
      const effect = state.effect && object.animations[state.effect.phase];
      if (!state.effect || !effect) {
        clear(element);
        return;
      }
      const { phase, time } = state.effect;
      const key = JSON.stringify([phase, effect, object.frame, element.style.opacity]);
      let now = held.get(element);
      // Drawn again in another state, its paragraphs are new elements.
      const stale = now?.animations.some(
        (animation) => !(animation.effect as KeyframeEffect | null)?.target?.isConnected,
      );
      if (!now || now.key !== key || stale) {
        clear(element);
        now = { key, animations: start(element, object, effect, phase) };
        held.set(element, now);
      }
      for (const animation of now.animations) animation.currentTime = time * 1000;
    },
  };
}
