/**
 * Popovers that open under a button (the ribbon's menus and galleries, the stage toolbar's
 * menus): where they open, and how they close.
 */
import { useEffect } from 'react';
import type { CSSProperties, RefObject } from 'react';

/**
 * Where a ribbon popover opens: under its button, fixed to the window, so the
 * command row (which scrolls sideways when the window is narrow) does not cut
 * it off. Near the window's right edge it opens leftwards from the button.
 */
export function popupPlace(container: RefObject<HTMLElement | null>): CSSProperties {
  const box = container.current?.getBoundingClientRect();
  if (!box) return {};
  return box.left + 300 > window.innerWidth
    ? {
        position: 'fixed',
        top: box.bottom,
        left: 'auto',
        right: Math.max(4, window.innerWidth - box.right),
      }
    : { position: 'fixed', top: box.bottom, left: Math.max(4, box.left) };
}

/** Close a popover on a click elsewhere, Escape, or the ribbon scrolling under it. */
export function useDismiss(
  container: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
  /** The command row scrolled under the open popover: put it under its button again. */
  follow?: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // A popover is fixed to the window: when the command row scrolls, it follows its button.
    const onScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.classList.contains('ribbon-commands')) {
        follow?.();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [container, open, close, follow]);
}
