import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LEADORBIT_BASE_URL ?? "http://127.0.0.1:43127";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Set PLAYWRIGHT_CHANNEL=chrome when Playwright browser CDN is blocked.
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
  /* Dev server is expected to already be running in cloud agents.
     CI starts it via webServer when CI=true. */
  webServer: process.env.CI
    ? {
        command:
          "AUTH_MODE=local LEADORBIT_SQLITE_PATH=./.data/e2e.sqlite pnpm --filter @leadorbit/web dev",
        url: `${baseURL}/api/v1/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
