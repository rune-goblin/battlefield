import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.TEST_FOUNDRY_PORT ?? 30005);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  // Joins a world as GM and ensures this module is enabled (one-time, persisted) before any
  // spec runs. Fails loud if it can't.
  globalSetup: './src/tests/e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    // Foundry refuses to init below 1366×768 (logs an error that can halt module load).
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Two services. A headless test Foundry on :30005 serves the built `dist-foundry` through the
  // `modules/battlefield` link `scripts/setup-test-env.ts` makes; `npm run test:e2e` rebuilds
  // `dist-foundry` first. Vite on :5199 serves the browser app to `browser.spec.ts`.
  webServer: [
    {
      command: 'bash scripts/start-test-env.sh',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        TEST_WORLD: process.env.TEST_WORLD ?? 'stolen-lands',
        TEST_FOUNDRY_PORT: String(PORT),
      },
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort',
      url: 'http://127.0.0.1:5199/play.html',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
