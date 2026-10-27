import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests at phone size. Needs the backend on :8000 (see CLAUDE.md "Running").
 * The Vite dev server is started automatically (or reused if already running).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
