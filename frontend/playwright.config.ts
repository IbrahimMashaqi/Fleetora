import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./features/auth",
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "action",
      testMatch: ["signup.action.spec.ts", "verification.action.spec.ts"],
    },
    {
      name: "browser",
      testMatch: ["signup.browser.spec.ts", "verification.browser.spec.ts"],
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
    env: { FLEETORA_API_URL: "http://127.0.0.1:3101" },
  },
});
