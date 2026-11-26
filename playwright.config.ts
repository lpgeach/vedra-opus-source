import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Every temporary folder the run makes goes in one, removed at the end.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // Each test launches its own Electron instance; keep them serial for now.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
});
