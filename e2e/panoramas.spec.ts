import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * 360° images (docs/briefs/P9.10-panoramas.md), made in the app: a picture
 * inserted as a 360° image, a spot added in the Format panel and another by
 * double-clicking the picture, guided mode and a trigger on the first spot;
 * saved and reopened; published and explored.
 */

const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const panorama = (page: Page) =>
  page.getByTestId('stage-canvas').locator('[data-object-type="panorama"]');
const format = (page: Page) => page.getByTestId('panorama-format');

test('a 360° image made in the app survives saving and can be explored in the course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-panorama-'));
  const file = join(work, 'panorama.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[imagePath]], save: [file], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByTestId('slide-list').locator('.slide-item').first().click();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: '360° Image…', exact: true }).click();
    await expect(panorama(page)).toHaveCount(1);
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(format(page)).toBeVisible();

    // A spot where the view starts, given a title and text.
    await format(page).getByRole('button', { name: 'Add spot' }).click();
    const title = format(page).getByLabel('Spot 1 title');
    await title.fill('The door');
    await title.press('Enter');
    // Another three quarters across the picture: yaw 90°, on the horizon.
    const box = (await panorama(page).boundingBox())!;
    await page.mouse.dblclick(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect(format(page).getByTestId('panorama-spot')).toHaveCount(2);
    // Within a degree or two: the stage is drawn at a zoom, so pixels round.
    const near = async (label: string, wanted: number) =>
      expect(
        Math.abs(Number(await format(page).getByLabel(label).inputValue()) - wanted),
      ).toBeLessThanOrEqual(2);
    await near('Spot 2 yaw', 90);
    await near('Spot 2 pitch', 0);
    await expect(panorama(page).locator('.vo-panorama-dot')).toHaveCount(2);
    await format(page).getByLabel('360° image exploring').selectOption('guided');

    // Opening the first spot goes on to slide 2.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('spotClicked');
    await wizard.getByLabel('Action', { exact: true }).selectOption('jumpToSlide');
    await expect(page.getByTestId('trigger-sentence')).toContainText(
      'when the learner opens “Spot 1”',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    await page.getByTestId('slide-list').locator('.slide-item').first().click();
    await expect(panorama(page).locator('.vo-panorama-dot')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('triggers-panel')).toContainText('opens “Spot 1”');
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const stage = page.locator('.vo-player-stage');
    const view = stage.locator('.vo-panorama');
    // From file://, Chromium does not let WebGL read the picture: it pans flat.
    await expect(view).toHaveAttribute('data-painter', 'flat');
    // And the picture is drawn: WebGL was tried on the canvas first, and a canvas keeps
    // that kind of context, so the flat view needs a canvas of its own (found with the
    // UK space course, session 112: a black view).
    // The page may not read a picture from file:// back, so the proof it was drawn is just
    // that: the canvas has a 2D context, and reading it back is refused.
    await expect
      .poll(() =>
        view.evaluate((element) => {
          const canvas = element.querySelector('canvas')!;
          const flat = canvas.getContext('2d');
          if (!flat) return 'no 2D context';
          try {
            flat.getImageData(0, 0, 1, 1);
            return 'nothing drawn from the course';
          } catch (error) {
            return (error as Error).name;
          }
        }),
      )
      .toBe('SecurityError');
    // Looking straight ahead, the first spot is in view and the second (90° round) is not.
    await expect(stage.getByRole('button', { name: 'Spot 1' })).toBeVisible();
    await expect(stage.getByRole('button', { name: 'Spot 2' })).toBeHidden();
    // Guided: Next opens the first spot, whose trigger goes on.
    await stage.getByRole('button', { name: 'Next spot' }).click();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});
