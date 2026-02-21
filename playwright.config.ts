import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'packages/vscode-extension/e2e',
  timeout: 60000,
  retries: 1,
  fullyParallel: true,
  workers: 10,
  reporter: 'line',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 500,
      animations: 'disabled',
    },
  },
  use: {
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 5000,
  },
  projects: [
    {
      name: 'vscode-extension',
      testMatch: /.*\.(e2e\.)?test\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
          ],
        },
      },
    },
  ],
});
