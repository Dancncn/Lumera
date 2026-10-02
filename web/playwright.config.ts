import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 20_000,
  outputDir: './.cache/playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:5391',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --config test/vite.config.ts --host 127.0.0.1 --port 5391 --strictPort',
    url: 'http://127.0.0.1:5391',
    reuseExistingServer: false,
  },
});
