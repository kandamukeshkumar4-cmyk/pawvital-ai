#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const BENCHMARK_DIR = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage");
const FREEZE_MANIFEST = path.join(BENCHMARK_DIR, "wave3-freeze-manifest.json");
const LEGACY_ENRICHED_FILE = path.join(BENCHMARK_DIR, "gold-v1-enriched.jsonl");
const REPORT_FILE = path.join(BENCHMARK_DIR, "benchmark-lint-report.md");

const VALID_FAMILIES = new Set([
  "difficulty_breathing",
  "swollen_abdomen",
  "seizure_collapse",
  "coughing_breathing_combined",
  "heat_intolerance",
  "vision_loss",
  "pregnancy_birth",
  "coughing",
  "vomiting",
  "diarrhea",
  "not_eating",
  "lethargy",
  "limping",
  "excessive_scratching",
  "drinking_more",
  "trembling",
  "eye_discharge",
  "ear_scratching",
  "weight_loss",
  "wound_skin_issue",
  "behavior_change",
  "swelling_lump",
  "dental_problem",
  "hair_loss",
  "regurgitation",
  "constipation",
  "generalized_stiffness",
  "nasal_discharge",
  "vaginal_discharge",
  "testicular_prostate",
  "exercise_induced_lameness",
  "skin_odor_greasy",
  "recurrent_ear",
  "recurrent_skin",
  "inappropriate_urination",
  "fecal_incontinence",
  "vomiting_diarrhea_combined",
  "oral_mass",
  "hearing_loss",
  "aggression",
  "pacing_restlessness",
  "abnormal_gait",
  "postoperative_concern",
  "medication_reaction",
  "post_vaccination_reaction",
  "puppy_concern",
  "senior_decline",
  "multi_system_decline",
  "trauma",
  "unknown_concern",
  "blood_in_stool",
  "urination_problem",
]);

function levenshteinSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const costs = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter[i - 1] !== longer[j - 1]) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }

  return (longer.length - costs[longer.length]) / longer.length;
}

function loadFreezeCases() {
  const manifest = JSON.parse(fs.readFileSync(FREEZE_MANIFEST, "utf8"));
  const caseMap = new Map();

  for (const shard of manifest.strata || []) {
    const suitePath = path.join(BENCHMARK_DIR, "wave3-freeze", shard.fileName);
    const suite = JSON.parse(fs.readFileSync(suitePath, "utf8"));
    for (const caseRecord of suite.cases || []) {
      if (!caseMap.has(caseRecord.id)) {
        caseMap.set(caseRecord.id, caseRecord);
      }
    }
  }

  return Array.from(caseMap.values());
}

function loadLegacyCases() {
  const lines = fs.readFileSync(LEGACY_ENRICHED_FILE, "utf8").trim().split("\n");
  return lines.map((line) => JSON.parse(line));
}

function loadCases() {
  if (fs.existsSync(FREEZE_MANIFEST)) {
    return {
      source: "wave3-freeze",
      cases: loadFreezeCases(),
    };
  }

  if (!fs.existsSync(LEGACY_ENRICHED_FILE)) {
    throw new Error("No benchmark source found for linting.");
  }

  return {
    source: "gold-v1-enriched",
    cases: loadLegacyCases(),
  };
}

function main() {
  console.log("Running benchmark lint...\n");

  const { source, cases } = loadCases();
  const errors = [];
  const warnings = [];

  console.log(`Using source: ${source}`);

  console.log("\n1. Checking for duplicates...");
  const duplicates = [];
  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const sim1 = levenshteinSimilarity(
        String(cases[i].description || "").toLowerCase(),
        String(cases[j].description || "").toLowerCase()
      );
      if (sim1 > 0.8) {
        duplicates.push({ case1: cases[i].id, case2: cases[j].id, similarity: sim1 });
      }
    }
  }

  if (duplicates.length > 0) {
    errors.push(`Found ${duplicates.length} duplicate pairs (similarity > 0.8)`);
    duplicates.slice(0, 5).forEach(({ case1, case2, similarity }) => {
      console.log(`  DUPLICATE: ${case1} <-> ${case2} (${(similarity * 100).toFixed(1)}%)`);
    });
  } else {
    console.log("  OK: No duplicates found");
  }

  console.log("\n2. Validating complaint family tags...");
  const invalidTags = [];
  for (const caseData of cases) {
    for (const tag of caseData.complaint_family_tags || []) {
      if (!VALID_FAMILIES.has(tag)) {
        invalidTags.push({ caseId: caseData.id, tag });
      }
    }
  }

  if (invalidTags.length > 0) {
    errors.push(`Found ${invalidTags.length} invalid complaint family tags`);
    invalidTags.slice(0, 5).forEach(({ caseId, tag }) => {
      console.log(`  INVALID TAG: ${caseId} has '${tag}'`);
    });
  } else {
    console.log("  OK: All tags valid");
  }

  console.log("\n3. Checking coverage gaps...");
  const familyCounts = {};
  for (const caseData of cases) {
    for (const family of caseData.complaint_family_tags || []) {
      familyCounts[family] = (familyCounts[family] || 0) + 1;
    }
  }

  const minPerFamily = 8;
  const underRepresented = [];
  for (const family of VALID_FAMILIES) {
    const count = familyCounts[family] || 0;
    if (count < minPerFamily && count > 0) {
      underRepresented.push({ family, count });
    }
  }

  if (underRepresented.length > 0) {
    warnings.push(`${underRepresented.length} families below minimum (${minPerFamily}) cases`);
    underRepresented.slice(0, 5).forEach(({ family, count }) => {
      console.log(`  GAP: ${family} has ${count}/${minPerFamily} cases`);
    });
  } else {
    console.log("  OK: All families meet minimum coverage");
  }

  console.log("\n=== Lint Summary ===");
  console.log(`Total cases: ${cases.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  let report = "# Benchmark Lint Report\n\n";
  report += `**Date**: ${new Date().toISOString()}\n`;
  report += `**Source**: ${source}\n`;
  report += `**Total Cases**: ${cases.length}\n\n`;
  report += "## Results\n\n";
  report += `- Errors: ${errors.length}\n`;
  report += `- Warnings: ${warnings.length}\n\n`;

  if (errors.length > 0) {
    report += "### Errors\n\n";
    for (const error of errors) {
      report += `- ${error}\n`;
    }
    report += "\n";
  }

  if (warnings.length > 0) {
    report += "### Warnings\n\n";
    for (const warning of warnings) {
      report += `- ${warning}\n`;
    }
  }

  fs.writeFileSync(REPORT_FILE, report, "utf8");
  console.log(`\nReport written to: ${REPORT_FILE}`);

  process.exit(errors.length > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
