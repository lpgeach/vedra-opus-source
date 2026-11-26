import { defineConfig, devices } from '@playwright/test';

/**
 * Visual tests for @vedraopus/render: every case is drawn in Chromium, Firefox
 * and WebKit and each is compared with the SAME reference image, which is what
 * shows objects look the same in every engine. Run with `npm run test:visual`.
 *
 * Reference images live in packages/render/visual/__snapshots__ and are made
 * with Chromium (`npm run test:visual:update`). The tolerance below allows for
 * engines smoothing edges slightly differently, and nothing more.
 */
export default defineConfig({
  testDir: 'packages/render/visual',
  // No browser or platform in the path: one reference per case, shared by all.
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/render',
  expect: {
    toHaveScreenshot: {
      // Per pixel: how different a colour may be before the pixel counts as changed.
      threshold: 0.2,
      // Overall: the share of pixels allowed to count as changed.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  use: { viewport: { width: 320, height: 240 }, deviceScaleFactor: 1, colorScheme: 'light' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 240 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 320, height: 240 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 320, height: 240 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
