import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadWave3CanonicalSuite,
  type Wave3CanonicalCase,
} from "../src/lib/wave3-suite-manifest.ts";

interface ReviewerSlot {
  role: string;
  reviewer_id: string;
  status: string;
}

type Wave3BenchmarkCase = Wave3CanonicalCase & {
  description?: string;
  request?: {
    pet?: {
      species?: string;
    };
    messages?: Array<{ role?: string; content?: string }>;
  };
  expectations?: Record<string, unknown>;
  complaint_family_tags?: string[];
  risk_tier?: string;
  uncertainty_pattern?: string;
  wave3_strata?: string[];
  wave3_adjudication?: {
    reviewer_slots?: ReviewerSlot[];
    must_ask_expectations?: {
      status?: string;
    };
  };
};

const ROOT = process.cwd();
const BENCHMARK_DIR = path.join(ROOT, "data", "benchmarks", "dog-triage");
const MANIFEST_PATH = path.join(BENCHMARK_DIR, "wave3-freeze-manifest.json");

function validateCase(caseRecord: Wave3BenchmarkCase): string[] {
  const errors: string[] = [];

  if (!caseRecord.id?.trim()) errors.push("Missing id");
  if (!caseRecord.description?.trim()) errors.push("Missing description");
  if (caseRecord.request?.pet?.species !== "dog") {
    errors.push("request.pet.species must be dog");
  }

  const ownerMessages = (caseRecord.request?.messages ?? []).filter(
    (message) => message.role === "user" && typeof message.content === "string"
  );
  if (ownerMessages.length === 0) {
    errors.push("Missing owner message content");
  }

  if (!caseRecord.expectations || typeof caseRecord.expectations !== "object") {
    errors.push("Missing expectations");
  }
  if (!Array.isArray(caseRecord.complaint_family_tags) || caseRecord.complaint_family_tags.length === 0) {
    errors.push("Missing complaint_family_tags");
  }
  if (!caseRecord.risk_tier) errors.push("Missing risk_tier");
  if (!caseRecord.uncertainty_pattern) errors.push("Missing uncertainty_pattern");
  if (!Array.isArray(caseRecord.wave3_strata) || caseRecord.wave3_strata.length === 0) {
    errors.push("Missing wave3_strata");
  }

  const adjudication = caseRecord.wave3_adjudication;
  if (!adjudication) {
    errors.push("Missing wave3_adjudication");
  } else {
    if (!Array.isArray(adjudication.reviewer_slots) || adjudication.reviewer_slots.length === 0) {
      errors.push("Missing adjudication reviewer_slots");
    }
    if (!adjudication.must_ask_expectations?.status) {
      errors.push("Missing must_ask_expectations.status");
    }
  }

  return errors;
}

function loadCases(): Wave3BenchmarkCase[] {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Wave 3 manifest not found: ${MANIFEST_PATH}`);
  }

  return loadWave3CanonicalSuite(MANIFEST_PATH).cases;
}

const cases = loadCases();
console.log(`Validating ${cases.length} Wave 3 benchmark cases...`);

let totalErrors = 0;
const allErrors: Array<{ case_id: string; errors: string[] }> = [];

for (const caseRecord of cases) {
  const errors = validateCase(caseRecord);
  if (errors.length > 0) {
    totalErrors += errors.length;
    allErrors.push({ case_id: caseRecord.id, errors });
  }
}

console.log(`\n${"=".repeat(60)}`);
if (totalErrors === 0) {
  console.log("VALIDATION PASSED - All Wave 3 freeze cases are schema-compliant");
} else {
  console.log(`VALIDATION FAILED - ${totalErrors} errors across ${allErrors.length} cases`);
  for (const { case_id, errors } of allErrors.slice(0, 10)) {
    console.log(`\n${case_id}:`);
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
  }
  if (allErrors.length > 10) {
    console.log(`\n... and ${allErrors.length - 10} more cases with errors`);
  }
}

const complaintFamilies = new Set(
  cases.flatMap((caseRecord) => caseRecord.complaint_family_tags ?? [])
);
console.log(`\nComplaint families covered: ${complaintFamilies.size}/52`);
console.log(
  `Contradictory cases: ${
    cases.filter((caseRecord) => caseRecord.uncertainty_pattern === "contradictory").length
  }`
);
console.log(
  `Low-information cases: ${
    cases.filter((caseRecord) => caseRecord.wave3_strata?.includes("low-information")).length
  }`
);
console.log(
  `Rare-but-critical cases: ${
    cases.filter((caseRecord) => caseRecord.wave3_strata?.includes("rare-but-critical")).length
  }`
);

process.exit(totalErrors === 0 ? 0 : 1);
