import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    browserName: "chromium",
    channel: "msedge",
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_BASE_URL?.startsWith("https://") ?? false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
