import { chromium, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerDialogs, launchApp } from './launch';

/**
 * The Phase 9 review: a course using the whole phase, built through the UI
 * as an author would. It survives a save and a fresh start, plays in Preview,
 * and plays published.
 *
 * - **Slide 1:** a marker (P9.1); a numeric field (P9.2) and a slider (P9.4), both bound to Level; a checkbox (P9.3); a table whose cell shows %Level% (P9.9); a heart icon (P9.8).
 * - **Slide 2:** a draggable rectangle whose "dropped on" trigger goes on (P9.7); a web page in a new window (P9.6).
 * - **Slide 3:** a scrolling panel (P9.5); a guided 360° image (P9.10); a screen recording, its capture stubbed so nothing real is recorded (P9.11).
 */

const fixtureAssets = join(import.meta.dirname, '../fixtures/projects/two-slides/assets');
const imagePath = join(fixtureAssets, readdirSync(fixtureAssets)[0]!);

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const canvas = (page: Page) => page.getByTestId('stage-canvas');
const ofType = (page: Page, type: string) => canvas(page).locator(`[data-object-type="${type}"]`);
const slides = (page: Page) => page.getByTestId('slide-list').locator('.slide-item');
const format = (page: Page) => page.getByRole('tab', { name: 'Format', exact: true }).click();

async function insert(page: Page, button: string, item?: string) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: button, exact: true }).click();
  if (item) await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function rectangleAt(page: Page, x: number) {
  await ribbon(page, 'Insert');
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  await page
    .getByTestId('shape-gallery')
    .getByRole('button', { name: 'Rectangle', exact: true })
    .click();
  await format(page);
  const field = page.getByTestId('format-panel').getByLabel('X', { exact: true });
  await field.fill(String(x));
  await field.press('Enter');
}

async function newTrigger(page: Page, event: string, action: string, target?: string) {
  await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
  await page.getByRole('button', { name: 'New trigger' }).click();
  const wizard = page.getByTestId('trigger-wizard');
  await wizard.getByLabel('Event', { exact: true }).selectOption(event);
  if (target) {
    await wizard.getByLabel('Event target', { exact: true }).selectOption({ label: target });
  }
  await wizard.getByLabel('Action', { exact: true }).selectOption(action);
  await wizard.getByRole('button', { name: 'Add trigger' }).click();
}

/** Nothing real is recorded: main's sources and the capture itself are stand-ins. */
async function stubScreenCapture(app: ElectronApplication, page: Page) {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('screen:sources');
    ipcMain.handle('screen:sources', () => [
      { id: 'screen:test:0', name: 'Test screen', kind: 'screen', thumbnail: '' },
    ]);
    ipcMain.removeHandler('screen:choose');
    ipcMain.handle('screen:choose', () => true);
  });
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const surface = document.createElement('canvas');
      surface.width = 320;
      surface.height = 180;
      const context = surface.getContext('2d')!;
      let frame = 0;
      window.setInterval(() => {
        frame += 1;
        context.fillStyle = `hsl(${(frame * 9) % 360} 70% 50%)`;
        context.fillRect(0, 0, 320, 180);
      }, 40);
      return surface.captureStream(25);
    };
  });
}

test('a course using all of Phase 9 survives saving, plays in Preview and published', async () => {
  test.setTimeout(240_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-phase9-'));
  const file = join(work, 'phase9.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, { open: [[imagePath]], save: [file], message: [1] });
    await stubScreenCapture(app, page);
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(canvas(page)).toBeVisible();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await page.getByRole('button', { name: 'New Slide' }).click();
    await slides(page).first().click();

    // ---------------------------------------------------------------- slide 1
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Variables', exact: true }).click();
    const variables = page.getByTestId('variables-dialog');
    await variables.getByRole('button', { name: 'Add variable' }).click();
    const row = variables.getByTestId('variable-row').last();
    await row.getByLabel('Variable type').selectOption('number');
    await row.getByLabel('Variable name').fill('Level');
    await row.getByLabel('Variable name').press('Enter');
    await row.getByLabel('Default value').fill('2');
    await row.getByLabel('Default value').press('Enter');
    await variables.getByRole('button', { name: 'Close' }).click();

    await insert(page, 'Marker');
    await format(page);
    await page.getByLabel('Marker title').fill('Notice');
    await page.getByLabel('Marker title').press('Enter');

    await insert(page, 'Data Entry', 'Numeric Entry');
    await format(page);
    await page.getByLabel('Field variable', { exact: true }).selectOption({ label: 'Level' });

    await insert(page, 'Data Entry', 'Slider');
    await format(page);
    await page.getByLabel('Control variable', { exact: true }).selectOption({ label: 'Level' });
    const greatest = page.getByLabel('Control greatest value', { exact: true });
    await greatest.fill('10');
    await greatest.press('Enter');

    await insert(page, 'Data Entry', 'Checkbox');

    await insert(page, 'Table');
    await ofType(page, 'table').locator('[data-cell="1:0"]').dblclick();
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.type('Level %Level%');
    await page.keyboard.press('Escape');
    await expect(ofType(page, 'table').locator('[data-cell="1:0"]')).toContainText('Level');

    await insert(page, 'Icons…');
    const library = page.getByTestId('library-dialog');
    await library.getByLabel('Search the library').fill('heart');
    await library.getByRole('button', { name: 'Heart', exact: true }).click();
    await expect(ofType(page, 'graphic')).toHaveCount(1);

    // ---------------------------------------------------------------- slide 2
    await slides(page).nth(1).click();
    await rectangleAt(page, 100);
    await page.getByTestId('drag-format').getByLabel('Learners can drag it').check();
    await rectangleAt(page, 800);
    await newTrigger(page, 'droppedOn', 'jumpToSlide', 'Rectangle');
    await expect(page.getByTestId('triggers-panel')).toContainText('when the learner drops');
    // The web page goes on top of the target: only the trigger's target catches the drop (Luke, session 76).
    await insert(page, 'Web Object', 'From a Web Address');
    await format(page);
    await page.getByLabel('Web object shown', { exact: true }).selectOption('window');

    // ---------------------------------------------------------------- slide 3
    await slides(page).nth(2).click();
    await insert(page, 'Text Box');
    await insert(page, 'Text Box');
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('edit.selectAll')!.click(),
    );
    await insert(page, 'Scrolling Panel');
    await expect(ofType(page, 'group')).toHaveCount(1);

    await insert(page, '360° Image…');
    await expect(ofType(page, 'panorama')).toHaveCount(1);
    await format(page);
    await page.getByTestId('panorama-format').getByRole('button', { name: 'Add spot' }).click();
    await page.getByLabel('360° image exploring').selectOption('guided');

    await insert(page, 'Screen Recording…');
    const recorder = page.getByTestId('screen-record-dialog');
    await recorder.getByRole('button', { name: 'Test screen' }).click();
    await recorder.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(recorder.getByTestId('screen-record-status')).toHaveText('Recording 0:01', {
      timeout: 10_000,
    });
    await recorder.getByRole('button', { name: 'Stop' }).click();
    await recorder.getByRole('button', { name: 'Insert' }).click();
    await expect(recorder).toHaveCount(0, { timeout: 60_000 });
    await expect(ofType(page, 'video')).toHaveCount(1);

    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1] });
    await slides(page).first().click();
    for (const type of ['marker', 'textEntry', 'slider', 'choice', 'table', 'graphic']) {
      await expect(ofType(page, type), type).toHaveCount(1);
    }
    await expect(ofType(page, 'table').locator('[data-cell="1:0"]')).toContainText('%Level%');
    await slides(page).nth(1).click();
    await expect(ofType(page, 'shape')).toHaveCount(2);
    await expect(ofType(page, 'web')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Triggers', exact: true }).click();
    await expect(page.getByTestId('triggers-panel')).toContainText('when the learner drops');
    await slides(page).nth(2).click();
    for (const type of ['group', 'panorama', 'video']) {
      await expect(ofType(page, type), type).toHaveCount(1);
    }

    // Preview, from the start: the table shows the variable, the slider is there.
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'Entire Project', exact: true }).click(),
    ]);
    const previewStage = preview.locator('.vo-player-stage');
    await expect(previewStage.getByRole('table')).toContainText('Level 2');
    await expect(previewStage.getByRole('slider', { name: 'Slider', exact: true })).toBeVisible();
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    // Nothing leaves the machine.
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    const stage = page.locator('.vo-player-stage');
    const position = page.locator('.vo-player-position');

    // Slide 1: the slider writes Level; the field and the table follow it.
    await expect(stage.getByRole('table')).toContainText('Level 2');
    const slider = stage.getByRole('slider', { name: 'Slider', exact: true });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(stage.getByRole('table')).toContainText('Level 10');
    await expect(stage.locator('[data-object-type="textEntry"] input')).toHaveValue('10');
    const checkbox = stage.getByRole('checkbox', { name: 'Checkbox' });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expect(stage.getByRole('img', { name: 'Heart icon' })).toBeVisible();
    await stage.locator('[data-object-type="marker"]').press('Enter');
    await expect(stage).toContainText('Notice');
    await page.keyboard.press('Escape');
    await page.locator('.vo-player-next').click();
    await expect(position).toHaveText('Slide 2 of 3');

    // Slide 2: the web page opens in a new window from its button; drag onto the target.
    await expect(stage.locator('.vo-web-open')).toBeVisible();
    const dragged = stage.locator('[data-draggable="true"]');
    const target = stage.locator('[data-object-type="shape"]:not([data-draggable="true"])');
    const from = (await dragged.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(position).toHaveText('Slide 3 of 3');

    // Slide 3: the scrolling panel, the guided 360° image, and the recording.
    await expect(stage.getByRole('region', { name: 'Scrolling Panel' })).toBeVisible();
    await expect(stage.locator('.vo-panorama')).toHaveAttribute('data-painter', 'flat');
    await stage.getByRole('button', { name: 'Next spot' }).click();
    await expect(stage.getByRole('dialog', { name: 'Spot 1' })).toBeVisible();
    const video = stage.locator('video').first();
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.duration), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0.5);
  } finally {
    await browser.close();
  }
});
