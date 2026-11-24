import { defineConfig } from "@playwright/test";

// Test-only values. Set here so the web server and the test workers share them.
process.env.FLEETORA_CLIENT_SOURCE_SECRET ??= "playwright-only-client-source-secret-0123456789";
process.env.FLEETORA_TRUSTED_CLIENT_IP_HEADER ??= "x-playwright-client-ip";

export default defineConfig({
  tsconfig: "./tests/tsconfig.server.json",
  testDir: "./features",
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "action",
      testMatch: "**/*.action.spec.ts",
    },
    {
      name: "browser",
      testMatch: "**/*.browser.spec.ts",
      use: {
        baseURL: "http://localhost:3100",
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/signup",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      FLEETORA_API_URL: "http://127.0.0.1:3101",
      FLEETORA_CLIENT_SOURCE_SECRET: process.env.FLEETORA_CLIENT_SOURCE_SECRET,
      FLEETORA_TRUSTED_CLIENT_IP_HEADER: process.env.FLEETORA_TRUSTED_CLIENT_IP_HEADER,
    },
  },
});
