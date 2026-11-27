import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * The Animations tab's effect galleries (docs/briefs/B28-animation-gallery.md): a button
 * showing the chosen effect, which opens a grid of tiles to choose from.
 */

/** The gallery button of the entrance or the exit; its `data-kind` is the chosen effect. */
export function effectButton(page: Page, phase: 'Entrance' | 'Exit'): Locator {
  return page.getByRole('button', { name: `${phase} effect`, exact: true });
}

/** Choose an effect by its name ("Fly", "None") from the gallery, which then closes. */
export async function chooseEffect(
  page: Page,
  phase: 'Entrance' | 'Exit',
  name: string,
): Promise<void> {
  await effectButton(page, phase).click();
  const grid = page.getByRole('radiogroup', { name: `${phase} effect`, exact: true });
  await grid.getByRole('radio', { name, exact: true }).click();
  await expect(grid).toHaveCount(0);
}
