import { defineConfig, devices } from '@playwright/test';

/**
 * Published LMS packages played inside in-repo mock LMSs, in Chromium,
 * Firefox and WebKit. Run with `npm run test:lms` (it builds the player first).
 */
export default defineConfig({
  testDir: 'packages/publish/browser',
  // Every temporary folder the run makes goes in one, removed at the end.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['github']] : 'list',
  outputDir: 'test-results/lms',
  use: { viewport: { width: 1100, height: 760 } },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 760 } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1100, height: 760 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1100, height: 760 } },
    },
  ],
});
