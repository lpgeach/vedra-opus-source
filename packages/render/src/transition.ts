import type { Transition } from '@vedraopus/model';
import { num } from './node';

/**
 * Slide and layer transitions as Web Animations keyframes
 * (docs/briefs/P6.6-transitions.md). A player holds them paused and sets their
 * time from the engine, as it does for animations.
 */
export interface TransitionFrames {
  /** For the new slide's (or the layer's) container; null when it does not move. */
  incoming: Keyframe[] | null;
  /** For the old slide's drawing; null when it does not move. */
  outgoing: Keyframe[] | null;
  /** The old slide is drawn above the new one (it is what moves away). */
  oldOnTop: boolean;
  easing: string;
}

const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
const px = (value: number) => `${num(value)}px`;
const at = (x: number, y: number) => `translate(${px(x)}, ${px(y)})`;
const STILL = at(0, 0);

/** Where something `direction` of the stage sits: off it to the right is (width, 0). */
function side(direction: Transition['direction'], stage: { width: number; height: number }) {
  switch (direction) {
    case 'left':
      return { x: -stage.width, y: 0 };
    case 'top':
      return { x: 0, y: -stage.height };
    case 'bottom':
      return { x: 0, y: stage.height };
    default:
      return { x: stage.width, y: 0 };
  }
}

export function transitionKeyframes(
  transition: Transition,
  stage: { width: number; height: number },
  { reduced = false }: { reduced?: boolean } = {},
): TransitionFrames {
  const frames = (incoming: Keyframe[] | null, outgoing: Keyframe[] | null, oldOnTop = false) => ({
    incoming,
    outgoing,
    oldOnTop,
    easing: EASE_IN_OUT,
  });
  // Less motion: whatever the kind, the new one fades in over the old (docs/briefs/reduced-motion.md).
  if (reduced) return frames([{ opacity: 0 }, { opacity: 1 }], null);
  const from = side(transition.direction, stage);
  switch (transition.kind) {
    case 'fade':
      return frames([{ opacity: 0 }, { opacity: 1 }], null);
    case 'push':
      return frames(
        [{ transform: at(from.x, from.y) }, { transform: STILL }],
        [{ transform: STILL }, { transform: at(-from.x, -from.y) }],
      );
    case 'cover':
      return frames([{ transform: at(from.x, from.y) }, { transform: STILL }], null);
    case 'uncover':
      // The direction is where the old slide goes.
      return frames(null, [{ transform: STILL }, { transform: at(from.x, from.y) }], true);
    case 'wipe': {
      const start = {
        left: 'inset(0px 100% 0px 0px)',
        right: 'inset(0px 0px 0px 100%)',
        top: 'inset(0px 0px 100% 0px)',
        bottom: 'inset(100% 0px 0px 0px)',
      }[transition.direction as 'left' | 'right' | 'top' | 'bottom'];
      return frames([{ clipPath: start }, { clipPath: 'inset(0px 0px 0px 0px)' }], null);
    }
    case 'split':
      return frames(
        [
          {
            clipPath:
              transition.direction === 'vertical'
                ? 'inset(0px 50% 0px 50%)'
                : 'inset(50% 0px 50% 0px)',
          },
          { clipPath: 'inset(0px 0px 0px 0px)' },
        ],
        null,
      );
    case 'iris':
      // A circle's percentage is of the diagonal over √2: 72% passes the corners (70.7%).
      return frames(
        [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(72% at 50% 50%)' }],
        null,
      );
    case 'zoom':
      return frames(
        [
          { transform: 'scale(0.5)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        null,
      );
  }
}

/**
 * The keyframes of a layer being shown (a hide plays them backwards). With
 * nothing beneath to move, an uncover brings the layer in from where it would
 * have sent the old slide.
 */
export function layerTransitionKeyframes(
  transition: Transition,
  stage: { width: number; height: number },
  options: { reduced?: boolean } = {},
): { keyframes: Keyframe[]; easing: string } {
  const { incoming, outgoing, easing } = transitionKeyframes(transition, stage, options);
  return { keyframes: incoming ?? [...(outgoing ?? [])].reverse(), easing };
}
