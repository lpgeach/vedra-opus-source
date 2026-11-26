import type { Slide } from '@vedraopus/model';
import { renderSlide } from '@vedraopus/render';
import type { RenderContext } from '@vedraopus/render';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { toReact } from '../stage/RenderTree';

/**
 * A slide drawn small, with the same renderer the stage uses. Projects are
 * immutable, so a slide that has not changed is the same object as before and
 * `memo` skips it: only edited slides are drawn again.
 */
export const SlideThumbnail = memo(function SlideThumbnail({
  slide,
  context,
  className,
}: {
  slide: Slide;
  context: RenderContext;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const watcher = new ResizeObserver(() => setWidth(element.clientWidth));
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);
  const { width: stageWidth, height: stageHeight } = context.stage;
  const scale = width / stageWidth;
  return (
    <span
      ref={box}
      className={`slide-thumbnail ${className ?? ''}`}
      style={{ aspectRatio: `${stageWidth} / ${stageHeight}` }}
      data-testid="slide-thumbnail"
      aria-hidden="true"
    >
      <span
        className="slide-thumbnail-inner"
        style={{ width: stageWidth, height: stageHeight, transform: `scale(${scale})` }}
      >
        {width > 0 && toReact(renderSlide(slide, context))}
      </span>
    </span>
  );
});
