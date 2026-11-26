const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

for (const mode of ["", "-Neon", "-Neon -Rebuild"]) {
  test(
    "launcher opens the verified IPv4 endpoint: " + (mode || "local"),
    () => {
      const script = [
        'function global:docker { $global:LASTEXITCODE = 0; if ($args -contains "config") { \'' +
          JSON.stringify({
            services: {
              backend: { environment: { DATABASE_URL: "test-only" } },
              frontend: { environment: {} },
            },
          }) +
          "' } }",
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
    },
  );
}
