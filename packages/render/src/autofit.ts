/**
 * Browser-only helpers for text autofit. Static rendering is pure (nodes/markup),
 * but shrink-to-fit depends on measured layout with real fonts. Call these after
 * the rendered markup is in the DOM (and fonts are ready) to make shrinkText
 * deterministic in preview/editor parity contexts.
 */

const MIN_SCALE = 0.2;

/**
 * Apply shrink-to-fit scaling to any `.vo-text[data-autofit="shrinkText"]`
 * elements inside `root`. Safe to call repeatedly.
 */
export function applyTextAutofit(root: ParentNode = document): void {
  const blocks = root.querySelectorAll<HTMLElement>('.vo-text[data-autofit="shrinkText"]');
  for (const block of blocks) {
    const content = block.querySelector<HTMLElement>('.vo-rich-text');
    if (!content) continue;
    // Reset before measuring.
    content.style.transform = '';
    content.style.transformOrigin = '';
    const padX =
      parseFloat(getComputedStyle(block).paddingLeft) +
      parseFloat(getComputedStyle(block).paddingRight);
    const padY =
      parseFloat(getComputedStyle(block).paddingTop) +
      parseFloat(getComputedStyle(block).paddingBottom);
    const availW = Math.max(0, block.clientWidth - padX);
    const availH = Math.max(0, block.clientHeight - padY);
    if (availW <= 0 || availH <= 0) continue;
    // scrollHeight/Width reflect unscaled content; use them to compute needed scale.
    const needW = content.scrollWidth;
    const needH = content.scrollHeight;
    if (needW <= 0 || needH <= 0) continue;
    let scale = Math.min(availW / needW, availH / needH, 1);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    scale = Math.max(MIN_SCALE, Math.min(1, scale));
    if (scale < 1) {
      content.style.transformOrigin =
        block.dataset['align'] === 'center' ? 'center center' : 'top left';
      content.style.transform = `scale(${scale})`;
    }
  }
}

/**
 * Measure the height a growShape text box needs for its current content.
 * Returns the required frame height (including vertical padding), or null if not applicable.
 */
export function measureGrowHeight(
  block: HTMLElement,
  padding: number,
  minHeight = 1,
): number | null {
  const content = block.querySelector<HTMLElement>('.vo-rich-text');
  if (!content) return null;
  const contentHeight = content.scrollHeight;
  return Math.max(minHeight, Math.ceil(contentHeight + padding * 2));
}
