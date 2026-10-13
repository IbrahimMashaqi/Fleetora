import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  webServer: undefined,
  outputDir: path.join(os.tmpdir(), `fleetora-actions-${process.pid}-${Date.now()}`),
  projects: base.projects?.filter(project => project.name === "action"),
});
