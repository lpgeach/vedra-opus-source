import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTestStory } from '../apps/desktop/src/main/import/storyline/test-story';
import { answerDialogs, launchApp } from './launch';

/**
 * Importing an Articulate Storyline course (docs/briefs/B5-storyline-import.md): a
 * course made by our own test code becomes a new, unsaved project, with the import
 * report; it plays in Preview.
 */

const DONT_SAVE = 1;

const chooseMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click();
  }, id);

test('a .story course imports from the Welcome screen, with its report, and plays', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-storyline-'));
  const course = join(work, 'Safety basics.story');
  await writeTestStory(course);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[course]], message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'Import Storyline Course…', exact: true }).click();
    const report = page.getByTestId('import-report');
    await expect(report).toBeVisible({ timeout: 60_000 });
    await expect(report.getByRole('heading')).toHaveText('Storyline import');
    // Since B5 part B its slider, table and motion paths come across too: nothing is left out.
    await expect(report.getByRole('status')).toHaveText('Everything in the course came across.');
    await expect(report.getByTestId('import-report-item')).toHaveCount(0);
    await report.getByRole('button', { name: 'Close', exact: true }).click();

    // A new, unsaved project named after the file, with the course's slides.
    await expect(page.getByTestId('project-title')).toHaveValue('Safety basics');
    await expect(page.getByTestId('project-status')).toContainText('Unsaved');
    const slides = page.getByTestId('slide-list').locator('.slide-item');
    await expect(slides).toHaveCount(2);
    await expect(slides.first()).toContainText('Welcome');
    await expect(page.getByTestId('stage-canvas')).toContainText('Welcome aboard');

    // It plays: the title, the button, and the master's own text.
    const [preview] = await Promise.all([
      app.waitForEvent('window'),
      page
        .getByTestId('ribbon-tab-row')
        .getByRole('button', { name: 'Preview', exact: true })
        .click(),
    ]);
    const stage = preview.locator('.vo-player-stage');
    await expect(stage).toContainText('Welcome aboard');
    await expect(stage).toContainText('Continue', { timeout: 10_000 });
    await expect(stage).toContainText('Our logo');
    // Clicking the picture shows the layer; clicking its text hides it again.
    await stage.locator('[data-object-type="image"]').first().click();
    await expect(stage).toContainText('A little more detail.');
    // A hidden layer stays in the page, hidden: so look for the text being hidden, not gone.
    await stage.getByText('A little more detail.').click();
    await expect(stage.getByText('A little more detail.')).toBeHidden();

    // Continue goes on to slide 2 (B5 part B): its table and slider are there, and the rocket,
    // placed at (100, 400), rises along its line to (100, 100) as the timeline starts.
    await stage.getByText('Continue').click();
    await expect(stage.locator('[data-object-type="table"]')).toContainText('Tea');
    await expect(stage.locator('[data-object-type="slider"]')).toBeVisible();
    const stageBox = (await stage.boundingBox())!;
    const scale = stageBox.width / 960;
    const shapes = stage.locator('[data-object-type="shape"]');
    const rocketAt = async (y: number) => {
      for (const shape of await shapes.all()) {
        const box = await shape.boundingBox();
        if (
          box &&
          Math.abs(box.x - (stageBox.x + 100 * scale)) < 3 &&
          Math.abs(box.y - (stageBox.y + y * scale)) < 3
        )
          return true;
      }
      return false;
    };
    await expect.poll(() => rocketAt(100), { timeout: 10_000 }).toBe(true);
    expect(await rocketAt(400)).toBe(false);
    await preview.close();
  } finally {
    await app.close();
  }
});

test('File → Import Articulate Storyline Course… says so when a file is not a course', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-storyline-bad-'));
  const notCourse = join(work, 'notes.story');
  writeFileSync(notCourse, 'not a course');
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[notCourse]] });
    // The Welcome screen is up, so the page is listening for the menu's commands.
    await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeVisible();
    await chooseMenuItem(app, 'file.importStoryline');
    await expect(page.getByTestId('error')).toContainText('not an Articulate Storyline course');
  } finally {
    await app.close();
  }
});

interface CoverSighting {
  text: string;
  fillsWindow: boolean;
  hasFocus: boolean;
  overNewProject: boolean;
}

test('while a course imports, a cover over the whole window shows its progress, and the menu waits (B7)', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-storyline-cover-'));
  const course = join(work, 'Safety basics.story');
  await writeTestStory(course);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { open: [[course]], message: [DONT_SAVE] });
    // As the file is chosen, a menu command arrives, as if the author used the menu: while
    // the import runs it is ignored, so the notices never open.
    await app.evaluate(({ dialog, BrowserWindow }) => {
      const choose = dialog.showOpenDialog;
      dialog.showOpenDialog = ((...args: Parameters<typeof choose>) => {
        BrowserWindow.getAllWindows()[0]!.webContents.send(
          'event:menuCommand',
          'thirdPartyNotices',
        );
        return choose(...args);
      }) as typeof choose;
    });
    // This test's course is tiny: on a fast machine it imported in about 0.1 s, before the
    // window drew a frame, so the cover never showed (CI's Apple Silicon Mac, 2026-11-27).
    // A real course takes seconds. So hold the main process for a moment after the first
    // progress message has gone, as a real import would, and the cover gets drawn.
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      const send = contents.send.bind(contents);
      let held = false;
      contents.send = (channel: string, ...args: unknown[]) => {
        send(channel, ...args);
        if (channel !== 'event:importProgress' || held) return;
        held = true;
        const until = Date.now() + 500;
        while (Date.now() < until) {
          // Busy: the import itself is held, the window is not.
        }
      };
    });
    // The cover comes and goes within the import: note it the moment it appears.
    await page.evaluate(() => {
      const seen: CoverSighting[] = [];
      (window as unknown as { voCover: CoverSighting[] }).voCover = seen;
      new MutationObserver(() => {
        const cover = document.querySelector<HTMLElement>('[data-testid="import-cover"]');
        if (!cover || seen.length > 0) return;
        const box = cover.getBoundingClientRect();
        const button = [...document.querySelectorAll('button')].find(
          (each) => each.textContent === 'New Project',
        );
        const at = button?.getBoundingClientRect();
        const top = at
          ? document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2)
          : null;
        seen.push({
          text: cover.textContent ?? '',
          fillsWindow:
            box.left <= 0 && box.top <= 0 && box.right >= innerWidth && box.bottom >= innerHeight,
          hasFocus: cover.contains(document.activeElement),
          overNewProject: !!top && cover.contains(top),
        });
      }).observe(document.body, { childList: true, subtree: true });
    });

    await page.getByRole('button', { name: 'Import Storyline Course…', exact: true }).click();
    await expect(page.getByTestId('import-report')).toBeVisible({ timeout: 60_000 });

    const seen = await page.evaluate(
      () => (window as unknown as { voCover: CoverSighting[] }).voCover,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]!.text).toContain('Importing a Storyline course');
    expect(seen[0]!.text).toContain('Safety basics.story');
    expect(seen[0]!.text).toContain('Reading the course…');
    expect(seen[0]).toMatchObject({ fillsWindow: true, hasFocus: true, overNewProject: true });
    // It has gone, and the menu command sent meanwhile did nothing.
    await expect(page.getByTestId('import-cover')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Third-Party Notices' })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('a second import asked for while one runs is refused (B7)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'vo-e2e-storyline-twice-'));
  const course = join(work, 'Safety basics.story');
  await writeTestStory(course);
  const { app, page } = await launchApp();
  try {
    // One file to choose: a second dialog would be an error. Closing then asks about the
    // imported, unsaved project: Don't Save.
    await answerDialogs(app, { open: [[course]], message: [DONT_SAVE] });
    const statuses = await page.evaluate(async () => {
      const project = (
        window as unknown as {
          vedraopus: { project: { importStoryline(): Promise<{ result: { status: string } }> } };
        }
      ).vedraopus.project;
      const both = await Promise.all([project.importStoryline(), project.importStoryline()]);
      return both.map((each) => each.result.status);
    });
    expect(statuses).toEqual(['opened', 'cancelled']);
  } finally {
    await app.close();
  }
});
