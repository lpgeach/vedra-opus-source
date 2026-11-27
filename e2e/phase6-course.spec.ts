import { chromium, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeWebm, wav } from '../fixtures/make-media';
import { answerDialogs, launchApp, previewFrom } from './launch';
import { chooseEffect, effectButton } from './animation';

/**
 * The Phase 6 review (session 44): a course using the phase's features
 * together, built through the UI only, saved, reopened in a fresh app, then
 * played in preview and as a published course. Sound with captions, a button
 * that fades in and moves along a path, a zoom region and a cue point dropped
 * while the sound plays, text-to-speech where the system has voices; then a
 * second slide pushed in, with a video and a layer (holding a text box) that fades in.
 */

const hasSpeech = (() => {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('espeak-ng', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const VTT = `WEBVTT

00:00.000 --> 00:01.500
Welcome to the course

00:01.500 --> 00:03.000
Here is the first part
`;

/** Choose an item of the app's own menu, by its id. */
const menu = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click();
  }, id);
const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const bottom = (page: Page, name: string) =>
  page.getByTestId('panel-bottom').getByRole('tab', { name, exact: true }).click();
const right = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string) =>
  page.getByTestId('timeline-row').filter({ hasText: name });
const selectRow = (page: Page, name: string) => row(page, name).locator('.timeline-name').click();
const slideItem = (page: Page, n: number) =>
  page
    .getByTestId('slide-list')
    .getByRole('button')
    .nth(n - 1);

/** Play the course in a page, preview or published: what Phase 6 added, as the learner meets it. */
async function play(page: Page) {
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 1 of 2');
  // Captions, on request, in time with the sound.
  const cc = page.getByRole('button', { name: 'Captions' });
  await cc.click();
  await expect(page.getByTestId('player-captions')).toHaveText(
    /Welcome to the course|Here is the first part/,
  );
  // The zoom region zooms the view in.
  const slide = page.locator('.vo-player-slide:not(.vo-player-leaving)');
  await expect
    .poll(() => slide.evaluate((each: HTMLElement) => Number(each.style.scale || 1)))
    .toBeGreaterThan(1.2);
  // The button moves along its path.
  const button = page.locator('[data-object-type="button"]').first();
  await expect
    .poll(
      () => button.evaluate((each: HTMLElement) => Number.parseFloat(each.style.translate || '0')),
      {
        timeout: 5000,
      },
    )
    .toBeGreaterThan(50);

  // On to slide 2, pushed in: both slides drawn for a moment.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.vo-player-position')).toHaveText('Slide 2 of 2');
  await expect(page.locator('.vo-player-leaving')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('video[data-media-id]')).toHaveCount(1);
  // The layer fades in when the button is clicked.
  await page.locator('.vo-player-slide [data-object-type="button"]').click();
  const layer = page.locator('.vo-player-slide:not(.vo-player-leaving) > .vo-player-layer').nth(1);
  await expect(layer).toBeVisible();
  await expect(layer.locator('[data-object-type="text"]')).toBeVisible();
}

test('a course using all of Phase 6 survives saving and plays in preview and published', async () => {
  test.setTimeout(240_000);
  const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-phase6-'));
  const sound = join(work, 'tone.wav');
  writeFileSync(sound, wav(3));
  const captions = join(work, 'tone.vtt');
  writeFileSync(captions, VTT);
  const film = join(work, 'film.webm');
  writeFileSync(film, await makeWebm(3));
  const file = join(work, 'phase6.vedraopus');
  const out = join(work, 'out');
  mkdirSync(out);

  const first = await launchApp();
  try {
    const { app, page } = first;
    await answerDialogs(app, {
      open: [[sound], [captions], [film]],
      save: [file],
      message: [1, 1],
    });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Slide 1: a sound with imported captions.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Audio…', exact: true }).click();
    await expect(row(page, 'tone')).toBeVisible();
    await bottom(page, 'Captions');
    await page.getByRole('button', { name: 'Import captions…' }).click();
    await expect(page.getByTestId('caption-row')).toHaveCount(2);

    // A button that fades in and moves along a line.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await ribbon(page, 'Animations');
    await chooseEffect(page, 'Entrance', 'Fade');
    await page.getByRole('button', { name: 'Add line path' }).click();
    await expect(page.getByTestId('motion-path')).toHaveCount(1);

    // A zoom region, and a cue point dropped while the sound plays.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Zoom Region', exact: true }).click();
    await bottom(page, 'Timeline');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('audio[data-timeline-sound]')).toHaveCount(1);
    await page.waitForTimeout(500);
    await page.keyboard.press('c');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByTestId('timeline-cue')).toHaveCount(1);

    // Spoken narration, where the system has voices.
    if (hasSpeech) {
      await ribbon(page, 'Insert');
      await page.getByRole('button', { name: 'Text to Speech…', exact: true }).click();
      await page.getByLabel('Speech text').fill('Hello there.');
      await page.getByTestId('speech-dialog').getByRole('button', { name: 'Insert' }).click();
      await expect(row(page, 'Speech: Hello there.')).toBeVisible({ timeout: 30_000 });
    }

    // Slide 2: pushed in, with a video and a layer that fades in.
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'New Slide' }).click();
    await ribbon(page, 'Transitions');
    await page
      .getByRole('radiogroup', { name: 'Slide transition', exact: true })
      .getByRole('radio', { name: 'Push', exact: true })
      .click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Video…', exact: true }).click();
    await expect(row(page, 'film')).toBeVisible();
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await right(page, 'Slide Layers');
    await page.getByRole('button', { name: 'New layer' }).click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Text Box', exact: true }).click();
    await ribbon(page, 'Transitions');
    await page
      .getByRole('radiogroup', { name: 'Layer transition', exact: true })
      .getByRole('radio', { name: 'Fade', exact: true })
      .click();
    await page
      .getByTestId('layer-row')
      .filter({ hasText: 'Base Layer' })
      .locator('.layer-name')
      .click();
    await selectRow(page, 'Button');
    await right(page, 'Triggers');
    await page.getByRole('button', { name: 'New trigger' }).click();
    const wizard = page.getByTestId('trigger-wizard');
    await wizard.getByLabel('Action', { exact: true }).selectOption('showLayer');
    await expect(page.getByTestId('trigger-sentence')).toHaveText(
      'Show layer Layer 1 when the learner clicks Button',
    );
    await wizard.getByRole('button', { name: 'Add trigger' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('project-status')).toContainText('Saved');
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ args: [file] });
  try {
    const { app, page } = second;
    await answerDialogs(app, { open: [[out]], message: [1, 1] });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Everything survived: slide 1's captions, animation, zoom region, cue point (and speech)…
    await selectRow(page, 'tone');
    await bottom(page, 'Captions');
    await expect(page.getByTestId('caption-row')).toHaveCount(2);
    await bottom(page, 'Timeline');
    await expect(page.getByTestId('timeline-cue')).toHaveCount(1);
    await expect(row(page, 'Zoom Region')).toBeVisible();
    if (hasSpeech) await expect(row(page, 'Speech: Hello there.')).toBeVisible();
    await selectRow(page, 'Button');
    await ribbon(page, 'Animations');
    await expect(effectButton(page, 'Entrance')).toHaveAttribute('data-kind', 'fade');
    await expect(page.getByLabel('Motion path', { exact: true }).locator('option')).toHaveText([
      'Line',
    ]);
    // …and slide 2's transition and layer transition.
    await slideItem(page, 2).click();
    await ribbon(page, 'Transitions');
    await expect(
      page
        .getByRole('radiogroup', { name: 'Slide transition', exact: true })
        .getByRole('radio', { name: 'Push', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await right(page, 'Slide Layers');
    await page
      .getByTestId('layer-row')
      .filter({ hasText: 'Layer 1' })
      .locator('.layer-name')
      .click();
    await expect(
      page
        .getByRole('radiogroup', { name: 'Layer transition', exact: true })
        .getByRole('radio', { name: 'Fade', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page
      .getByTestId('layer-row')
      .filter({ hasText: 'Base Layer' })
      .locator('.layer-name')
      .click();

    // Preview, from the start.
    await slideItem(page, 1).click();
    await ribbon(page, 'Home');
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      previewFrom(page, 'Entire Project'),
    ]);
    await play(preview);
    await preview.close();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByTestId('publish-dialog');
    await dialog.getByRole('button', { name: 'Choose folder…' }).click();
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-result')).toBeVisible();
  } finally {
    await second.app.close();
  }

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(pathToFileURL(join(out, 'untitled-project', 'index.html')).href);
    await play(page);
  } finally {
    await browser.close();
  }
});

test('Master View keeps what does not play there off its layers, and dialogs close with Escape', async () => {
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [1, 1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();

    // Every dialog takes the focus as it opens, so Escape closes it.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Record Audio…', exact: true }).click();
    await expect(page.getByTestId('record-dialog')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('record-dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Variables', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-dialog')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('publish-dialog')).toHaveCount(0);

    // An animated button copied from a slide comes into a master without its animation.
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await ribbon(page, 'Animations');
    await chooseEffect(page, 'Entrance', 'Fade');
    await menu(app, 'edit.copy');
    await expect
      .poll(() => page.evaluate(() => window.vedraopus.clipboard.read()))
      .toContain('"vedraopus":1');
    await page.getByRole('button', { name: 'Master View', exact: true }).click();
    await page.getByRole('button', { name: 'Add master', exact: true }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await menu(app, 'edit.paste');
    await expect(page.getByTestId('error')).toContainText(
      'Animations, zoom regions, hotspots and markers play only on slides',
    );
    await ribbon(page, 'Animations');
    await expect(page.getByTestId('animations-hint')).toContainText('not on masters');
    // And no zoom region goes on a master.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Zoom Region', exact: true }).click();
    await expect(page.getByTestId('error')).toContainText('Zoom regions work on slides');
    await expect(
      page.locator('[data-testid="stage-canvas"] [data-object-type="zoomRegion"]'),
    ).toHaveCount(0);
  } finally {
    await app.close();
  }
});
