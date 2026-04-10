#!/usr/bin/env node

/**
 * Benchmark Quota Tracker for VET-919
 *
 * Reads coverage matrix and current case set, outputs gap analysis
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const MATRIX_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "coverage-matrix.json");
const ENRICHED_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-v1-enriched.jsonl");

function main() {
  if (!fs.existsSync(MATRIX_FILE)) {
    console.error("Error: coverage-matrix.json not found. Run VET-919 implementation first.");
    process.exit(1);
  }

  const matrix = JSON.parse(fs.readFileSync(MATRIX_FILE, "utf8"));

  let currentCases = [];
  if (fs.existsSync(ENRICHED_FILE)) {
    const lines = fs.readFileSync(ENRICHED_FILE, "utf8").trim().split("\n");
    currentCases = lines.map((line) => JSON.parse(line));
  }

  console.log("Benchmark Coverage Gap Analysis\n");
  console.log(`Current cases: ${currentCases.length}`);
  console.log(`Target cases: ${matrix.target_total_cases}\n`);

  // Family gap analysis
  console.log("=== Complaint Family Coverage ===");
  const familyCounts = {};
  currentCases.forEach((c) => {
    c.complaint_family_tags.forEach((f) => {
      familyCounts[f] = (familyCounts[f] || 0) + 1;
    });
  });

  const minPerFamily = matrix.dimensions.complaint_family.min_per_family;
  const underRepresented = [];

  for (const [family, target] of Object.entries(matrix.dimensions.complaint_family.targets)) {
    const current = familyCounts[family] || 0;
    const gap = Math.max(0, minPerFamily - current);
    if (gap > 0) {
      underRepresented.push({ family, current, target, gap });
    }
    const status = current >= minPerFamily ? "OK" : "GAP";
    console.log(`  ${status} ${family}: ${current}/${minPerFamily} min`);
  }

  console.log(`\nFamilies below minimum: ${underRepresented.length}`);
  underRepresented.forEach(({ family, gap }) => {
    console.log(`  - ${family}: needs ${gap} more cases`);
  });

  // Danger tier gap analysis
  console.log("\n=== Danger Tier Coverage ===");
  const tierCounts = {};
  currentCases.forEach((c) => {
    tierCounts[c.risk_tier] = (tierCounts[c.risk_tier] || 0) + 1;
  });

  for (const [tier, targetPct] of Object.entries(matrix.dimensions.danger_tier.targets)) {
    const current = tierCounts[tier] || 0;
    const currentPct = currentCases.length > 0 ? ((current / currentCases.length) * 100).toFixed(1) : 0;
    const targetCount = Math.round((targetPct / 100) * matrix.target_total_cases);
    const gap = Math.max(0, targetCount - current);
    const status = current >= targetCount * 0.8 ? "OK" : "GAP";
    console.log(`  ${status} ${tier}: ${current} (${currentPct}%) vs target ${targetCount} (${targetPct}%)`);
    if (gap > 0) console.log(`    Gap: ${gap} cases needed`);
  }

  console.log("\n=== Summary ===");
  console.log(`Total cases needed to reach target: ${Math.max(0, matrix.target_total_cases - currentCases.length)}`);
  console.log(`Families under-represented: ${underRepresented.length}`);
}

main();
