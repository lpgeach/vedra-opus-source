import type { ObjectChanges, Project, SceneObject } from '@vedraopus/model';
import { createRenderContext, measureGrowHeight, renderObject, toDom } from '@vedraopus/render';

/** Room for one line of text at the default size, so an empty box does not collapse. */
const ONE_LINE = 24;

/**
 * A text box set to "grow box to fit" is exactly as tall as its text needs,
 * however the text came to change: typed on the stage, or restyled from the
 * ribbon or a panel while the box is only selected. It grows when the text
 * needs more room and shrinks when it needs less. Given a change about to be
 * made to `object`, this returns the height the box should then have, or null
 * when the change does not call for one (not such a box, nothing relevant
 * changed, or it is already that height).
 */
export function heightToGrowTo(
  project: Project,
  object: SceneObject,
  changes: ObjectChanges,
): number | null {
  if (object.type !== 'text') return null;
  const props = { ...object.props, ...changes.props } as typeof object.props;
  if (props.autofit !== 'growShape') return null;
  const frame = { ...object.frame, ...changes.frame };
  const touchesText =
    changes.props !== undefined &&
    ('text' in changes.props || 'padding' in changes.props || 'autofit' in changes.props);
  const resized = frame.width !== object.frame.width;
  if (!touchesText && !resized) return null;

  // Draw the box as it will be, out of sight, and measure its text.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;';
  document.body.append(host);
  try {
    const context = createRenderContext(project, { assetUrl: () => undefined, idPrefix: 'grow-' });
    // Drawn one unit tall, so the text's own height is what gets measured, not the box's.
    const drawn = toDom(
      renderObject({ ...object, frame: { ...frame, height: 1 }, props }, context),
      document,
    );
    host.append(drawn);
    const block = drawn.querySelector<HTMLElement>('.vo-text');
    const needed = block
      ? measureGrowHeight(block, props.padding, ONE_LINE + props.padding * 2)
      : null;
    // The stored height before this change is what matters: an explicit height in
    // the change (the on-stage editor sends one) is replaced by the measured one.
    return needed !== null && needed !== object.frame.height ? needed : null;
  } finally {
    host.remove();
  }
}
