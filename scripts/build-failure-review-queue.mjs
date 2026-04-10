#!/usr/bin/env node

/**
 * Build Failure Review Queue for VET-923
 *
 * Reads silent trial results, categorizes by failure taxonomy, outputs review-queue.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const TAXONOMY_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "failure-taxonomy.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "review-queue.json");

function main() {
  console.log("Building failure review queue...");

  if (!fs.existsSync(TAXONOMY_FILE)) {
    console.error("Error: failure-taxonomy.json not found");
    process.exit(1);
  }

  const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_FILE, "utf8"));

  // Create empty review queue structure
  const queue = {
    generated_at: new Date().toISOString(),
    total_items: 0,
    failure_types: taxonomy.failure_types.map((ft) => ({
      type: ft.type,
      severity: ft.severity,
      count: 0,
      items: [],
    })),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2), "utf8");
  console.log(`Review queue written to: ${OUTPUT_FILE}`);
  console.log("Queue is empty - will be populated after silent trial runs");
}

main();
