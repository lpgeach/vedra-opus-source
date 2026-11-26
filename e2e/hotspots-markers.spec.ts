import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wav } from '../fixtures/make-media';
import { answerDialogs, launchApp } from './launch';

/** Hotspots and markers, authored and used in a published course (P9.1). */

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name });
const selectRow = (page: Page, name: string) => row(page, name).locator('.timeline-name').click();

/** Choose an imported asset by the name the author sees, not by its hash. */
async function chooseAsset(page: Page, field: string, name: string): Promise<void> {
  const select = page.getByLabel(field, { exact: true });
  const value = await select.locator('option').filter({ hasText: name }).getAttribute('value');
  expect(value).not.toBeNull();
  await select.selectOption(value!);
}

test('a hotspot and a marker: inserted, given their properties, kept, published and used', async () => {
  test.setTimeout(180_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-markers-'));
  const picture = join(work, 'picture.png');
  const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
  cpSync(
    join(
      fixtureAssets,
      readdirSync(fixtureAssets).find((f) => f.endsWith('.png'))!,
    ),
    picture,
  );
  const sound = join(work, 'tone.wav');
  writeFileSync(sound, wav(1));
  const file = join(work, 'markers.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, {
      open: [[picture], [sound]],
      save: [file],
      message: [1, 1, 1, 1],
    });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Otherwise one seen slide completes the course before the hotspot is pressed.
    await ribbon(page, 'Design');
    await page.getByRole('button', { name: 'Tracking', exact: true }).click();
    await page
      .getByTestId('tracking-dialog')
      .getByLabel('Only when a trigger completes it')
      .check();
    await page.getByTestId('tracking-dialog').getByRole('button', { name: 'Apply' }).click();

    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Hotspot', exact: true }).click();
    const stageHotspot = page.locator('[data-testid="stage-canvas"] [data-object-type="hotspot"]');
    await expect(stageHotspot).toContainText('Hotspot');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.getByLabel('Hotspot shape').selectOption('ellipse');

    // Its trigger completes the course, so the published course shows it fired.
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Action', { exact: true }).selectOption('completeCourse');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Complete the course when the learner clicks Hotspot',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();
    await expect(page.getByTestId('trigger-item')).toHaveCount(1);

    // Media is imported before the marker, so it can be picked in Format.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Import Media…', exact: true }).click();
    await page.getByRole('button', { name: 'Import Media…', exact: true }).click();
    await page.getByRole('tab', { name: 'Media', exact: true }).click();
    await expect(page.getByTestId('assets')).toContainText('picture.png');
    await expect(page.getByTestId('assets')).toContainText('tone');
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Marker', exact: true }).click();
    await expect(
      page.locator('[data-testid="stage-canvas"] [data-object-type="marker"]'),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await page.getByLabel('Marker icon').selectOption('star');
    await page.getByLabel('Marker title').fill('Notice');
    await page.getByLabel('Marker title').press('Enter');
    await page.getByLabel('Marker text').fill('Line one\nLine two');
    await page.getByLabel('Marker text').press('Tab');
    await chooseAsset(page, 'Marker media', 'picture.png');
    await chooseAsset(page, 'Marker sound', 'tone');
    await page.getByLabel('Marker opens on').selectOption('click');
    await page.getByLabel('Pulse marker').check();
    await expect(page.getByLabel('Marker title')).toHaveValue('Notice');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  // Reopened in a fresh app: every property survived the saved file.
  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1, 1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    await selectRow(page, 'Hotspot');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Hotspot shape')).toHaveValue('ellipse');
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('triggers-panel')).toContainText(
      'Complete the course when the learner clicks Hotspot',
    );

    await selectRow(page, 'Marker');
    await page.getByRole('tab', { name: 'Format', exact: true }).click();
    await expect(page.getByLabel('Marker icon')).toHaveValue('star');
    await expect(page.getByLabel('Marker title')).toHaveValue('Notice');
    await expect(page.getByLabel('Marker text')).toHaveValue('Line one\nLine two');
    await expect(page.getByLabel('Marker media').locator('option:checked')).toHaveText(
      'picture.png',
    );
    await expect(page.getByLabel('Marker sound').locator('option:checked')).toContainText('tone');
    await expect(page.getByLabel('Marker opens on')).toHaveValue('click');
    await expect(page.getByLabel('Pulse marker')).toBeChecked();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  // In the published course, the hotspot's trigger fires and the marker opens.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const stage = page.locator('.vo-player-stage');
    const complete = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              VEDRAOPUS_PLAYER: { engine: { getTracking(): { complete: boolean } } };
            }
          ).VEDRAOPUS_PLAYER.engine.getTracking().complete,
      );
    expect(await complete()).toBe(false);
    // Pressing is what a keyboard learner does; the browser specs cover clicks.
    await stage.locator('[data-object-type="hotspot"]').press('Enter');
    await expect.poll(complete).toBe(true);

    await stage.locator('[data-object-type="marker"]').press('Enter');
    const label = page.getByRole('region', { name: 'Notice' });
    await expect(label).toContainText('Line one');
    await expect(label).toContainText('Line two');
    await expect(label.locator('img')).toHaveAttribute('src', /assets/);
    await expect(label.locator('audio')).toHaveAttribute('src', /assets/);
  } finally {
    await browser.close();
  }
});
