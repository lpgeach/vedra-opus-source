/**
 * Space does two things in the editor: pressed and let go, it plays or pauses
 * the timeline (Luke, testing alpha 1); held while dragging over the stage, it
 * pans. The stage notes a pan here, and the timeline leaves Space alone then.
 */
export const spaceKey = { panned: false };

/** Whether a key event's target is where Space means something else: typing, or pressing a control. */
export function spaceBelongsTo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, button, [role="button"], [contenteditable="true"]') !==
      null
  );
}
