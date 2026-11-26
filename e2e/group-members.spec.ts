import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * A group's members with their own timing and animations, in the editor
 * (docs/briefs/B8-group-member-animations.md): the timeline shows a selected group's members
 * with their own bars, and the Animations tab edits the member chosen as the part.
 */

const DONT_SAVE = 1;
const ribbon = (page: Page, name: string) =>
  page.getByTestId('ribbon').getByRole('tab', { name, exact: true }).click();
const members = (page: Page) => page.getByTestId('timeline-member-row');

test('a group’s members have their own bars on the timeline, and their own animations', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await answerDialogs(app, { message: [DONT_SAVE] });
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // Two buttons, grouped.
    await ribbon(page, 'Insert');
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await page.getByRole('button', { name: 'Button', exact: true }).click();
    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()!.getMenuItemById('edit.selectAll')!.click();
    });
    await expect(page.getByTestId('project-status')).toContainText('2 objects selected');
    await ribbon(page, 'Home');
    await page.getByRole('button', { name: 'Group', exact: true }).click();

    // The group's members, each with a bar of its own, under the group's row.
    await expect(members(page)).toHaveCount(2);
    const first = members(page).first();
    const bar = first.getByTestId('timeline-bar');
    await expect(bar).toHaveAttribute('data-start', '0');
    // Its start handle dragged 1 s on (80 px a second at the timeline's starting zoom).
    const start = (await first.getByTestId('timeline-bar-start').boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 40, start.y + start.height / 2);
    await page.mouse.move(start.x + start.width / 2 + 80, start.y + start.height / 2);
    await page.mouse.up();
    await expect(bar).toHaveAttribute('data-start', '1');
    // The group stays selected: its members stay in view.
    await expect(members(page)).toHaveCount(2);

    // Clicking the member's bar chooses it as the part to animate.
    await bar.click();
    await expect(first).toHaveAttribute('aria-current', 'true');
    await ribbon(page, 'Animations');
    const memberId = await first.getAttribute('data-object-id');
    await expect(page.getByLabel('Part to animate')).toHaveValue(memberId!);
    await page.getByLabel('Entrance effect').selectOption('fade');
    await expect(first.getByTestId('timeline-entrance')).toHaveCount(1);
    // The group itself has none.
    const groupRow = page.getByTestId('timeline-row').filter({ hasText: 'Group' });
    await expect(groupRow.getByTestId('timeline-entrance')).toHaveCount(0);
    await page.getByLabel('Part to animate').selectOption({ index: 0 });
    await expect(page.getByLabel('Entrance effect')).toHaveValue('');

    // Undo takes the member's entrance away, and its timing back.
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.click();
    await expect(first.getByTestId('timeline-entrance')).toHaveCount(0);
    await undo.click();
    await expect(bar).toHaveAttribute('data-start', '0');
  } finally {
    await app.close();
  }
});
