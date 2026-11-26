/**
 * The player on small screens and touch (docs/briefs/P8.5-responsive.md): a
 * compact frame below 640 pixels, touch swipes for Next and Previous, and a
 * hint to turn the device when the course would show bigger sideways.
 */

/** Narrower than this, in CSS pixels, the frame is compact. */
export const COMPACT_BELOW = 640;

export function isCompact(width: number): boolean {
  return width > 0 && width < COMPACT_BELOW;
}

/** A swipe: far enough sideways, mostly sideways, and quick. */
const SWIPE_DISTANCE = 60;
const SWIPE_TIME = 600;

/**
 * What a finger's movement means: `dx`/`dy` in CSS pixels, `ms` from touch to
 * lift. Swiping left goes on, swiping right goes back.
 */
export function swipeOf(dx: number, dy: number, ms: number): 'next' | 'previous' | null {
  if (ms > SWIPE_TIME || Math.abs(dx) < SWIPE_DISTANCE) return null;
  if (Math.abs(dx) <= 2 * Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'previous';
}

/** Whether to suggest turning the device: a landscape course, a portrait screen, a compact player. */
export function wantsRotation(
  stage: { width: number; height: number },
  viewport: { width: number; height: number },
  compact: boolean,
): boolean {
  return compact && stage.width > stage.height && viewport.height > viewport.width;
}

export interface ResponsiveParts {
  root: HTMLElement;
  /** Where the course is: swipes start here. */
  viewport: HTMLElement;
  stage: { width: number; height: number };
  /** The More button and the controls it shows and hides when compact. */
  more: HTMLButtonElement;
  extras: readonly HTMLElement[];
  /** The rotation hint and its Dismiss button. */
  hint: HTMLElement;
  dismiss: HTMLButtonElement;
  /** A touch swipe on the course. */
  onSwipe(direction: 'next' | 'previous'): void;
  /** Whether a swipe starting on `target` belongs to it instead (a drag tile, a field). */
  ownsPointer(target: EventTarget | null): boolean;
}

/** Follow the player's size and the learner's fingers. Returns a function that stops it all. */
export function attachResponsive(parts: ResponsiveParts): () => void {
  const { root, viewport, more, extras, hint, dismiss } = parts;
  const window = root.ownerDocument.defaultView!;
  let dismissed = false;
  for (const extra of extras) extra.classList.add('vo-player-extra');

  const setMore = (open: boolean) => {
    more.setAttribute('aria-expanded', String(open));
    if (open) root.dataset['more'] = 'true';
    else delete root.dataset['more'];
  };
  setMore(false);
  more.addEventListener('click', () => setMore(root.dataset['more'] !== 'true'));
  dismiss.addEventListener('click', () => {
    dismissed = true;
    hint.hidden = true;
  });

  const follow = () => {
    const width = root.clientWidth;
    const compact = isCompact(width);
    if (compact) root.dataset['compact'] = 'true';
    else {
      delete root.dataset['compact'];
      setMore(false);
    }
    more.hidden = !compact;
    const screen = { width: viewport.clientWidth, height: viewport.clientHeight };
    root.dataset['orientation'] = screen.width >= screen.height ? 'landscape' : 'portrait';
    hint.hidden = dismissed || !wantsRotation(parts.stage, screen, compact);
  };
  const observer = new window.ResizeObserver(follow);
  observer.observe(root);
  observer.observe(viewport);
  follow();

  let touch: { id: number; x: number; y: number; at: number } | null = null;
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !event.isPrimary || parts.ownsPointer(event.target)) {
      touch = null;
      return;
    }
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
  };
  const up = (event: PointerEvent) => {
    if (!touch || event.pointerId !== touch.id) return;
    const direction = swipeOf(
      event.clientX - touch.x,
      event.clientY - touch.y,
      event.timeStamp - touch.at,
    );
    touch = null;
    if (direction) parts.onSwipe(direction);
  };
  const cancel = () => {
    touch = null;
  };
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', cancel);
  return () => {
    observer.disconnect();
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', cancel);
  };
}
