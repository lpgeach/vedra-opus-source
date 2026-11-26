import type { Frame } from '@vedraopus/model';
import { cornersOf } from './geometry';

/**
 * The selection's name above its top-left corner and its size below its bottom-right one
 * (docs/briefs/B17-ribbon-and-panels.md, part 3), so the author sees what is selected without
 * looking at a panel. For the editor only: nothing here reaches a course.
 */
export function SelectionTags({ box, zoom, name }: { box: Frame; zoom: number; name: string }) {
  // Around the frame as drawn, turned or not.
  const corners = cornersOf(box);
  const xs = corners.map((corner) => corner.x * zoom);
  const ys = corners.map((corner) => corner.y * zoom);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return (
    <>
      <span className="selection-tag" data-testid="selection-name" style={{ left, top }}>
        {name}
      </span>
      <span
        className="selection-tag selection-size"
        data-testid="selection-size"
        style={{ left: right, top: bottom }}
      >
        {Math.round(box.width)} × {Math.round(box.height)}
      </span>
    </>
  );
}
