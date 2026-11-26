import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The brand (docs/briefs/B18-brand.md): the Vedra Opus logo on the Welcome screen, and Outfit,
 * bundled with the app, as the typeface of the whole app.
 */
test('the Welcome screen shows the logo, and the whole app is set in Outfit (B18)', async () => {
  const { app, page } = await launchApp();
  try {
    const logo = page.getByTestId('welcome-logo').getByRole('img', { name: 'Vedra Opus' });
    await expect(logo).toBeVisible();
    // The logo's shape is the brand SVG, which the page can load.
    const shape = await logo.evaluate(async (element) => {
      const url = /url\("?([^")]+)"?\)/.exec(getComputedStyle(element).maskImage)?.[1] ?? '';
      const text = await (await fetch(url)).text();
      return { svg: text.includes('<svg'), title: /<title>([^<]*)<\/title>/.exec(text)?.[1] };
    });
    expect(shape).toEqual({ svg: true, title: 'Vedra Opus' });
    const box = (await logo.boundingBox())!;
    expect(box.width).toBeGreaterThan(50);
    expect(box.height).toBeGreaterThan(box.width);

    // Outfit is the app's typeface, from the app's own files, and is what the text is drawn in.
    const font = await page.evaluate(async () => {
      await document.fonts.ready;
      const button = document.querySelector('.welcome button')!;
      await document.fonts.load(`14px "Outfit Variable"`, 'Vedra Opus');
      return {
        body: getComputedStyle(document.body).fontFamily.split(',')[0]!.trim(),
        button: getComputedStyle(button).fontFamily.split(',')[0]!.trim(),
        loaded: [...document.fonts].some(
          (face) => face.family.includes('Outfit') && face.status === 'loaded',
        ),
      };
    });
    expect(font).toEqual({ body: '"Outfit Variable"', button: '"Outfit Variable"', loaded: true });

    // And in the editor too.
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('editor')).toBeVisible();
    const ribbonFont = await page
      .getByTestId('ribbon')
      .evaluate((element) => getComputedStyle(element).fontFamily.split(',')[0]!.trim());
    expect(ribbonFont).toBe('"Outfit Variable"');
  } finally {
    await app.close();
  }
});
