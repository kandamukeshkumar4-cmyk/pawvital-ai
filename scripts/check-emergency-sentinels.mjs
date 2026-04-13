#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(
  ROOT,
  "data",
  "benchmarks",
  "dog-triage",
  "gold-v1-enriched.jsonl"
);
const EXPECTED_SENTINEL_COUNT = 16;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(INPUT)) {
  fail(`Missing curated benchmark file: ${INPUT}`);
}

const raw = fs.readFileSync(INPUT, "utf8").trim();
if (!raw) {
  fail("Curated benchmark file is empty.");
}

const cases = raw.split(/\r?\n/).map((line) => JSON.parse(line));
const sentinels = cases.filter((entry) => entry.must_not_miss_marker === true);

const failures = [];

if (sentinels.length !== EXPECTED_SENTINEL_COUNT) {
  failures.push(
    `Expected ${EXPECTED_SENTINEL_COUNT} emergency sentinels, found ${sentinels.length}.`
  );
}

for (const entry of sentinels) {
  if (entry.request?.pet?.species !== "dog") {
    failures.push(`${entry.id}: sentinel case is not dog-only.`);
  }

  if (entry.risk_tier !== "tier_1_emergency") {
    failures.push(
      `${entry.id}: sentinel case must stay in tier_1_emergency.`
    );
  }

  if (
    entry.expectations?.responseType !== "emergency" &&
    entry.expectations?.responseType !== "question"
  ) {
    failures.push(
      `${entry.id}: sentinel expectation must stay in the emergency/question safety path.`
    );
  }
}

const byFamily = sentinels.reduce((acc, entry) => {
  const families = Array.isArray(entry.complaint_family_tags)
    ? entry.complaint_family_tags
    : ["unknown"];
  for (const family of families) {
    acc[family] = (acc[family] || 0) + 1;
  }
  return acc;
}, {});

console.log("Emergency sentinel advisory");
console.log(`Source: ${path.relative(ROOT, INPUT)}`);
console.log(`Sentinel cases: ${sentinels.length}`);
console.log("Families:");
for (const family of Object.keys(byFamily).sort()) {
  console.log(`  - ${family}: ${byFamily[family]}`);
}

if (failures.length > 0) {
  console.error("\nSentinel dataset problems:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("\nSentinel case ids:");
for (const entry of sentinels) {
  console.log(`  - ${entry.id}`);
}

console.log("\nCurated emergency sentinel set is present and internally consistent.");
