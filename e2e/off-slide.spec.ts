import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';
import { halfway, near, pixelAt } from './pixels';

/**
 * Objects past the slide's edges (docs/briefs/B2-off-slide.md): dimmed to half by
 * default, shown in full, or hidden as the course hides them; still picked either
 * way, and the choice kept for next time.
 */

const DONT_SAVE = 1;
const canvas = (page: Page) => page.getByTestId('stage-canvas');

/** Where a stage point is on screen right now. */
async function onScreen(page: Page, x: number, y: number) {
  const bounds = (await canvas(page).boundingBox())!;
  const zoom = Number(await canvas(page).getAttribute('data-zoom'));
  return { x: bounds.x + x * zoom, y: bounds.y + y * zoom };
}

const colourAt = async (page: Page, x: number, y: number) => {
  const at = await onScreen(page, x, y);
  return pixelAt(page, at.x, at.y);
};

test('objects past the slide: shown, dimmed or hidden, still picked, and the choice kept', async () => {
  const first = await launchApp();
  let { app, page } = first;
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(canvas(page)).toBeVisible();

    // A rectangle (540–740 × 300–420 on the 1280×720 slide), moved 600 to the right:
    // 1140–1340, so its last 60 units are past the slide's right edge.
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Shape', exact: true }).click();
    await page
      .getByTestId('shape-gallery')
      .getByRole('button', { name: 'Rectangle', exact: true })
      .click();
    const from = await onScreen(page, 640, 360);
    const to = await onScreen(page, 1240, 360);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.down('Control');
    await page.mouse.move((from.x + to.x) / 2, from.y);
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    await page.keyboard.up('Control');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection')).toHaveCount(0);

    // Inside the slide, on the shape; past its edge, on the shape; past its edge, beside it.
    const inside = () => colourAt(page, 1200, 360);
    const outside = () => colourAt(page, 1320, 360);
    const pasteboard = () => colourAt(page, 1320, 600);
    const fill = await inside();
    const bare = await pasteboard();
    expect(near(fill, bare, 30)).toBe(false);

    // Dimmed, by default (Luke): halfway between the shape and the pasteboard; the
    // slide itself untouched.
    const choices = page.getByTestId('off-slide');
    await page.getByRole('tab', { name: 'View', exact: true }).click();
    await expect(choices.getByRole('radio', { name: 'Dim' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('stage-off-slide')).toHaveAttribute('data-off-slide', 'dim');
    // Read once the stage has painted, as the checks below do.
    await expect.poll(async () => near(await outside(), halfway(fill, bare), 8)).toBe(true);

    // Shown: past the edge it is drawn as it is inside.
    await choices.getByRole('radio', { name: 'Show' }).click();
    await expect(page.getByTestId('stage-off-slide')).toHaveCount(0);
    await expect.poll(async () => near(await outside(), fill)).toBe(true);
    expect(near(await inside(), fill)).toBe(true);
    await expect.poll(async () => near(await pasteboard(), bare)).toBe(true);

    // Hidden: past the edge is the bare pasteboard.
    await choices.getByRole('radio', { name: 'Hide' }).click();
    await expect.poll(async () => near(await outside(), bare)).toBe(true);
    expect(near(await inside(), fill)).toBe(true);

    // Still picked by its hidden part.
    const hidden = await onScreen(page, 1320, 360);
    await page.mouse.click(hidden.x, hidden.y);
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');

    // The choice is the installation's, kept for next time.
    await app.close();
    ({ app, page } = await launchApp({ userDataDir: first.userDataDir }));
    await answerDialogs(app, { message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'View', exact: true }).click();
    await expect(
      page.getByTestId('off-slide').getByRole('radio', { name: 'Hide' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('stage-off-slide')).toHaveAttribute('data-off-slide', 'hide');
  } finally {
    await app.close();
  }
});
