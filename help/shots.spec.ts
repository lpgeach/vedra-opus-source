import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { answerDialogs, launchApp } from '../e2e/launch';

/**
 * The help pages' screenshots, and the downloads page's (docs/briefs/B26-help-wiki.md).
 * `npm run help:shots` builds the app and retakes them all into help/images/. Each test
 * drives the app as an author would, so a renamed control fails here instead of leaving a
 * picture that no longer matches the app. Every picture is taken at one pixel per point
 * (`scale: 'css'`), so it is the same size from a high-density screen.
 */

const images = join(import.meta.dirname, 'images');
mkdirSync(images, { recursive: true });

const DONT_SAVE = 1;

/** The window at a size that reads well on a web page. */
async function windowSize(app: ElectronApplication, width = 1600, height = 1000): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setSize(w!, h!),
    [width, height],
  );
}

async function theme(page: Page, name: 'Light' | 'Dark'): Promise<void> {
  await ribbonTab(page, 'View');
  await page.getByRole('radio', { name, exact: true }).click();
}

async function ribbonTab(page: Page, name: string): Promise<void> {
  await page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
}

/** Open the demo course, as the Welcome screen's button does. */
async function openDemo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Explore the Demo Course', exact: true }).click();
  await expect(page.getByTestId('project-title')).toHaveValue('The UK Space Industry in 2026', {
    timeout: 60_000,
  });
}

/** The slide in the Slides panel at this position (0 is the first). */
async function slide(page: Page, index: number): Promise<void> {
  await page.getByTestId('slide-list').locator('.slide-item').nth(index).click();
}

/** Let fonts, pictures and layout settle before a picture is taken. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await page.waitForTimeout(300);
}

async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: join(images, `${name}.png`), scale: 'css' });
}

/** A picture of one part of the window, by its test id. */
async function part(page: Page, testId: string, name: string): Promise<void> {
  await settle(page);
  await page
    .getByTestId(testId)
    .first()
    .screenshot({ path: join(images, `${name}.png`), scale: 'css' });
}

const TABS = ['Home', 'Insert', 'Slides', 'Design', 'Transitions', 'Animations', 'View'];

test('the Welcome screen', async () => {
  const { app, page } = await launchApp();
  try {
    await windowSize(app);
    await expect(
      page.getByRole('button', { name: 'Explore the Demo Course', exact: true }),
    ).toBeVisible();
    await shot(page, 'welcome');
  } finally {
    await app.close();
  }
});

test('the editor, the ribbon tab by tab, and the Overview', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await theme(page, 'Light');
    await slide(page, 0);
    await shot(page, 'editor');
    // With the title's text box selected, so text tools are live on Home.
    await page.getByTestId('stage-canvas').locator('[data-object-type="text"]').nth(1).click();
    for (const tab of TABS) {
      await ribbonTab(page, tab);
      await part(page, 'ribbon', `ribbon-${tab.toLowerCase()}`);
    }
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await shot(page, 'overview');
  } finally {
    await app.close();
  }
});

test('the Transitions tab, light and dark', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await slide(page, 2);
    for (const name of ['Light', 'Dark'] as const) {
      await theme(page, name);
      await ribbonTab(page, 'Transitions');
      await page.mouse.move(0, 0);
      await part(page, 'ribbon', `transitions-${name.toLowerCase()}`);
    }
  } finally {
    await app.close();
  }
});

/** Select an object by its name, through its row on the timeline. */
async function select(page: Page, name: string): Promise<void> {
  await page
    .getByTestId('timeline-row')
    .filter({ hasText: name })
    .first()
    .locator('.timeline-name')
    .click();
}

/** A tab in the right-hand panels or the bottom panel. */
async function panelTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}

test('objects: the Format panel, the shapes, icons, and Find and Replace', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await slide(page, 2);
    await select(page, 'Stat 1');
    await panelTab(page, 'Format');
    await shot(page, 'objects-selected');
    await part(page, 'right-upper', 'format-panel');

    await ribbonTab(page, 'Insert');
    await page.getByRole('button', { name: 'Shape', exact: true }).click();
    await part(page, 'shape-gallery', 'shape-gallery');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Icons…', exact: true }).click();
    await part(page, 'library-dialog', 'icons-dialog');
    await page.keyboard.press('Escape');

    await ribbonTab(page, 'Home');
    await page.getByRole('button', { name: 'Find and Replace…', exact: true }).click();
    await page.getByTestId('find-replace').getByRole('textbox').first().fill('space');
    await part(page, 'find-replace', 'find-replace');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('states and layers: a button’s states, the slide’s layers, editing a layer', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await slide(page, 6);
    await select(page, 'SaxaVord, Shetland button');
    await panelTab(page, 'States');
    await shot(page, 'states');
    await part(page, 'states-panel', 'states-panel');

    await panelTab(page, 'Slide Layers');
    await part(page, 'right-lower', 'slide-layers');
    await page
      .getByTestId('layer-row')
      .filter({ hasText: 'Sutherland' })
      .locator('.layer-name')
      .click();
    await shot(page, 'layer-editing');

    await panelTab(page, 'Slide Properties');
    await part(page, 'right-lower', 'slide-properties');
  } finally {
    await app.close();
  }
});

test('triggers and variables: the Triggers panel, the trigger wizard, the variables', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await slide(page, 6);
    await panelTab(page, 'Triggers');
    await part(page, 'right-upper', 'triggers-panel');

    await page.getByRole('button', { name: 'New trigger', exact: true }).click();
    await part(page, 'trigger-wizard', 'trigger-wizard');
    await page.getByTestId('trigger-wizard').getByRole('button', { name: 'Cancel' }).click();

    await page
      .getByTestId('right-upper')
      .getByRole('button', { name: /^Variables \(/ })
      .click();
    await part(page, 'variables-dialog', 'variables-dialog');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('audio and video: their Format panels, captions, recording, text-to-speech', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await slide(page, 3);
    await select(page, 'Narration');
    await panelTab(page, 'Format');
    await part(page, 'right-upper', 'audio-format');
    await panelTab(page, 'Captions');
    await shot(page, 'captions');

    await slide(page, 5);
    await panelTab(page, 'Timeline');
    await select(page, 'Earth from the ISS');
    await panelTab(page, 'Format');
    await expect(page.getByTestId('right-upper')).toContainText('video selected');
    await part(page, 'right-upper', 'video-format');

    await ribbonTab(page, 'Insert');
    await page.getByRole('button', { name: 'Record Audio…', exact: true }).click();
    await part(page, 'record-dialog', 'record-dialog');
    await page.getByTestId('record-dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Text to Speech…', exact: true }).click();
    await part(page, 'speech-dialog', 'speech-dialog');
    await page.getByTestId('speech-dialog').getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await app.close();
  }
});

test('quizzes: the question kinds, Form View, a draw and a result slide', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await ribbonTab(page, 'Slides');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    await settle(page);
    await page
      .getByRole('menu')
      .first()
      .screenshot({ path: join(images, 'question-menu.png'), scale: 'css' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await settle(page);
    await page
      .getByRole('menu')
      .first()
      .screenshot({ path: join(images, 'survey-menu.png'), scale: 'css' });
    await page.keyboard.press('Escape');

    await slide(page, 13);
    await expect(page.getByTestId('question-form')).toBeVisible();
    await shot(page, 'question-form');
    await slide(page, 18);
    await shot(page, 'draw-form');
    await slide(page, 19);
    await shot(page, 'result-form');
  } finally {
    await app.close();
  }
});

test('the player, tracking, publishing and Preview', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);

    await ribbonTab(page, 'Design');
    await page.getByRole('button', { name: 'Player…', exact: true }).click();
    const player = page.getByTestId('player-dialog');
    await expect(player).toBeVisible();
    // One picture for each of its sections (Features, Menu, Tabs, Look, Words).
    const sections = player.locator(':scope fieldset:not(fieldset fieldset)');
    const count = await sections.count();
    for (let index = 0; index < count; index++) {
      const section = sections.nth(index);
      const legend = (await section.locator('legend').first().textContent()) ?? `${index}`;
      await section.scrollIntoViewIfNeeded();
      await settle(page);
      await section.screenshot({
        scale: 'css',
        path: join(
          images,
          `player-${legend
            .trim()
            .toLowerCase()
            .replace(/[^a-z]+/g, '-')}.png`,
        ),
      });
    }
    await player.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    await part(page, 'tracking-dialog', 'tracking-dialog');
    await page.getByTestId('tracking-dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await part(page, 'publish-dialog', 'publish-dialog');
    await page
      .getByTestId('publish-dialog')
      .getByRole('button', { name: /Cancel|Close/ })
      .first()
      .click();

    const preview = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Preview choices', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Entire Project', exact: true }).click();
    const course = await preview;
    await course.setViewportSize({ width: 1280, height: 800 }).catch(() => undefined);
    await course.waitForTimeout(2500);
    await course.screenshot({ path: join(images, 'preview.png'), scale: 'css' });
  } finally {
    await app.close();
  }
});

test('translation, and templates', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await ribbonTab(page, 'Design');
    await page.getByRole('button', { name: 'Translation…', exact: true }).click();
    await part(page, 'translation-dialog', 'translation-dialog');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('the Animations tab’s grid of entrance effects', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await slide(page, 1);
    await select(page, 'Save my name');
    await ribbonTab(page, 'Animations');
    await page.getByRole('button', { name: 'Entrance effect', exact: true }).click();
    await page.mouse.move(0, 0);
    await settle(page);
    await page
      .locator('.effect-gallery-panel')
      .screenshot({ path: join(images, 'entrance-gallery.png'), scale: 'css' });
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('the downloads page: the editor with the demo course, light and dark', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await windowSize(app);
    await openDemo(page);
    await theme(page, 'Light');
    await ribbonTab(page, 'Home');
    await slide(page, 0);
    await shot(page, 'readme-editor-light');

    await theme(page, 'Dark');
    await ribbonTab(page, 'Home');
    await slide(page, 3);
    await shot(page, 'readme-editor-dark');
  } finally {
    await app.close();
  }
});
