// Offline Compose validation only; never starts containers or reads the real .env.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const root = path.resolve(__dirname, "..");
let directory, local, neon;
before(() => {
  directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fleetora-mailpit-compose-"),
  );
  for (const name of ["docker-compose.yml", "docker-compose.neon.yml"])
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  fs.mkdirSync(path.join(directory, "backend"));
  fs.writeFileSync(
    path.join(directory, "backend", ".env"),
    "DATABASE_URL=postgresql://fixture:fixture@database.example.invalid/fleetora\nMAIL_HOST=smtp.example.invalid\n",
  );
  fs.writeFileSync(path.join(directory, "fixture.env"), "");
  const env = {
    ...process.env,
    POSTGRES_PASSWORD: "compose-fixture-only",
    ACCESS_TOKEN_SECRET: "compose-access-fixture",
    REFRESH_TOKEN_SECRET: "compose-refresh-fixture",
    FLEETORA_CLIENT_SOURCE_SECRET: "compose-source-fixture",
    DB_PORT: "15433",
    BACKEND_NODE_ENV: "development",
    MAIL_HOST: "",
    MAIL_PORT: "",
    MAIL_USER: "",
    MAIL_PASSWORD: "",
    COMPOSE_PROFILES: "",
    COMPOSE_ENV_FILES: "",
  };
  const read = (files) => {
    try {
      return JSON.parse(
        cp.execFileSync(
          "docker",
          [
            "compose",
            "--env-file",
            "fixture.env",
            ...files,
            "config",
            "--format",
            "json",
          ],
          {
            cwd: directory,
            env,
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      );
    } catch {
      throw new Error(
        "Compose fixture could not be resolved; configuration withheld.",
      );
    }
  };
  local = read(["-f", "docker-compose.yml"]);
  neon = read(["-f", "docker-compose.yml", "-f", "docker-compose.neon.yml"]);
});
after(() => {
  // Delete only the test-owned directory whose absolute parent/prefix were verified.
  if (
    directory &&
    path.dirname(directory) === os.tmpdir() &&
    path.basename(directory).startsWith("fleetora-mailpit-compose-")
  )
    fs.rmSync(directory, { recursive: true, force: true });
});
test("local SMTP capture is internal; only its inbox is published on IPv4 loopback", () => {
  assert.ok(
    local.services.mailpit,
    "Mailpit must be available in the default local stack",
  );
  assert.equal(local.services.mailpit.ports.length, 1);
  assert.equal(local.services.mailpit.ports[0].host_ip, "127.0.0.1");
  assert.equal(String(local.services.mailpit.ports[0].published), "8025");
  assert.equal(local.services.mailpit.ports[0].target, 8025);
  assert.equal(local.services.mailpit.environment.MP_QUIET, "true");
});
test("local backend opts into Mailpit and waits for readiness; local PG remains on 15433", () => {
  assert.equal(local.services.backend.environment.FLEETORA_MAILPIT, "true");
  assert.equal(
    local.services.backend.depends_on.mailpit.condition,
    "service_healthy",
  );
  assert.equal(String(local.services.db.ports[0].published), "15433");
});
test("Neon keeps its mail configuration and does not start local Mailpit or local PG", () => {
  assert.equal(neon.services.mailpit, undefined);
  assert.equal(neon.services.db, undefined);
  assert.equal(neon.services.backend.environment.FLEETORA_MAILPIT, undefined);
  assert.equal(
    neon.services.backend.environment.MAIL_HOST,
    "smtp.example.invalid",
  );
});
test("the start batch mentions the local inbox without printing any activation links", () => {
  const batch = fs.readFileSync(path.join(root, "start-fleetora.bat"), "utf8");
  assert.ok(batch.includes("http://127.0.0.1:8025"));
  assert.ok(!batch.includes("#token="));
});
