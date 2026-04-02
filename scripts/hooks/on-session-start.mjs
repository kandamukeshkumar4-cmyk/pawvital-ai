#!/usr/bin/env node
/**
 * SessionStart hook — refreshes the shared PawVital memory packet.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const memoryScript = path.join(repoRoot, "scripts", "update-pawvital-memory.mjs");

const result = spawnSync("node", [memoryScript, "refresh"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 15000,
});

if (result.status !== 0) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: "Shared memory refresh failed at session start.",
      suppressOutput: false,
    }),
  );
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        "Shared memory refreshed. Read 16 Current Context Packet and the relevant ticket brief before starting meaningful work.",
    },
    suppressOutput: true,
  }),
);
