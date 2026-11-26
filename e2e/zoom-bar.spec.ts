import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * The zoom (docs/briefs/B17-ribbon-and-panels.md, parts 3 and 4): visible and usable at every
 * zoom. It once floated over the stage, where the scrollbars and objects past the slide covered
 * it; it is now in the toolbar above the stage, so it never overlaps it.
 */

/** Whether the zoom lies above the stage's scrolling area, and is what is under its middle. */
async function zoomBarClear(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-testid="zoom-control"]')!;
    const viewport = document.querySelector<HTMLElement>('[data-testid="stage-viewport"]')!;
    const b = bar.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      inside: b.bottom <= v.top + 0.5 && b.right <= v.right + 0.5 && b.width > 0,
      onTop: !!under && bar.contains(under),
    };
  });
}

test('the zoom stays visible and usable, zoomed right out and right in, in a window zoomed out (B17)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // The whole window zoomed out (Ctrl+minus): its scrollbars keep their size on screen, so
    // in the page's own units they grow wider than the bar's margin (Luke's screenshot).
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(0.6),
    );
    const level = page.getByTestId('zoom-level');
    for (const [button, end] of [
      ['Zoom out', '10%'],
      ['Zoom in', '800%'],
    ] as const) {
      // To the end of the zoom's range.
      for (let i = 0; i < 12 && (await level.textContent()) !== end; i++) {
        await page.getByRole('button', { name: button, exact: true }).click();
      }
      await expect(level).toHaveText(end);
      expect(await zoomBarClear(page)).toEqual({ inside: true, onTop: true });
      // Still usable there.
      await expect(page.getByRole('button', { name: 'Fit', exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(level).not.toHaveText('800%');
    // The level's menu, and 100%.
    await page.getByRole('button', { name: /^Zoom level/ }).click();
    await page.getByRole('menuitemradio', { name: '200%', exact: true }).click();
    await expect(level).toHaveText('200%');
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await expect(level).toHaveText('100%');
  } finally {
    await app.close();
  }
});

test('fitted, the stage settles at any window size: no scrollbars coming and going (B17)', async () => {
  // At some sizes a fitted slide filled its viewport to a rounding sliver; scrollbars came,
  // shrank the fit, went, and came again every frame, so nothing on the stage stood still
  // (CI's macOS, 1024 × 680).
  const { app, page } = await launchApp();
  try {
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    for (const [width, height] of [
      [1024, 680],
      [1024, 676],
      [1024, 684],
      [960, 640],
      [1100, 720],
    ] as const) {
      await app.evaluate(
        ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setSize(w!, h!),
        [width, height],
      );
      await page.waitForTimeout(200);
      const frames = await page.evaluate(async () => {
        const seen = new Set<string>();
        for (let i = 0; i < 10; i++) {
          await new Promise((done) => requestAnimationFrame(() => done(null)));
          const viewport = document.querySelector<HTMLElement>('[data-testid="stage-viewport"]')!;
          const canvas = document.querySelector('[data-testid="stage-canvas"]')!;
          const box = canvas.getBoundingClientRect();
          seen.add(
            `${viewport.clientWidth}x${viewport.clientHeight} ${viewport.offsetWidth - viewport.clientWidth} ${box.x},${box.y},${box.width}`,
          );
        }
        return [...seen];
      });
      // One state across ten frames, with no scrollbar taking room.
      expect(frames, `${width} × ${height}`).toHaveLength(1);
      expect(frames[0]!.split(' ')[1], `${width} × ${height}`).toBe('0');
    }
  } finally {
    await app.close();
  }
});
