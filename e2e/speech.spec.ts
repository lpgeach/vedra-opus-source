import { createEmptyProject, plainRichText } from '@vedraopus/model';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packProject } from './fixture';
import { answerDialogs, launchApp } from './launch';

/** Real speech needs espeak-ng on Linux (docs/briefs/P6.8-text-to-speech.md). */
const hasEspeak = (() => {
  try {
    execFileSync('espeak-ng', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const row = (page: Page, name: string | RegExp) =>
  page.getByTestId('timeline-row').filter({ hasText: name });
const dialog = (page: Page) => page.getByTestId('speech-dialog');

test.describe(() => {
  test.skip(process.platform !== 'linux' || !hasEspeak, 'needs espeak-ng on Linux');

  test('text to speech: a sound from the slide’s notes, changed, kept', async () => {
    test.setTimeout(120_000);
    const work = mkdtempSync(join(tmpdir(), 'vedraopus-e2e-speech-'));
    const project = createEmptyProject('Spoken');
    project.scenes[0]!.slides[0]!.notes = plainRichText('Welcome to the course. It is short.');
    const file = await packProject(work, 'spoken', project);

    const first = await launchApp({ args: [file] });
    try {
      const { app, page } = first;
      await answerDialogs(app, { message: [1, 1] });
      await expect(page.getByTestId('stage-canvas')).toBeVisible();
      await ribbon(page, 'Insert');
      await page.getByRole('button', { name: 'Text to Speech…', exact: true }).click();
      await expect(dialog(page).getByLabel('Voice')).toHaveValue(/^espeak-ng:/);
      await expect(dialog(page)).toContainText('eSpeak NG');
      await dialog(page).getByRole('button', { name: 'Use slide notes' }).click();
      await expect(dialog(page).getByLabel('Speech text')).toHaveValue(
        'Welcome to the course. It is short.',
      );
      await dialog(page).getByRole('button', { name: 'Insert', exact: true }).click();
      await expect(dialog(page)).toHaveCount(0, { timeout: 30_000 });

      // A sound named after what it says, with its waveform, kept as an MP3 named by its first six words.
      const sound = row(page, 'Speech: Welcome to the course. It is');
      await expect(sound.getByTestId('timeline-waveform')).toBeVisible();
      const length = Number(await sound.getByTestId('timeline-bar').getAttribute('data-duration'));
      expect(length).toBeGreaterThan(1);
      await page.getByRole('tab', { name: 'Media', exact: true }).click();
      await expect(page.getByTestId('assets')).toContainText('Welcome to the course It is.mp3');

      // Changed to say much more: a new sound, longer; one undo puts the old one back.
      await page.getByRole('tab', { name: 'Format', exact: true }).click();
      await expect(page.getByTestId('speech-said')).toContainText('Welcome to the course');
      await page.getByRole('button', { name: 'Edit speech…' }).click();
      await expect(dialog(page).getByLabel('Speech text')).toHaveValue(
        'Welcome to the course. It is short.',
      );
      await dialog(page)
        .getByLabel('Speech text')
        .fill(
          'Welcome to the course. It takes about ten minutes, and you can stop and come back at any time you like.',
        );
      await dialog(page).getByLabel('Speed').fill('1.2');
      await dialog(page).getByRole('button', { name: 'Update' }).click();
      await expect(dialog(page)).toHaveCount(0, { timeout: 30_000 });
      const bar = sound.getByTestId('timeline-bar');
      await expect
        .poll(async () => Number(await bar.getAttribute('data-duration')))
        .toBeGreaterThan(length + 2);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(bar).toHaveAttribute('data-duration', String(length));
      await page.getByRole('button', { name: 'Redo' }).click();
      await expect
        .poll(async () => Number(await bar.getAttribute('data-duration')))
        .toBeGreaterThan(length + 2);

      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByTestId('project-status')).toContainText('Saved');
    } finally {
      await first.app.close();
    }

    // Reopened: the sound still says what it was made from, at its speed.
    const second = await launchApp({ args: [file] });
    try {
      const { app, page } = second;
      await answerDialogs(app, { message: [1, 1] });
      await row(page, 'Speech: Welcome').locator('.timeline-name').click();
      await page.getByRole('tab', { name: 'Format', exact: true }).click();
      await page.getByRole('button', { name: 'Edit speech…' }).click();
      await expect(dialog(page).getByLabel('Speech text')).toHaveValue(/ten minutes/);
      await expect(dialog(page).getByLabel('Speed')).toHaveValue('1.2');
      await dialog(page).getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog(page)).toHaveCount(0);
    } finally {
      await second.app.close();
    }
  });
});

test('with no voices installed, Text to Speech says how to get some', async () => {
  const { app, page } = await launchApp({ env: { VEDRAOPUS_SPEECH: 'none' } });
  try {
    await answerDialogs(app, { message: [1] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Text to Speech…', exact: true }).click();
    await expect(page.getByTestId('speech-hint')).toContainText('No voices are installed');
    await expect(dialog(page).getByRole('button', { name: 'Insert', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});
