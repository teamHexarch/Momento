// The website's smoke test (e2e/): a guest joins an event with its link, uploads a photo, sees it, and reacts.
// Runs the built site (npm run build first) against the real API on a throwaway database (e2e/server.mjs).
//   npm run build && npm run test:e2e        (needs `npm ci` in ../Server and `npx playwright install chromium`)
// PW_CHANNEL=chrome uses the Chrome already on this computer instead of Playwright's own browser.
// PW_DEV=1 runs against `next dev` instead (React's strict mode on; no Content-Security-Policy, so skip csp.spec):
//   PW_DEV=1 npx playwright test smoke paging i18n guest-join
import { defineConfig, devices } from '@playwright/test';
const dev = !!process.env.PW_DEV;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 90000,
  expect: { timeout: 20000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.run/report' }]] : 'list',
  outputDir: 'e2e/.run/results',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHANNEL && { channel: process.env.PW_CHANNEL }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node e2e/server.mjs', url: 'http://localhost:4000/api/health', timeout: 180000, reuseExistingServer: false, stdout: 'pipe' },
    dev
      ? { command: 'npx next dev -p 3000', url: 'http://localhost:3000/', timeout: 180000, reuseExistingServer: false }
      : { command: 'node scripts/serve-out.mjs', url: 'http://localhost:3000/', env: { PORT: '3000' }, timeout: 30000, reuseExistingServer: false },
  ],
});
