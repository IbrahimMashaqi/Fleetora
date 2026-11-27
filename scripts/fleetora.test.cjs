const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

for (const { mode, origin, environment, expectedOrigin } of [
  ...["", "-Neon", "-Neon -Rebuild"].map((mode) => ({
    mode,
    origin: "http://localhost:3000",
    environment: "development",
    expectedOrigin: "http://127.0.0.1:3000",
  })),
  {
    mode: "-Neon",
    origin: "http://[::1]:3000",
    environment: "development",
    expectedOrigin: "http://127.0.0.1:3000",
  },
  {
    mode: "-Neon",
    origin: "https://app.example.test",
    environment: "production",
    expectedOrigin: "https://app.example.test",
  },
  {
    mode: "-Neon",
    origin: "http://localhost:4100",
    environment: "development",
    expectedOrigin: "http://localhost:4100",
  },
]) {
  test(
    "launcher uses the verified endpoint: " + (mode || "local") + " " + origin,
    () => {
      const script = [
        "$env:FRONTEND_URL = '" + origin + "'",
        'function global:docker { $global:LASTEXITCODE = 0; if ($args -contains "config") { \'' +
          JSON.stringify({
            services: {
              backend: {
                environment: {
                  DATABASE_URL: "test-only",
                  FRONTEND_URL: origin,
                  NODE_ENV: environment,
                },
              },
              frontend: { environment: {} },
            },
          }) +
          "' }; if ($args -contains 'up') { Write-Host ('ACTIVATION_ORIGIN=' + $env:FRONTEND_URL) } }",
        'function global:Invoke-WebRequest { param($Uri, $TimeoutSec, [switch] $UseBasicParsing) Write-Host ("PROBED=" + $Uri); return @{ StatusCode = 200 } }',
        'function global:Start-Process { param($FilePath) Write-Host ("OPENED=" + $FilePath) }',
        "function global:Test-Path { param($LiteralPath, $PathType) return $true }",
        "& '" +
          path.join(__dirname, "fleetora.ps1") +
          "' -Action start " +
          mode,
      ].join("\n");
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 15000 },
      );
      assert.equal(result.status, 0, result.stderr);
      const probe = /PROBED=(\S+)/.exec(result.stdout)?.[1];
      const opened = /OPENED=(\S+)/.exec(result.stdout)?.[1];
      assert.ok(probe, "readiness endpoint was probed");
      assert.equal(
        opened,
        probe,
        "browser must reach the verified Docker endpoint even with an IPv6 dev server",
      );
      assert.equal(new URL(opened).hostname, "127.0.0.1");
      assert.equal(
        /ACTIVATION_ORIGIN=(\S+)/.exec(result.stdout)?.[1],
        expectedOrigin,
      );
    },
  );
}
