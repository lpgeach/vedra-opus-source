import { defineConfig } from '@playwright/test';

/**
 * Screenshots for the help pages and the downloads page (docs/briefs/B26-help-wiki.md),
 * taken from the built app as the end-to-end tests launch it: `npm run help:shots`.
 */
export default defineConfig({
  testDir: 'help',
  testMatch: 'shots.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
