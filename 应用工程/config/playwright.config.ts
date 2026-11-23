import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "../tests/e2e",
  outputDir: "../artifacts/test-results",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  },
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command: "node --import tsx tests/support/e2e-server.ts",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
