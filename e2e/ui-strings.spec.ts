import { expect, test } from '@playwright/test';
import { answerDialogs, launchApp } from './launch';

/**
 * The editor's string catalogue (docs/briefs/P10.4-ui-strings.md): started in
 * the pseudo-locale, the menu, Welcome screen, top bar, ribbon tabs and right
 * panel show pseudo words, so words not yet in the catalogue stand out; and the
 * editor still works.
 */

test('in the pseudo-locale the catalogue’s words show as pseudo words, and the editor still works', async () => {
  test.setTimeout(90_000);
  const { app, page } = await launchApp({ env: { VEDRAOPUS_UI_LOCALE: 'qps-ploc' } });
  try {
    await answerDialogs(app, { message: [1] });
    // The application menu, from main.
    const menu = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.items.map((item) => item.label),
    );
    expect(menu).toContain('⟦&Fïlé ·⟧');
    expect(menu).toContain('⟦&Édït ·⟧');

    // The Welcome screen.
    const create = page.getByRole('button', { name: /^⟦Néw Pröjéct/ });
    await expect(create).toBeVisible();
    await expect(page.getByTestId('app-info')).toContainText('⟦Vérsïön');

    // A project opens: the top bar, the ribbon's tabs and the right panel's.
    await create.click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: /^⟦Püblïsh/ })).toBeVisible();
    const ribbonTabs = page.getByTestId('ribbon').getByRole('tab');
    await expect(ribbonTabs.first()).toHaveText(/^⟦Hömé/);
    await ribbonTabs.nth(1).click();
    await expect(page.getByRole('button', { name: /^⟦Téxt Böx/ })).toBeVisible();
    await page.getByRole('button', { name: /^⟦Téxt Böx/ }).click();
    await expect(page.getByTestId('project-status')).toContainText('1 object selected');
    await expect(
      page.getByRole('tablist', { name: /^⟦Rïght pänél/ }).getByRole('tab', { name: /^⟦Chéck/ }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('in English the words are as they were', async () => {
  const { app, page } = await launchApp();
  try {
    const menu = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.items.map((item) => item.label),
    );
    expect(menu).toContain('&File');
    await expect(page.getByRole('button', { name: 'New Project', exact: true })).toBeVisible();
    await expect(page.getByTestId('app-info')).toContainText('Version ');
  } finally {
    await app.close();
  }
});
