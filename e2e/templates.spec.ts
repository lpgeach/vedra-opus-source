import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packTwoSlides } from './fixture';
import { answerDialogs, launchApp } from './launch';

/**
 * Templates (docs/briefs/P11.2-templates.md, part A): a project saved as a
 * template, a new project started from it through the chooser, and the
 * template deleted again.
 */

const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);
const DONT_SAVE = 1;
const DELETE = 0;

async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, menuId) => {
    Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click();
  }, id);
}

test('a project saved as a template starts a new project, with its slides and picture', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, {
      open: [[imagePath]],
      message: [DONT_SAVE, DELETE, DONT_SAVE],
    });
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByTestId('ribbon').getByRole('tab', { name: 'Insert', exact: true }).click();
    await page.getByRole('button', { name: 'Picture…' }).click();
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');

    // Save as Template…: a copy; the open project stays as it was.
    await chooseMenuItem(app, 'file.saveAsTemplate');
    const save = page.getByTestId('save-template');
    await save.getByLabel('Template name').fill('Our course');
    await save.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(save.getByRole('status')).toHaveText('Saved as the template “Our course”.');
    await save.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByTestId('project-title')).toHaveValue('Untitled Project');
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');

    // New from Template…: the template is listed, and using it makes a new, unsaved project.
    await chooseMenuItem(app, 'file.newFromTemplate');
    const chooser = page.getByTestId('template-chooser');
    const ours = chooser.getByTestId('template').filter({ hasText: 'Our course' });
    await expect(ours).toContainText(/1 slide · \d+ × \d+/);
    await ours.getByRole('button', { name: 'Use Our course' }).click();
    await expect(chooser).toBeHidden();
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');
    const picture = page.getByTestId('stage-canvas').locator('[data-object-type="image"] img');
    await expect(picture).toHaveCount(1);
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);

    // The author's own template can be deleted, after asking.
    await chooseMenuItem(app, 'file.newFromTemplate');
    await chooser.getByRole('button', { name: 'Delete Our course' }).click();
    await expect(chooser).toContainText('You have no templates yet.');
    await chooser.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(chooser).toBeHidden();
  } finally {
    await app.close();
  }
});

test('the Welcome screen offers New from Template…, with Browse… for any project file', async () => {
  const project = await packTwoSlides(mkdtempSync(join(tmpdir(), 'vo-e2e-template-')));
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[project]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New from Template…', exact: true }).click();
    const chooser = page.getByTestId('template-chooser');
    await expect(chooser).toContainText('You have no templates yet.');
    await chooser.getByRole('button', { name: 'Browse…', exact: true }).click();
    await expect(chooser).toBeHidden();
    await expect(page.getByTestId('slide-list').locator('.slide-item')).toHaveCount(2);
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');
  } finally {
    await app.close();
  }
});

test('the built-in starter templates are listed first, and one starts a new project', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New from Template…', exact: true }).click();
    const chooser = page.getByTestId('template-chooser');
    const builtIn = chooser.getByRole('region', { name: 'Built-in templates' });
    await expect(builtIn.getByTestId('template')).toHaveText([
      /Blank course/,
      /Short course/,
      /Branching scenario/,
      /Quiz/,
      // The demo course ships as a built-in template file too (B4).
      /The UK Space Industry in 2026/,
    ]);
    await expect(builtIn.getByTestId('template').filter({ hasText: 'Short course' })).toContainText(
      '7 slides · 1280 × 720',
    );
    // Built-in templates cannot be deleted.
    await expect(builtIn.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
    await builtIn.getByRole('button', { name: 'Use Branching scenario' }).click();
    await expect(chooser).toBeHidden();
    const slides = page.getByTestId('slide-list').locator('.slide-item');
    await expect(slides).toHaveCount(5);
    await expect(slides.first()).toContainText('The situation');
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');
  } finally {
    await app.close();
  }
});
