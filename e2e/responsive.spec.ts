import { chromium, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * The published course on a phone (docs/briefs/P8.5-responsive.md): the
 * compact frame, More, a swipe to the next slide, and the rotation hint.
 */

test('a course published from the app works on a phone-sized touch screen', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-responsive-'));
  const out = join(work, 'out');
  mkdirSync(out);

  const launched = await launchApp();
  try {
    const { app, page } = launched;
    await answerDialogs(app, { open: [[out]], message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByTestId('publish-dialog');
    await publish.getByRole('button', { name: 'Choose folder…' }).click();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await launched.app.close();
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const player = page.locator('.vo-player');
    await expect(player).toHaveAttribute('data-compact', 'true');
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');

    // The landscape course on a portrait phone: the hint, which Dismiss puts away.
    const hint = page.getByRole('status').filter({ hasText: 'Turn your device sideways' });
    await expect(hint).toBeVisible();
    await hint.getByRole('button', { name: 'Dismiss', exact: true }).tap();
    await expect(hint).toBeHidden();

    // More, by touch.
    const more = page.getByRole('button', { name: 'More', exact: true });
    await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toBeHidden();
    await more.tap();
    await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toBeVisible();
    await more.tap();

    // A finger swiping left across the course.
    const box = (await page.locator('.vo-player-stage').boundingBox())!;
    await page.evaluate(
      ([x, y]) => {
        const at = document.elementFromPoint(x!, y!)!;
        const init = { bubbles: true, pointerId: 3, isPrimary: true, pointerType: 'touch' };
        at.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: x!, clientY: y! }));
        at.dispatchEvent(
          new PointerEvent('pointerup', { ...init, clientX: x! - 150, clientY: y! }),
        );
      },
      [box.x + box.width * 0.8, box.y + box.height / 2],
    );
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});
