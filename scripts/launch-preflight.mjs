#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildLaunchPreflight, formatPreflight } = require("./launch-preflight-core.cjs");

const json = process.argv.includes("--json");
const result = buildLaunchPreflight(process.env, { repoRoot: process.cwd() });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatPreflight(result));
}

process.exit(result.ok ? 0 : 1);
