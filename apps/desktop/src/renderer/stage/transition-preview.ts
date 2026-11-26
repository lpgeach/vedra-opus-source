import type { Layer, Slide, Transition } from '@vedraopus/model';
import { layerTransitionKeyframes, renderLayer, renderSlide, toDom } from '@vedraopus/render';
import type { RenderContext } from '@vedraopus/render';

/**
 * Playing a slide's or a layer's transition once on the stage, for the
 * Transitions tab's Preview (docs/briefs/P6.6-transitions.md). A copy of the
 * slide or layer, drawn by the same renderers, plays over the stage while the
 * real one is hidden, then goes; nothing React draws is touched.
 */

type Play = (target: 'slide' | 'layer') => void;
let play: Play | null = null;

/** The stage offers its player here while it is shown. */
export function offerTransitionPreview(player: Play): () => void {
  play = player;
  return () => {
    if (play === player) play = null;
  };
}

export function previewTransition(target: 'slide' | 'layer'): void {
  play?.(target);
}

/**
 * Play `transition` on `what`, over `canvas` at `zoom`, hiding `hide` while
 * it plays. Returns a function that stops it early.
 */
export function playOnStage({
  canvas,
  zoom,
  what,
  transition,
  context,
  hide,
}: {
  canvas: HTMLElement;
  zoom: number;
  what: { slide: Slide } | { layer: Layer };
  transition: Transition;
  context: RenderContext;
  hide: HTMLElement[];
}): () => void {
  const { width, height } = context.stage;
  const document = canvas.ownerDocument;
  // Clipped to the stage, so a pushed slide does not show beside it.
  const frame = document.createElement('div');
  frame.className = 'stage-transition-preview';
  frame.dataset['testid'] = 'transition-preview';
  frame.dataset['kind'] = transition.kind;
  Object.assign(frame.style, { width: `${width * zoom}px`, height: `${height * zoom}px` });
  const scaled = document.createElement('div');
  Object.assign(scaled.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    transform: `scale(${zoom})`,
    transformOrigin: '0 0',
  });
  const moving = document.createElement('div');
  Object.assign(moving.style, { position: 'absolute', inset: '0' });
  moving.append(
    toDom(
      'slide' in what ? renderSlide(what.slide, context) : renderLayer(what.layer, context),
      document,
    ),
  );
  scaled.append(moving);
  frame.append(scaled);
  canvas.append(frame);
  const hidden = hide.map((element) => [element, element.style.visibility] as const);
  for (const [element] of hidden) element.style.visibility = 'hidden';

  const { keyframes, easing } = layerTransitionKeyframes(transition, context.stage);
  const animation = moving.animate(keyframes, { duration: transition.duration * 1000, easing });
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    animation.cancel();
    frame.remove();
    for (const [element, visibility] of hidden) element.style.visibility = visibility;
  };
  animation.finished.then(stop, stop);
  return stop;
}
