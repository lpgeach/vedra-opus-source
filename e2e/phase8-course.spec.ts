import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * Phase 8 from end to end, with everything made in the app: the player's menu
 * and seekbar (P8.1), a link, a glossary term, slide notes and a custom tab
 * (P8.2), a light look with an accent and a changed word (P8.3), a lightbox
 * button and a lightbox tab (P8.4), and a restart button (P8.6). It survives a
 * save and a fresh start, plays in preview and published, and the published
 * course works on a phone (P8.5).
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const items = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');
const wizard = (page: Page) => page.getByTestId('trigger-wizard');
const dialog = (page: Page) => page.getByTestId('player-dialog');
const openPlayer = async (page: Page) => {
  await ribbon(page, 'Design');
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
};
const commit = async (page: Page, label: string, text: string, scope = dialog(page)) => {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(text);
  await field.press('Enter');
};

/** Play the course in a page, preview or published, as a learner meets it. */
async function play(page: Page) {
  const player = page.locator('.vo-player');
  const position = page.locator('.vo-player-position');
  const tab = (name: string) =>
    page.getByRole('group', { name: 'Course tabs' }).getByRole('button', { name, exact: true });
  const lightbox = page.getByRole('group', { name: 'Lightbox' });
  await expect(position).toHaveText('Slide 1 of 3');
  // The look and the word (P8.3); a draggable seekbar (P8.1).
  await expect(player).toHaveAttribute('data-scheme', 'light');
  await expect(page.getByRole('button', { name: 'Onward', exact: true })).toBeVisible();
  // A narrow window (the Preview window in headless Linux) is compact: the seekbar is behind More (P8.5).
  if ((await player.getAttribute('data-compact')) === 'true') {
    await page.getByRole('button', { name: 'More', exact: true }).click();
  }
  await expect(page.getByRole('slider', { name: 'Slide time', exact: true })).toBeEnabled();
  // The menu with the author's title (P8.1).
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Course menu' }).getByRole('button'),
  ).toHaveText(['Untitled Slide', 'Middle', 'Untitled Slide']);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  // The tabs (P8.2).
  await tab('Resources').click();
  await expect(page.getByRole('region', { name: 'Resources' }).getByRole('link')).toHaveAttribute(
    'href',
    'https://example.com/help',
  );
  await tab('Glossary').click();
  await expect(page.getByRole('region', { name: 'Glossary' }).locator('dt')).toHaveText(['Stage']);
  await tab('Notes').click();
  await expect(page.getByRole('region', { name: 'Notes' }).locator('p')).toHaveText([
    'Welcome notes.',
  ]);
  await tab('Notes').click();
  // The button opens slide 3 as a lightbox with Previous and Next (P8.4).
  await page.locator('.vo-player-stage').getByText('Button', { exact: true }).click();
  // Its Next is the course's word for Next.
  await expect(lightbox.getByRole('button')).toHaveText(['Previous', 'Onward', 'Close']);
  await expect(position).toHaveText('Slide 1 of 3');
  await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(lightbox).toBeHidden();
  // The custom tab opens slide 2 as a lightbox; Escape closes it.
  await tab('Peek').click();
  await expect(lightbox.getByRole('button')).toHaveText(['Close']);
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  // On to slide 3, whose button restarts the course (P8.6).
  await page.getByRole('button', { name: 'Onward', exact: true }).click();
  await page.getByRole('button', { name: 'Onward', exact: true }).click();
  await expect(position).toHaveText('Slide 3 of 3');
  await page.locator('.vo-player-stage').getByText('Button', { exact: true }).click();
  await expect(position).toHaveText('Slide 1 of 3');
}

test('a course using all of Phase 8 survives saving, plays in preview and published, and on a phone', async () => {
  test.setTimeout(240_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-phase8-'));
  const file = join(work, 'phase8.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'New Slide' }).click();

    // Slide 3: a button that restarts the course.
    await items(page).nth(2).click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('restartCourse');
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();

    // Slide 1: notes, and a button that opens slide 3 as a lightbox with controls.
    await items(page).nth(0).click();
    await page.getByTestId('panel-bottom').getByRole('tab', { name: 'Notes', exact: true }).click();
    const notes = page.getByLabel('Slide notes', { exact: true });
    await notes.fill('Welcome notes.');
    await notes.blur();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    await wizard(page).getByLabel('Action', { exact: true }).selectOption('openLightbox');
    await wizard(page).getByLabel('Action slide', { exact: true }).selectOption({ index: 1 });
    await wizard(page).getByLabel('Action shows Previous and Next', { exact: true }).check();
    await wizard(page).getByRole('button', { name: 'Add trigger' }).click();

    // The player: P8.1 to P8.4.
    await openPlayer(page);
    await commit(page, 'Menu title for slide 2', 'Middle');
    await dialog(page).getByLabel('Seekbar', { exact: true }).selectOption('drag');
    const tabs = dialog(page).getByTestId('player-tabs');
    await tabs.getByLabel('New link title', { exact: true }).fill('Help desk');
    await tabs.getByLabel('New link address', { exact: true }).fill('https://example.com/help');
    await tabs.getByRole('button', { name: 'Add link', exact: true }).click();
    await tabs.getByRole('button', { name: 'Add term', exact: true }).click();
    await commit(page, 'Term 1', 'Stage', tabs);
    await tabs.getByRole('button', { name: 'Add tab', exact: true }).click();
    await commit(page, 'Custom tab 1 label', 'Peek', tabs);
    await tabs.getByLabel('Custom tab 1 does', { exact: true }).selectOption({ index: 2 });
    const look = dialog(page).getByTestId('player-look');
    await look.getByLabel('Colour scheme', { exact: true }).selectOption('light');
    await look.getByLabel('Accent colour', { exact: true }).fill('#ffd23f');
    const words = dialog(page).getByTestId('player-words');
    await words.getByText(/^Every word/).click();
    await commit(page, 'Word for Next', 'Onward', words);
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    // Everything as it was left.
    await openPlayer(page);
    await expect(dialog(page).getByLabel('Menu title for slide 2', { exact: true })).toHaveValue(
      'Middle',
    );
    await expect(dialog(page).getByLabel('Seekbar', { exact: true })).toHaveValue('drag');
    await expect(dialog(page).getByLabel('Term 1', { exact: true })).toHaveValue('Stage');
    await expect(dialog(page).getByLabel('Custom tab 1 label', { exact: true })).toHaveValue(
      'Peek',
    );
    await expect(dialog(page).getByLabel('Colour scheme', { exact: true })).toHaveValue('light');
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await items(page).nth(0).click();
    await page.getByTestId('panel-bottom').getByRole('tab', { name: 'Notes', exact: true }).click();
    await expect(page.getByLabel('Slide notes', { exact: true })).toHaveValue('Welcome notes.');

    // Preview, from the start.
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'Entire Project', exact: true }).click(),
    ]);
    await play(preview);
    await preview.close();

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
    const url = pathToFileURL(join(out, 'untitled-project', 'index.html')).href;
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(url);
    await play(page);

    // On a phone (P8.5): compact, More, and a swipe on.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const small = await phone.newPage();
    await small.goto(url);
    await expect(small.locator('.vo-player')).toHaveAttribute('data-compact', 'true');
    await expect(small.getByRole('button', { name: 'More', exact: true })).toBeVisible();
    const box = (await small.locator('.vo-player-stage').boundingBox())!;
    await small.evaluate(
      ([x, y]) => {
        const at = document.elementFromPoint(x!, y!)!;
        const init = { bubbles: true, pointerId: 4, isPrimary: true, pointerType: 'touch' };
        at.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: x!, clientY: y! }));
        at.dispatchEvent(
          new PointerEvent('pointerup', { ...init, clientX: x! - 150, clientY: y! }),
        );
      },
      [box.x + box.width * 0.9, box.y + box.height * 0.9],
    );
    await expect(small.locator('.vo-player-position')).toHaveText('Slide 2 of 3');
  } finally {
    await browser.close();
  }
});
