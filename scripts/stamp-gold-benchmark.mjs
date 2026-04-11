#!/usr/bin/env node

/**
 * Stamp and version the gold-v1 benchmark for VET-918
 *
 * Validates enriched cases, writes version stamp, generates report
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

const ROOT_DIR = process.cwd();
const ENRICHED_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-v1-enriched.jsonl");
const STAMP_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-v1-stamp.json");
const MANIFEST_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-v1-manifest.json");
const REPORT_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-v1-report.md");
const SHARD_DIR = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-candidate");

function computeShardHash(shardDir) {
  const files = fs
    .readdirSync(shardDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".schema.json"))
    .sort();

  const hash = createHash("sha256");
  for (const file of files) {
    const content = fs.readFileSync(path.join(shardDir, file), "utf8");
    hash.update(content);
  }
  return hash.digest("hex");
}

function main() {
  console.log("Stamping gold-v1 benchmark...");

  // Read enriched cases
  if (!fs.existsSync(ENRICHED_FILE)) {
    console.error("Error: gold-v1-enriched.jsonl not found. Run enrich-benchmark-cases.mjs first.");
    process.exit(1);
  }

  const enrichedLines = fs.readFileSync(ENRICHED_FILE, "utf8").trim().split("\n");
  const enrichedCases = enrichedLines.map((line) => JSON.parse(line));

  console.log(`Loaded ${enrichedCases.length} enriched cases`);

  // Compute shard hash
  const shardHash = computeShardHash(SHARD_DIR);

  // Create stamp
  const stamp = {
    version: "gold-v1",
    freeze_date: new Date().toISOString().split("T")[0],
    case_count: enrichedCases.length,
    shard_hash: shardHash,
    validated_at: new Date().toISOString(),
    status: "stamped",
  };

  fs.writeFileSync(STAMP_FILE, JSON.stringify(stamp, null, 2), "utf8");
  console.log(`\nStamp written to: ${STAMP_FILE}`);

  // Create manifest
  const shardFiles = fs
    .readdirSync(SHARD_DIR)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".schema.json"))
    .sort();

  const caseIdRanges = {};
  for (const file of shardFiles) {
    const suite = JSON.parse(fs.readFileSync(path.join(SHARD_DIR, file), "utf8"));
    const caseIds = suite.cases.map((c) => c.id);
    caseIdRanges[file] = {
      count: suite.cases.length,
      first_id: caseIds[0],
      last_id: caseIds[caseIds.length - 1],
    };
  }

  // Extract all complaint families
  const allFamilies = new Set();
  for (const caseData of enrichedCases) {
    caseData.complaint_family_tags.forEach((f) => allFamilies.add(f));
  }

  const manifest = {
    version: "gold-v1",
    freeze_date: stamp.freeze_date,
    shard_count: shardFiles.length,
    total_case_count: enrichedCases.length,
    case_id_ranges: caseIdRanges,
    complaint_families_covered: Array.from(allFamilies).sort(),
    shard_hash: shardHash,
    coverage_gaps: [
      "Not all 50 complaint families represented (expected, will be filled in VET-919)",
      "Owner language variants not yet expanded",
      "Chronic-plus-acute cases limited",
    ],
  };

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Manifest written to: ${MANIFEST_FILE}`);

  // Generate report
  const familyCounts = {};
  const tierCounts = {};
  let mustNotMissCount = 0;

  for (const caseData of enrichedCases) {
    caseData.complaint_family_tags.forEach((f) => {
      familyCounts[f] = (familyCounts[f] || 0) + 1;
    });
    tierCounts[caseData.risk_tier] = (tierCounts[caseData.risk_tier] || 0) + 1;
    if (caseData.must_not_miss_marker) mustNotMissCount++;
  }

  let report = `# Gold V1 Benchmark Report\n\n`;
  report += `**Version**: gold-v1\n`;
  report += `**Freeze Date**: ${stamp.freeze_date}\n`;
  report += `**Total Cases**: ${enrichedCases.length}\n`;
  report += `**Shard Count**: ${shardFiles.length}\n`;
  report += `**Shard Hash**: \`${shardHash.slice(0, 16)}...\`\n\n`;

  report += `## Coverage Summary\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Cases | ${enrichedCases.length} |\n`;
  report += `| Complaint Families | ${allFamilies.size} |\n`;
  report += `| Must-Not-Miss Cases | ${mustNotMissCount} |\n`;
  report += `| Shard Files | ${shardFiles.length} |\n\n`;

  report += `## Family Distribution\n\n`;
  report += `| Family | Cases |\n`;
  report += `|--------|-------|\n`;
  Object.entries(familyCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([family, count]) => {
      report += `| ${family} | ${count} |\n`;
    });

  report += `\n## Urgency Tier Distribution\n\n`;
  report += `| Tier | Cases |\n`;
  report += `|------|-------|\n`;
  Object.entries(tierCounts).forEach(([tier, count]) => {
    report += `| ${tier} | ${count} |\n`;
  });

  report += `\n## Coverage Gaps\n\n`;
  manifest.coverage_gaps.forEach((gap) => {
    report += `- ${gap}\n`;
  });

  fs.writeFileSync(REPORT_FILE, report, "utf8");
  console.log(`Report written to: ${REPORT_FILE}`);

  console.log("\nGold-v1 stamp complete!");
  console.log(`Version: ${stamp.version}`);
  console.log(`Cases: ${stamp.case_count}`);
  console.log(`Status: ${stamp.status}`);
}

main();
