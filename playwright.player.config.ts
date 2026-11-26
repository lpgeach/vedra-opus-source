import { defineConfig, devices } from '@playwright/test';

/**
 * Plays the built player bundle in a plain HTML page in Chromium, Firefox and
 * WebKit. Run with `npm run test:player` (it builds the bundle first).
 */
export default defineConfig({
  testDir: 'packages/player/browser',
  // Every temporary folder the run makes goes in one, removed at the end.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['github']] : 'list',
  outputDir: 'test-results/player',
  use: { viewport: { width: 960, height: 640 } },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 960, height: 640 },
        // Sound may start without a click; the blocked case is tested on purpose (audio.spec.ts).
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 960, height: 640 },
        launchOptions: { firefoxUserPrefs: { 'media.autoplay.default': 0 } },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 960, height: 640 } },
    },
  ],
});
