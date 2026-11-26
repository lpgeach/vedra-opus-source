import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * The player's tabs (docs/briefs/P8.2-player-tabs.md), made in the app: a
 * link and a file in Resources, a glossary term, a slide's notes and a custom
 * tab with a trigger. They survive a save and a fresh start, and each works
 * in the published course, the file included.
 */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const playerDialog = (page: Page) => page.getByTestId('player-dialog');
const openPlayerDialog = async (page: Page) => {
  await ribbon(page, 'Design');
  await page.getByRole('button', { name: 'Player…', exact: true }).click();
  await expect(playerDialog(page)).toBeVisible();
};
const items = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');
const notesTab = (page: Page) =>
  page.getByTestId('panel-bottom').getByRole('tab', { name: 'Notes', exact: true }).click();

test('tabs made in the Player dialog survive saving and work in the published course', async () => {
  test.setTimeout(150_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-tabs-'));
  const file = join(work, 'tabs.vedraopus');
  const guide = join(work, 'Course guide.pdf');
  writeFileSync(guide, '%PDF-1.4\n%%EOF\n');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[guide]], save: [file] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();

    // Slide 1's notes.
    await items(page).first().click();
    await notesTab(page);
    const notes = page.getByLabel('Slide notes', { exact: true });
    await notes.fill('Welcome everyone.\nPoint at the chart.');
    await notes.blur();

    await openPlayerDialog(page);
    const tabs = playerDialog(page).getByTestId('player-tabs');
    await tabs.getByLabel('New link title', { exact: true }).fill('Help desk');
    await tabs.getByLabel('New link address', { exact: true }).fill('https://example.com/help');
    await tabs.getByRole('button', { name: 'Add link', exact: true }).click();
    await tabs.getByRole('button', { name: 'Add file…', exact: true }).click();
    await expect(tabs.getByTestId('resource-item')).toHaveCount(2);
    await expect(tabs.getByLabel('Resource 2 title', { exact: true })).toHaveValue('Course guide');
    await tabs.getByRole('button', { name: 'Add term', exact: true }).click();
    const term = tabs.getByLabel('Term 1', { exact: true });
    await term.fill('Stage');
    await term.press('Enter');
    const definition = tabs.getByLabel('Definition 1', { exact: true });
    await definition.fill('Where the slide is laid out.');
    await definition.blur();
    await tabs.getByRole('button', { name: 'Add tab', exact: true }).click();
    const label = tabs.getByLabel('Custom tab 1 label', { exact: true });
    await label.fill('Skip');
    await label.press('Enter');
    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();

    // On slide 1, the Skip tab goes to the next slide.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Event', { exact: true }).selectOption('playerTab');
    await expect(page.getByTestId('trigger-sentence')).toContainText(
      'when the learner clicks the player tab “Skip”',
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
    await answerDialogs(app, { open: [[out]] });
    await items(page).first().click();
    await notesTab(page);
    await expect(page.getByLabel('Slide notes', { exact: true })).toHaveValue(
      'Welcome everyone.\nPoint at the chart.',
    );
    await openPlayerDialog(page);
    const tabs = playerDialog(page).getByTestId('player-tabs');
    await expect(tabs.getByLabel('Resource 1 title', { exact: true })).toHaveValue('Help desk');
    await expect(tabs.getByTestId('resource-item').nth(1)).toContainText('Course guide.pdf');
    await expect(tabs.getByLabel('Term 1', { exact: true })).toHaveValue('Stage');
    await expect(tabs.getByLabel('Custom tab 1 label', { exact: true })).toHaveValue('Skip');
    await playerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();

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
    const tab = (name: string) =>
      page.getByRole('group', { name: 'Course tabs' }).getByRole('button', { name, exact: true });
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');

    await tab('Resources').click();
    const resources = page.getByRole('region', { name: 'Resources' });
    await expect(resources.getByRole('link', { name: 'Help desk' })).toHaveAttribute(
      'href',
      'https://example.com/help',
    );
    // The file is published with the course, the same bytes.
    const href = await resources.getByRole('link', { name: 'Course guide' }).getAttribute('href');
    const published = fileURLToPath(new URL(href!, page.url()));
    expect(readFileSync(published, 'utf8')).toBe('%PDF-1.4\n%%EOF\n');

    await tab('Glossary').click();
    const glossary = page.getByRole('region', { name: 'Glossary' });
    await expect(glossary.locator('dt')).toHaveText(['Stage']);
    await expect(glossary.locator('dd')).toHaveText(['Where the slide is laid out.']);

    await tab('Notes').click();
    await expect(page.getByRole('region', { name: 'Notes' }).locator('p')).toHaveText([
      'Welcome everyone.',
      'Point at the chart.',
    ]);
    await page.keyboard.press('Escape');

    await tab('Skip').click();
    await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  } finally {
    await browser.close();
  }
});
