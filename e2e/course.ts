import type { Page } from '@playwright/test';

/**
 * Click a published course's Submit, then the Continue of the feedback layer
 * it shows, if it shows one (docs/briefs/P7.5-feedback.md). An unanswered
 * Submit shows none, and the course stays where it is.
 */
export async function submitAnswer(page: Page): Promise<void> {
  await page.getByText('Submit', { exact: true }).click();
  const go = page.getByText('Continue', { exact: true }).filter({ visible: true });
  const shown = await go.waitFor({ state: 'visible', timeout: 2000 }).then(
    () => true,
    () => false,
  );
  if (shown) await go.click();
}
