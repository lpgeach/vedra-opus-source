/**
 * @vedraopus/render — draws project objects as HTML and SVG, identically in
 * the editor, in preview and in published courses.
 *
 * Renderers are pure functions from model objects to a plain description of
 * markup (`RenderNode`); `toMarkup` and `toDom` make it real. No React here:
 * the player ships this package. See docs/briefs/P2.3-object-renderers.md.
 */
export { createRenderContext, resolveColor } from './context';
export type { RenderContext, RenderContextOptions } from './context';
export {
  closedPath,
  coverPlacement,
  cropPlacement,
  gradientLine,
  linePath,
  roundRectPath,
  scaledPath,
} from './geometry';
export { h, styleText, toDom, toMarkup } from './node';
export type { RenderChild, RenderNode } from './node';
export {
  DIAL_SWEEP,
  dialLookAngle,
  panoramaDirection,
  panoramaPoint,
  renderInheritedLayers,
  renderSlideBackground,
  renderLayer,
  renderObject,
  renderSlide,
} from './objects';
export { TEXT_CLASS, renderRichText } from './text';
export { applyTextAutofit, measureGrowHeight } from './autofit';
export { createAnimator, effectKeyframes, objectBounds, rotatedBounds } from './animation';
export type { AnimationState, Animator, Box, EffectFrames, EffectOptions } from './animation';
export { layerTransitionKeyframes, transitionKeyframes } from './transition';
export type { TransitionFrames } from './transition';
