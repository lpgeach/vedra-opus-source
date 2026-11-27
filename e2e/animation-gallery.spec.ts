import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { chooseEffect, effectButton } from './animation';
import { answerDialogs, launchApp } from './launch';

/**
 * The Animations tab's galleries (docs/briefs/B28-animation-gallery.md): each of Entrance
 * and Exit is a button showing the chosen effect, opening a grid of every effect with a
 * picture that plays it.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const grid = (page: Page, phase: 'Entrance' | 'Exit') =>
  page.getByRole('radiogroup', { name: `${phase} effect`, exact: true });
const running = (element: Locator) =>
  element.evaluate((node) =>
    node.getAnimations({ subtree: true }).some((each) => each.playState === 'running'),
  );

test('the entrance and exit galleries: every effect, chosen by pointer or keys, each picture playing while pointed at (B28)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    await ribbon(page, 'Animations');

    // No effect yet: the button says None, and the fields beside it wait for one.
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'none');
    await expect(page.getByLabel('Entrance direction')).toBeDisabled();
    await expect(page.getByLabel('Entrance duration')).toBeDisabled();
    await expect(page.getByLabel('Entrance by paragraph')).toBeDisabled();

    // The grid lists every effect, None first.
    await effectButton(page, 'Entrance').click();
    await expect(grid(page, 'Entrance').getByRole('radio')).toHaveText([
      'None',
      'Fade',
      'Fly',
      'Float',
      'Wipe',
      'Split',
      'Iris',
      'Grow',
      'Zoom',
      'Spin',
      'Spin and grow',
      'Bounce',
      'Swivel',
    ]);
    // Escape closes it, choosing nothing.
    await page.keyboard.press('Escape');
    await expect(grid(page, 'Entrance')).toHaveCount(0);
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'none');

    // Fly from the left, then Float: the direction carries over, as Float takes it too.
    await chooseEffect(page, 'Entrance', 'Fly');
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'fly');
    await expect(effectButton(page, 'Entrance')).toContainText('Fly');
    await page.getByLabel('Entrance direction').selectOption('left');
    await chooseEffect(page, 'Entrance', 'Float');
    await expect(page.getByLabel('Entrance direction')).toHaveValue('left');
    // Fade has no direction.
    await chooseEffect(page, 'Entrance', 'Fade');
    await expect(page.getByLabel('Entrance direction')).toBeDisabled();
    await expect(page.getByLabel('Entrance duration')).toBeEnabled();

    // Opened, the keyboard starts on the chosen effect; the arrows choose as they move.
    await effectButton(page, 'Entrance').click();
    await expect(
      grid(page, 'Entrance').getByRole('radio', { name: 'Fade', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'fly');
    await expect(
      grid(page, 'Entrance').getByRole('radio', { name: 'Fly', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    // Each choice is one undo step.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'fade');

    // The exit has its own gallery.
    await chooseEffect(page, 'Exit', 'Zoom');
    await expect(effectButton(page, 'Exit')).toHaveAttribute('data-kind', 'zoom');
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'fade');

    // Pictures play only while pointed at: the button's, and each tile's in the grid.
    await page.mouse.move(0, 0);
    expect(await running(effectButton(page, 'Exit'))).toBe(false);
    await effectButton(page, 'Exit').hover();
    await expect.poll(() => running(effectButton(page, 'Exit'))).toBe(true);
    await effectButton(page, 'Exit').click();
    const spin = grid(page, 'Exit').getByRole('radio', { name: 'Spin', exact: true });
    expect(await running(spin)).toBe(false);
    await spin.hover();
    await expect.poll(() => running(spin)).toBe(true);
    await page.keyboard.press('Escape');

    // None takes the effect away again.
    await chooseEffect(page, 'Exit', 'None');
    await expect(effectButton(page, 'Exit')).toHaveAttribute('data-kind', 'none');
    await expect(page.getByLabel('Exit duration')).toBeDisabled();
  } finally {
    await app.close();
  }
});

test('motion paths are added from buttons with a picture of each path (B28)', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    await ribbon(page, 'Animations');
    for (const name of ['Add line path', 'Add arc path', 'Draw freeform path']) {
      await expect(page.getByRole('button', { name, exact: true }).locator('svg')).toHaveCount(1);
    }
    await page.getByRole('button', { name: 'Add arc path', exact: true }).click();
    await expect(page.getByLabel('Motion path', { exact: true }).locator('option')).toHaveText([
      'Arc',
    ]);
  } finally {
    await app.close();
  }
});
