#!/usr/bin/env node
/**
 * Promotion gate for CLINICAL_PLANNER_MODE=live — runs shadow planner scenario eval.
 */
import { spawnSync } from "node:child_process";

const jest = spawnSync(
  "npx",
  [
    "jest",
    "--runTestsByPath",
    "tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
    "--verbose",
  ],
  { stdio: "inherit", shell: true }
);

if (jest.status !== 0) {
  console.error(
    "Shadow planner gate failed — do not set CLINICAL_PLANNER_MODE=live until scenarios pass."
  );
  process.exit(1);
}

console.log("Shadow planner gate passed.");
