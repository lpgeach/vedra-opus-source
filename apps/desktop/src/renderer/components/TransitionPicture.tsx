import type { Transition } from '@vedraopus/model';
import { transitionKeyframes } from '@vedraopus/render';
import { useEffect, useRef } from 'react';

/**
 * A small picture of a transition for the Transitions tab's gallery (B27): an old slide and a
 * new one, moved by the same keyframes the player uses (`transitionKeyframes`), so the picture
 * always shows what the course will do. At rest it stands partway through; while `playing` it
 * plays, over and over, unless the computer asks for less motion.
 */

const WIDTH = 44;
const HEIGHT = 30;
const DURATION_MS = 900;
/**
 * Where the picture rests: about halfway through the movement (with the player's easing,
 * 38% of the time), where each kind looks most like itself.
 */
const REST_MS = DURATION_MS * 0.38;
const PAUSE_MS = 450;

function lessMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TransitionPicture({
  transition,
  playing,
}: {
  /** Null: no transition, the new slide simply appears. */
  transition: Transition | null;
  playing: boolean;
}) {
  const oldSlide = useRef<HTMLDivElement>(null);
  const newSlide = useRef<HTMLDivElement>(null);
  const kind = transition?.kind ?? null;
  const direction = transition?.direction ?? null;

  useEffect(() => {
    const incomingEl = newSlide.current;
    const outgoingEl = oldSlide.current;
    if (!kind || !incomingEl || !outgoingEl) return;
    // The real keyframes, on this picture's stage. Never the reduced ones: at rest the
    // picture has to show which transition it is.
    const frames = transitionKeyframes(
      { kind, direction, duration: DURATION_MS / 1000 } as Transition,
      { width: WIDTH, height: HEIGHT },
    );
    outgoingEl.style.zIndex = frames.oldOnTop ? '1' : '0';
    const options: KeyframeAnimationOptions = {
      duration: DURATION_MS,
      easing: frames.easing,
      fill: 'both',
    };
    const animations = [
      frames.incoming ? incomingEl.animate(frames.incoming, options) : null,
      frames.outgoing ? outgoingEl.animate(frames.outgoing, options) : null,
    ].filter((each): each is Animation => each !== null);
    const rest = () => {
      for (const each of animations) {
        each.pause();
        each.currentTime = REST_MS;
      }
    };
    rest();
    if (!playing || lessMotion()) return () => animations.forEach((each) => each.cancel());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = () => {
      for (const each of animations) {
        each.currentTime = 0;
        each.play();
      }
    };
    animations[0]!.onfinish = () => {
      timer = setTimeout(cycle, PAUSE_MS);
    };
    cycle();
    return () => {
      clearTimeout(timer);
      animations.forEach((each) => each.cancel());
    };
  }, [kind, direction, playing]);

  return (
    <div className="transition-picture" aria-hidden="true" data-kind={kind ?? 'none'}>
      <div ref={oldSlide} className="transition-picture-old">
        <span />
        <span />
        <span />
      </div>
      {kind ? (
        <div ref={newSlide} className="transition-picture-new">
          <span />
        </div>
      ) : (
        <div className="transition-picture-none" />
      )}
    </div>
  );
}
