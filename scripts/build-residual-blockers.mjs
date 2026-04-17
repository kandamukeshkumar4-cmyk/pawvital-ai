#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildResidualBlockerLedger,
  loadSuiteCases,
  readJson,
  renderResidualBlockerMarkdown,
  writeJson,
  writeText,
} = require("./lib/residual-blockers.js");

const ROOT = process.cwd();

function parseArgs(argv) {
  const options = {
    scorecardPath: path.join(
      "data",
      "benchmarks",
      "dog-triage",
      "live-scorecard.json"
    ),
    suitePath: path.join("data", "benchmarks", "dog-triage", "wave3-freeze"),
    outputJsonPath: path.join(
      "data",
      "benchmarks",
      "dog-triage",
      "residual-blockers.json"
    ),
    outputMarkdownPath: path.join("docs", "wave3-emergency-baseline-debug.md"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--scorecard=")) {
      options.scorecardPath = arg.slice("--scorecard=".length);
      continue;
    }
    if (arg.startsWith("--suite=")) {
      options.suitePath = arg.slice("--suite=".length);
      continue;
    }
    if (arg.startsWith("--output-json=")) {
      options.outputJsonPath = arg.slice("--output-json=".length);
      continue;
    }
    if (arg.startsWith("--output-markdown=")) {
      options.outputMarkdownPath = arg.slice("--output-markdown=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const scorecardPath = path.resolve(ROOT, options.scorecardPath);
  const suitePath = path.resolve(ROOT, options.suitePath);
  const outputJsonPath = path.resolve(ROOT, options.outputJsonPath);
  const outputMarkdownPath = path.resolve(ROOT, options.outputMarkdownPath);
  const scorecard = readJson(scorecardPath);
  const suiteCases = loadSuiteCases(ROOT, suitePath);
  const ledger = buildResidualBlockerLedger({
    scorecard,
    suiteCases,
    scorecardPath: path.relative(ROOT, scorecardPath).split(path.sep).join("/"),
    suitePath: path.relative(ROOT, suitePath).split(path.sep).join("/"),
  });
  const markdown = renderResidualBlockerMarkdown(ledger);

  writeJson(outputJsonPath, ledger);
  writeText(outputMarkdownPath, markdown);

  console.log(`Residual blocker ledger written to ${outputJsonPath}`);
  console.log(`Residual blocker markdown written to ${outputMarkdownPath}`);
}

main();
