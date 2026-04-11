#!/usr/bin/env node

/**
 * Generate Failure Dashboard for VET-923
 *
 * Outputs failure-dashboard.md with counts by category, trends, top 10 failures
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const TAXONOMY_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "failure-taxonomy.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "failure-dashboard.md");

function main() {
  console.log("Generating failure dashboard...");

  const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_FILE, "utf8"));

  let dashboard = `# Failure Dashboard\n\n`;
  dashboard += `**Generated**: ${new Date().toISOString()}\n\n`;
  dashboard += `## Summary\n\n`;
  dashboard += `- Total failures: 0 (awaiting silent trial runs)\n`;
  dashboard += `- Failure types tracked: ${taxonomy.failure_types.length}\n\n`;

  dashboard += `## Failure Types\n\n`;
  dashboard += `| Type | Severity | Count | Example |\n`;
  dashboard += `|------|----------|-------|--------|\n`;

  for (const ft of taxonomy.failure_types) {
    dashboard += `| ${ft.type} | ${ft.severity} | 0 | ${ft.example} |\n`;
  }

  dashboard += `\n## Trends\n\n`;
  dashboard += `No trend data available yet. Run silent trial to populate.\n\n`;
  dashboard += `## Top 10 Failures\n\n`;
  dashboard += `No failures recorded yet.\n`;

  fs.writeFileSync(OUTPUT_FILE, dashboard, "utf8");
  console.log(`Dashboard written to: ${OUTPUT_FILE}`);
}

main();
