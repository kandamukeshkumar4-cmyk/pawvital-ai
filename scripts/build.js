/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Build wrapper that sets NODE_OPTIONS so all Next.js workers
 * inherit the readlink EISDIR→EINVAL patch (Node v24 + Windows).
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Use relative path to avoid Windows spaces-in-path issue with NODE_OPTIONS
const existing = process.env.NODE_OPTIONS || "";
process.env.NODE_OPTIONS = `--require=./scripts/fix-readlink.js ${existing}`.trim();

try {
  const nextBin = require.resolve("next/dist/bin/next");
  const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    stdio: "inherit",
    env: process.env,
    cwd: path.resolve(__dirname, ".."),
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
} catch (err) {
  process.exit(err.status || 1);
}
