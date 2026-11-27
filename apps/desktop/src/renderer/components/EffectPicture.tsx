import type { Effect } from '@vedraopus/model';
import { effectKeyframes } from '@vedraopus/render';
import { useEffect, useRef } from 'react';

/**
 * A small picture of an entrance or exit effect for the Animations tab's galleries (B28): a
 * stand-in object on a little stage, moved by the same keyframes the course uses
 * (`effectKeyframes`), and for an exit played backwards, as the player plays it. At rest it
 * stands partway through; while `playing` it plays, over and over, unless the computer asks
 * for less motion.
 */

const STAGE = { width: 44, height: 30 };
/** The stand-in object: a card in the middle of the little stage. */
const BOX = { left: 12, top: 8, width: 20, height: 14 };
const DURATION_MS = 900;
/**
 * Where the picture rests: about halfway through the movement, where each effect looks most
 * like itself. Entrances ease out, so that is a fifth of the time in. An exit plays backwards,
 * so its halfway point is four fifths of the way through.
 */
const restMs = (phase: 'entrance' | 'exit', kind: Effect['kind']) => {
  // A bounce drops in from above and is still out of sight a fifth of the way in: rest it
  // as it lands.
  const into = kind === 'bounce' ? 0.55 : 0.2;
  return DURATION_MS * (phase === 'exit' ? 1 - into : into);
};
const PAUSE_MS = 450;

function lessMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function EffectPicture({
  effect,
  phase,
  playing,
}: {
  /** Null: no effect, the object simply appears (or goes). */
  effect: Effect | null;
  phase: 'entrance' | 'exit';
  playing: boolean;
}) {
  const card = useRef<HTMLDivElement>(null);
  const kind = effect?.kind ?? null;
  const direction = effect?.direction ?? null;

  useEffect(() => {
    const element = card.current;
    if (!kind || !element) return;
    // The real keyframes, as an entrance; an exit plays them backwards, as in a course.
    const { keyframes, easing } = effectKeyframes(
      { kind, direction, duration: DURATION_MS / 1000, byParagraph: false } as Effect,
      {
        box: { left: 0, top: 0, width: BOX.width, height: BOX.height },
        bounds: BOX,
        stage: STAGE,
        rotation: 0,
        opacity: 1,
      },
    );
    const animation = element.animate(keyframes, {
      duration: DURATION_MS,
      easing,
      fill: 'both',
      direction: phase === 'exit' ? 'reverse' : 'normal',
    });
    animation.pause();
    animation.currentTime = restMs(phase, kind);
    if (!playing || lessMotion()) return () => animation.cancel();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = () => {
      animation.currentTime = 0;
      animation.play();
    };
    animation.onfinish = () => {
      timer = setTimeout(cycle, PAUSE_MS);
    };
    cycle();
    return () => {
      clearTimeout(timer);
      animation.cancel();
    };
  }, [kind, direction, phase, playing]);

  return (
    <div className="effect-picture" aria-hidden="true" data-kind={kind ?? 'none'}>
      {kind ? (
        <div
          ref={card}
          className="effect-picture-card"
          style={{
            left: BOX.left,
            top: BOX.top,
            width: BOX.width,
            height: BOX.height,
          }}
        >
          <span />
          <span />
        </div>
      ) : (
        <div className="transition-picture-none" />
      )}
    </div>
  );
}
