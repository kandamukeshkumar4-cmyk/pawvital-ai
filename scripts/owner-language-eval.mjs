#!/usr/bin/env node
/**
 * VET-1574 owner-language eval scaffold — checks phrase fixture integrity.
 * Full route replay expands in a follow-on ticket; this gate prevents fixture drift.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(
  root,
  "data/benchmarks/owner-language/sample-phrases.json"
);

const phrases = JSON.parse(readFileSync(fixturePath, "utf8"));

if (!Array.isArray(phrases) || phrases.length < 3) {
  console.error("Owner-language fixture must contain at least 3 phrases.");
  process.exit(1);
}

let invalid = 0;
for (const row of phrases) {
  if (
    typeof row.id !== "string" ||
    typeof row.ownerText !== "string" ||
    !Array.isArray(row.expectedSymptomHints)
  ) {
    invalid += 1;
  }
}

if (invalid > 0) {
  console.error(`Owner-language fixture has ${invalid} invalid row(s).`);
  process.exit(1);
}

console.log(
  `Owner-language eval scaffold OK (${phrases.length} phrases in ${fixturePath}).`
);
