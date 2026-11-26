# B3: a 360° image opened from file:// stayed black

**Found:** 2026-11-24, in session 112, while building the UK space course Luke asked for. Its Mars 360° view was black when the published course was opened from a folder. Over HTTP it was fine.

## The cause

The player draws a 360° image with WebGL. When WebGL may not use the picture, the player pans it flat with a 2D canvas instead. From `file://`, Chromium treats the picture as another origin, so the flat fallback is the one that runs.

The bug is in that fallback. `sphere()` had already asked the canvas for a WebGL context, and a canvas keeps the first kind of context it gives out. Its `getContext('2d')` was then null, and the flat painter drew nothing.

`e2e/panoramas.spec.ts` checked only that the flat painter was chosen (`data-painter="flat"`), not that it drew anything.

## The fix

`paint()` in `packages/player/src/panorama.ts`: when `sphere()` returns null, put a fresh copy of the canvas in its place (`cloneNode(false)`, which keeps its class and `aria-hidden`), and draw flat on that one.

## Done when

`e2e/panoramas.spec.ts`, from `file://`, checks:

- the flat view's canvas has a 2D context;
- a picture from the course was drawn into it: the page may not read it back, so reading it throws `SecurityError`.

Before the fix the test fails with "no 2D context"; with the fix it passes.
