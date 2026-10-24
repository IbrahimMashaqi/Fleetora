const fs = process.getBuiltinModule("node:fs");
const path = process.getBuiltinModule("node:path");
const os = process.getBuiltinModule("node:os");
const cp = process.getBuiltinModule("node:child_process");
const source = path.resolve(__dirname, "..");
const output = fs.mkdtempSync(
  path.join(os.tmpdir(), "fleetora-frontend-build-"),
);
fs.cpSync(source, output, {
  recursive: true,
  filter: (item) =>
    !path
      .relative(source, item)
      .split(path.sep)
      .some(
        (segment) =>
          ["node_modules", ".next", ".git", "playwright-report"].includes(
            segment,
          ) ||
          segment.startsWith("test-results") ||
          segment.startsWith(".env") ||
          segment.endsWith(".tsbuildinfo"),
      ),
});
fs.symlinkSync(
  path.join(source, "node_modules"),
  path.join(output, "node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
// The copy and its dependency junction must share a Turbopack filesystem root.
fs.renameSync(
  path.join(output, "next.config.ts"),
  path.join(output, "next.config.base.ts"),
);
fs.writeFileSync(
  path.join(output, "next.config.ts"),
  `import base from './next.config.base';\nexport default { ...base, turbopack: { ...base.turbopack, root: ${JSON.stringify(path.parse(output).root)} } };\n`,
);
const descriptor = fs.openSync(path.join(output, "final-build.log"), "w");
const child = cp.spawn(
  process.execPath,
  [path.join(output, "node_modules/next/dist/bin/next"), "build"],
  {
    cwd: output,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
    stdio: ["ignore", descriptor, descriptor],
  },
);
console.log(`Owned final build: ${output}`);
child.on("exit", (code) => {
  fs.closeSync(descriptor);
  console.log(fs.readFileSync(path.join(output, "final-build.log"), "utf8"));
  fs.writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify({ exitCode: code, finishedAt: new Date().toISOString() }),
  );
  process.exitCode = code ?? 1;
});
