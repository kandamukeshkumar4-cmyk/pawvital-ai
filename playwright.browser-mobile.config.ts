import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = __dirname;
const artifactRoot = path.resolve(
  process.env.PAWVITAL_SMOKE_ARTIFACT_DIR ??
    path.join(repoRoot, ".tmp", "browser-mobile-smoke")
);
const baseURL = process.env.PAWVITAL_SMOKE_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: path.join(repoRoot, "smoke", "browser-mobile"),
  testMatch: "*.smoke.pw.ts",
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["dot"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.join(artifactRoot, "playwright-report"),
      },
    ],
  ],
  outputDir: path.join(artifactRoot, "test-results"),
  use: {
    actionTimeout: 15_000,
    baseURL,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1080 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
  webServer: process.env.PAWVITAL_SMOKE_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        cwd: repoRoot,
        reuseExistingServer: true,
        timeout: 120_000,
        url: baseURL,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});
