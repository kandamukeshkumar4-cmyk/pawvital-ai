#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const DEFAULT_INPUT = path.join(
  ROOT_DIR,
  "data",
  "benchmarks",
  "dog-triage",
  "gold-v1-enriched.jsonl"
);

// Keep this aligned with the curated family universe used by benchmark linting.
const VALID_FAMILIES = [
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
  "puppy_concern",
  "senior_decline",
  "multi_system_decline",
  "unknown_concern",
  "blood_in_stool",
  "urination_problem",
];

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    lowDepthThreshold: 5,
  };

  for (const arg of argv) {
    if (arg.startsWith("--input=")) {
      args.input = path.resolve(ROOT_DIR, arg.split("=")[1]);
    } else if (arg.startsWith("--low-depth-threshold=")) {
      const threshold = Number(arg.split("=")[1]);
      if (!Number.isInteger(threshold) || threshold < 1) {
        throw new Error("low-depth-threshold must be a positive integer");
      }
      args.lowDepthThreshold = threshold;
    }
  }

  return args;
}

function readCases(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Benchmark file not found: ${inputPath}`);
  }

  const lines = fs
    .readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
    }
  });
}

function percentage(count, total) {
  if (total === 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(2));
}

function buildCoverageReport(cases, inputPath, lowDepthThreshold) {
  const familyCounts = Object.fromEntries(
    VALID_FAMILIES.map((family) => [family, 0])
  );

  let emergencyCount = 0;
  let sameDayCount = 0;
  let unknownConcernCount = 0;

  for (const caseData of cases) {
    if (caseData.risk_tier === "tier_1_emergency") {
      emergencyCount += 1;
    }
    if (caseData.risk_tier === "tier_2_same_day") {
      sameDayCount += 1;
    }

    const families = Array.isArray(caseData.complaint_family_tags)
      ? caseData.complaint_family_tags
      : [];

    if (families.includes("unknown_concern")) {
      unknownConcernCount += 1;
    }

    for (const family of families) {
      if (!(family in familyCounts)) {
        familyCounts[family] = 0;
      }
      familyCounts[family] += 1;
    }
  }

  const coveredFamilies = Object.entries(familyCounts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  const lowDepthFamilies = coveredFamilies
    .filter(([, count]) => count < lowDepthThreshold)
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return left[1] - right[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([family, caseCount]) => ({ family, case_count: caseCount }));

  const uncoveredFamilies = VALID_FAMILIES.filter(
    (family) => (familyCounts[family] ?? 0) === 0
  );

  const complaintFamilyCounts = Object.fromEntries(
    Object.entries(familyCounts).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );

  return {
    generated_at: new Date().toISOString(),
    source_file: path.relative(ROOT_DIR, inputPath).replace(/\\/g, "/"),
    total_curated_case_count: cases.length,
    emergency_count: emergencyCount,
    same_day_count: sameDayCount,
    unknown_concern_case_count: unknownConcernCount,
    unknown_concern_percentage: percentage(unknownConcernCount, cases.length),
    complaint_family_coverage: {
      known_family_count: VALID_FAMILIES.length,
      covered_family_count: coveredFamilies.length,
      uncovered_families: uncoveredFamilies,
      family_case_counts: complaintFamilyCounts,
    },
    low_depth_families: {
      threshold: lowDepthThreshold,
      family_count: lowDepthFamilies.length,
      families: lowDepthFamilies,
    },
  };
}

function main() {
  const { input, lowDepthThreshold } = parseArgs(process.argv.slice(2));
  const cases = readCases(input);
  const report = buildCoverageReport(cases, input, lowDepthThreshold);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
