#!/usr/bin/env node
/**
 * Stop hook — fires when Claude stops.
 * Auto-refreshes Obsidian memory so vault notes stay current.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const memoryScript = path.join(repoRoot, "scripts", "update-pawvital-memory.mjs");

const result = spawnSync("node", [memoryScript, "refresh"], {
  cwd: path.resolve(repoRoot, ".."),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 10000,
});

const output = { suppressOutput: true };

if (result.status !== 0) {
  output.systemMessage = "Memory refresh failed — vault may be stale.";
  output.suppressOutput = false;
}

process.stdout.write(JSON.stringify(output));
