import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

test('typing into a text box on the stage changes its text, and undo takes it back', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    await expect(box).toHaveCount(1);

    await box.dblclick();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.type('Hello world');
    await page.keyboard.press('Escape');
    await expect(box).toContainText('Hello world');

    // One undo step takes the typing back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(box).not.toContainText('Hello world');
  } finally {
    await app.close();
  }
});

test('clicking outside the text box keeps what was typed', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    await box.dblclick();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.type('Kept text');

    // Click empty stage, well away from the box (the box is in the middle).
    const canvas = page.getByTestId('stage-canvas');
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.click(bounds.x + 20, bounds.y + 20);
    await expect(page.getByTestId('text-editor')).toHaveCount(0);
    await expect(box).toContainText('Kept text');
  } finally {
    await app.close();
  }
});

test('leaving the text box by another route, such as switching view, keeps what was typed', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    await box.dblclick();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.type('Still here');

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByTestId('overview')).toBeVisible();
    await page.getByRole('button', { name: 'Slide View', exact: true }).click();
    await expect(box).toContainText('Still here');
  } finally {
    await app.close();
  }
});

const tabNamed = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true });

test('the Text Format tab appears for text, opens on edit, and font size can be typed', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(tabNamed(page, 'Text Format')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    // Selected: the tab is offered, but the ribbon stays where the author was.
    await expect(tabNamed(page, 'Text Format')).toBeVisible();
    await expect(tabNamed(page, 'Insert')).toHaveAttribute('aria-selected', 'true');

    // Editing: the text tools come forward by themselves.
    await box.dblclick();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await expect(tabNamed(page, 'Text Format')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Big words');
    await page.keyboard.press('ControlOrMeta+a');

    // Typed a key at a time, as an author does: both digits must arrive.
    const size = page.getByLabel('Font size');
    await size.click();
    await size.pressSequentially('36');
    await expect(size).toHaveValue('36');
    await expect(
      page.getByTestId('text-editor').locator('span[style*="font-size: 36px"]'),
    ).toHaveText('Big words');
    // Enter goes back to the text, still selected, so the next tool applies to it.
    await size.press('Enter');
    await page.getByRole('button', { name: 'Larger text' }).click();
    await expect(size).toHaveValue('38');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-editor')).toHaveCount(0);
    await expect(
      box.locator('span[style*="font-size:38px"], span[style*="font-size: 38px"]'),
    ).toContainText('Big words');
    await expect(box.locator('strong')).toContainText('Big words');

    // Nothing with text selected: the tab goes and the ribbon returns to where it was.
    const canvas = (await page.getByTestId('stage-canvas').boundingBox())!;
    await page.mouse.click(canvas.x + 20, canvas.y + 20);
    await expect(tabNamed(page, 'Text Format')).toHaveCount(0);
    await expect(tabNamed(page, 'Insert')).toHaveAttribute('aria-selected', 'true');
  } finally {
    await app.close();
  }
});

test('a selected text box can be formatted as a whole without editing it', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    await tabNamed(page, 'Text Format').click();
    await expect(page.getByRole('group', { name: 'Font (whole box)' })).toBeVisible();

    await page.getByRole('button', { name: 'Italic', exact: true }).click();
    await expect(box.locator('em')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Italic', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const size = page.getByLabel('Font size');
    await size.click();
    await size.pressSequentially('24');
    await expect(box.locator('span[style*="font-size"]')).toHaveCount(1);
    await expect(size).toHaveValue('24');
    expect(await box.locator('span[style*="font-size"]').getAttribute('style')).toContain('24px');

    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(box.locator('em')).toHaveCount(0);
    await expect(box.locator('span[style*="font-size"]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('the icon tools: alignment, lists, spacing, link and fit', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    await tabNamed(page, 'Text Format').click();
    const button = (name: string) => page.getByRole('button', { name, exact: true });

    // Alignment is one-of-four.
    await expect(button('Align left')).toHaveAttribute('aria-pressed', 'true');
    await button('Align centre').click();
    await expect(button('Align centre')).toHaveAttribute('aria-pressed', 'true');
    await expect(button('Align left')).toHaveAttribute('aria-pressed', 'false');
    await expect(box.locator('p')).toHaveCSS('text-align', 'center');

    await button('Bulleted list').click();
    await expect(box.locator('ul li')).toHaveCount(1);
    await expect(button('Bulleted list')).toHaveAttribute('aria-pressed', 'true');
    await button('Numbered list').click();
    await expect(box.locator('ol li')).toHaveCount(1);
    await button('Numbered list').click();
    await expect(box.locator('li')).toHaveCount(0);

    await button('Line and paragraph spacing').click();
    await page.getByRole('menuitemcheckbox', { name: 'Line spacing 2' }).click();
    expect(await box.locator('p').evaluate((p: HTMLElement) => p.style.lineHeight)).toBe('2');
    await button('Line and paragraph spacing').click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Line spacing 2' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('menuitemcheckbox', { name: 'Space after paragraph' }).click();
    expect(await box.locator('p').evaluate((p: HTMLElement) => p.style.marginBottom)).toBe('12px');

    await button('Link').click();
    await page.getByLabel('Link address').fill('https://example.com');
    await page.getByLabel('Link address').press('Enter');
    await expect(box.locator('a[href="https://example.com"]')).toHaveCount(1);
    await expect(button('Link')).toHaveAttribute('aria-pressed', 'true');

    await expect(button('Fixed size')).toHaveAttribute('aria-pressed', 'true');
    await button('Shrink text to fit').click();
    await expect(button('Shrink text to fit')).toHaveAttribute('aria-pressed', 'true');

    // The colour button is the same size as the icon buttons beside it.
    const sizes = await page.evaluate(() =>
      ['[aria-label="Underline"]', '.color-button'].map((selector) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height), Math.round(box.top)];
      }),
    );
    expect(sizes[1]).toEqual(sizes[0]);

    if (process.env['VEDRAOPUS_SHOT']) {
      await page.getByTestId('ribbon').screenshot({ path: process.env['VEDRAOPUS_SHOT'] });
    }
  } finally {
    await app.close();
  }
});

test('a grow-to-fit box follows its text, growing and shrinking, without being edited', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    const height = () => box.evaluate((e: HTMLElement) => parseFloat(e.style.height));
    const textHeight = () =>
      box.evaluate((e: HTMLElement) => e.querySelector('.vo-rich-text')!.scrollHeight);
    /** Exactly the text's height plus the padding of 8 above and below. */
    const fits = async () => {
      const [h, t] = [await height(), await textHeight()];
      return h >= t + 16 && h <= t + 17;
    };
    const setSize = async (value: string) => {
      const size = page.getByLabel('Font size');
      await size.click();
      await size.fill('');
      await size.pressSequentially(value);
      // Leave the field, which ends the step.
      await size.press('Enter');
    };
    await tabNamed(page, 'Text Format').click();
    const start = await height();

    // Fixed size: a big font overflows and the box stays as it was.
    await setSize('96');
    expect(await height()).toBe(start);
    await page.getByRole('button', { name: 'Undo' }).click();

    // Choosing "grow box to fit" fits the box to the text straight away.
    await page.getByRole('button', { name: 'Grow box to fit', exact: true }).click();
    await expect.poll(fits).toBe(true);
    const fitted = await height();
    expect(fitted).toBeLessThanOrEqual(start);

    // The box is only selected, not being edited. A bigger font grows it…
    await setSize('96');
    await expect(page.getByTestId('text-editor')).toHaveCount(0);
    await expect.poll(height).toBeGreaterThan(fitted);
    expect(await fits()).toBe(true);
    const big = await height();

    // …and a smaller font shrinks it again.
    await setSize('24');
    await expect.poll(height).toBeLessThan(big);
    expect(await fits()).toBe(true);

    // The font and the height change together: one undo puts both back.
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await height()).toBe(big);
    await expect(
      box.locator('span[style*="font-size: 96px"], span[style*="font-size:96px"]'),
    ).toHaveCount(1);

    // Narrowing the box wraps its text, so it gets taller; widening lets it shrink back.
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    const width = page.getByTestId('format-panel').getByLabel('W', { exact: true });
    await width.fill('60');
    await expect.poll(height).toBeGreaterThan(big);
    await width.fill('600');
    await expect.poll(height).toBe(big);
  } finally {
    await app.close();
  }
});

test('a grow-to-fit box fits what was typed when editing ends, including when text was removed', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('tab', { name: 'Insert' }).click();
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    const box = page.locator('.stage-slide > [data-object-type="text"]');
    const height = () => box.evaluate((e: HTMLElement) => parseFloat(e.style.height));
    await tabNamed(page, 'Text Format').click();
    await page.getByRole('button', { name: 'Grow box to fit', exact: true }).click();
    const oneLine = await height();
    // At the test window's zoom a one-line box is a few pixels tall and its resize
    // handles cover its middle, so double-click a quarter of the way along instead.
    const edit = async () => {
      const bounds = (await box.boundingBox())!;
      await box.dblclick({ position: { x: bounds.width / 4, y: bounds.height / 2 } });
      await expect(page.getByTestId('text-editor')).toBeVisible();
    };

    await edit();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('One');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Two');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Three');
    await page.keyboard.press('Escape');
    await expect.poll(height).toBeGreaterThan(oneLine);
    const threeLines = await height();

    await edit();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('One');
    await page.keyboard.press('Escape');
    await expect.poll(height).toBeLessThan(threeLines);
    expect(await height()).toBe(oneLine);
  } finally {
    await app.close();
  }
});
