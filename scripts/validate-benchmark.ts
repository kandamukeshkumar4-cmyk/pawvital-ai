/**
 * Benchmark Schema Validator
 * Validates all cases in gold-benchmark-v1.jsonl against the schema
 */

import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkCase {
  case_id: string;
  version: string;
  created_at: string;
  source: string;
  owner_input: string;
  normalized_complaints: string[];
  pet_profile: {
    species: string;
    breed: string;
    age_years: number;
    sex: string;
    neutered: boolean;
    weight_kg: number | null;
  };
  adjudication: {
    urgency_tier: number;
    urgency_rationale: string;
    must_ask_questions: string[];
    nice_to_ask_questions: string[];
    acceptable_unknowns: string[];
    red_flags_present: string[];
    red_flags_absent: string[];
    likely_differentials: Array<{ disease_key: string; confidence: string; rationale: string }>;
    must_not_miss: string[];
    disposition: string;
    disposition_rationale: string;
    should_abstain: boolean;
    abstention_reason: string | null;
    is_out_of_distribution: boolean;
    ood_reason: string | null;
    has_contradictions: boolean;
    contradiction_details: string | null;
  };
  category: {
    complaint_families: string[];
    urgency_tier: number;
    difficulty: string;
    case_type: string;
  };
  expected_behavior: {
    min_questions_before_disposition: number;
    max_questions_before_disposition: number;
    must_detect_red_flags: string[];
    must_not_output_disposition_before_questions: string[];
    emergency_recall_required: boolean;
    unsafe_downgrade_is_failure: boolean;
  };
  reviewers: Array<{ reviewer_id: string; review_date: string; agreement: string; notes: string }>;
  adjudication_status: string;
}

const VALID_SOURCES = ["synthetic", "clinical", "literature", "owner_report"];
const VALID_DISPOSITIONS = ["emergency_vet_now", "same_day_vet", "vet_within_48h", "monitor_and_reassess", "cannot_safely_assess"];
const VALID_TIERS = [1, 2, 3, 4];
const VALID_DIFFICULTIES = ["easy", "moderate", "hard", "expert"];
const VALID_CASE_TYPES = ["common", "dangerous", "ambiguous", "contradictory", "low_information", "rare_but_critical"];
const VALID_CONFIDENCES = ["definite", "probable", "possible", "rule_out"];

function validateCase(c: BenchmarkCase, index: number): string[] {
  const errors: string[] = [];

  // Required fields
  if (!c.case_id?.match(/^BENCH-\d{4}$/)) errors.push(`Invalid case_id: ${c.case_id}`);
  if (!c.version) errors.push("Missing version");
  if (!c.created_at) errors.push("Missing created_at");
  if (!VALID_SOURCES.includes(c.source)) errors.push(`Invalid source: ${c.source}`);
  if (!c.owner_input || c.owner_input.length < 10) errors.push(`owner_input too short or missing`);
  if (!Array.isArray(c.normalized_complaints)) errors.push("normalized_complaints not array");

  // Pet profile
  if (c.pet_profile.species !== "dog" && !c.adjudication.is_out_of_distribution) {
    errors.push("species must be dog for in-distribution cases");
  }
  if (!c.pet_profile.breed) errors.push("Missing breed");
  if (typeof c.pet_profile.age_years !== "number" || c.pet_profile.age_years < 0) errors.push("Invalid age_years");
  if (!["male", "female"].includes(c.pet_profile.sex)) errors.push("Invalid sex");
  if (typeof c.pet_profile.neutered !== "boolean") errors.push("neutered must be boolean");

  // Adjudication
  if (!VALID_TIERS.includes(c.adjudication.urgency_tier)) errors.push(`Invalid urgency_tier: ${c.adjudication.urgency_tier}`);
  if (!c.adjudication.urgency_rationale) errors.push("Missing urgency_rationale");
  if (!Array.isArray(c.adjudication.must_ask_questions)) errors.push("must_ask_questions not array");
  if (!Array.isArray(c.adjudication.red_flags_present)) errors.push("red_flags_present not array");
  if (!Array.isArray(c.adjudication.red_flags_absent)) errors.push("red_flags_absent not array");

  // Differentials
  if (!Array.isArray(c.adjudication.likely_differentials)) errors.push("likely_differentials not array");
  for (const diff of c.adjudication.likely_differentials) {
    if (!diff.disease_key) errors.push("Differential missing disease_key");
    if (!VALID_CONFIDENCES.includes(diff.confidence)) errors.push(`Invalid confidence: ${diff.confidence}`);
  }

  // Disposition
  if (!VALID_DISPOSITIONS.includes(c.adjudication.disposition)) errors.push(`Invalid disposition: ${c.adjudication.disposition}`);
  if (!c.adjudication.disposition_rationale) errors.push("Missing disposition_rationale");
  if (typeof c.adjudication.should_abstain !== "boolean") errors.push("should_abstain must be boolean");
  if (typeof c.adjudication.is_out_of_distribution !== "boolean") errors.push("is_out_of_distribution must be boolean");

  // OOD consistency
  if (c.adjudication.is_out_of_distribution && c.adjudication.disposition !== "cannot_safely_assess") {
    errors.push("OOD cases must have cannot_safely_assess disposition");
  }
  if (c.adjudication.is_out_of_distribution && !c.adjudication.should_abstain) {
    errors.push("OOD cases should have should_abstain=true");
  }
  if (c.adjudication.is_out_of_distribution && !c.adjudication.ood_reason) {
    errors.push("OOD cases must have ood_reason");
  }

  // Contradictions
  if (c.adjudication.has_contradictions && !c.adjudication.contradiction_details) {
    errors.push("has_contradictions=true requires contradiction_details");
  }

  // Category
  if (!Array.isArray(c.category.complaint_families)) errors.push("complaint_families not array");
  if (!VALID_TIERS.includes(c.category.urgency_tier)) errors.push(`Invalid category urgency_tier: ${c.category.urgency_tier}`);
  if (!VALID_DIFFICULTIES.includes(c.category.difficulty)) errors.push(`Invalid difficulty: ${c.category.difficulty}`);
  if (!VALID_CASE_TYPES.includes(c.category.case_type)) errors.push(`Invalid case_type: ${c.category.case_type}`);

  // Expected behavior
  if (c.expected_behavior.min_questions_before_disposition < 0) errors.push("min_questions negative");
  if (c.expected_behavior.max_questions_before_disposition < c.expected_behavior.min_questions_before_disposition) {
    errors.push("max_questions < min_questions");
  }
  if (c.expected_behavior.max_questions_before_disposition > 8) {
    errors.push("max_questions exceeds 8 (benchmark rule)");
  }
  if (typeof c.expected_behavior.emergency_recall_required !== "boolean") errors.push("emergency_recall_required not boolean");
  if (typeof c.expected_behavior.unsafe_downgrade_is_failure !== "boolean") errors.push("unsafe_downgrade_is_failure not boolean");

  // Emergency recall consistency
  if (c.category.urgency_tier === 1 && !c.expected_behavior.emergency_recall_required) {
    errors.push("Tier 1 cases should have emergency_recall_required=true");
  }
  if (
    c.category.urgency_tier === 1 &&
    c.expected_behavior.emergency_recall_required &&
    c.adjudication.disposition !== "emergency_vet_now"
  ) {
    errors.push("Tier 1 emergency recall cases must have emergency_vet_now disposition");
  }

  // Unsafe downgrade consistency
  if (c.category.urgency_tier <= 2 && !c.expected_behavior.unsafe_downgrade_is_failure && !c.adjudication.is_out_of_distribution) {
    // Not strictly required but worth noting
  }

  // Reviewers
  if (!Array.isArray(c.reviewers) || c.reviewers.length === 0) errors.push("No reviewers");
  if (!["single_reviewed", "dual_reviewed", "adjudicated"].includes(c.adjudication_status)) {
    errors.push(`Invalid adjudication_status: ${c.adjudication_status}`);
  }

  return errors;
}

// Main validation
const inputPath = path.join(process.cwd(), 'data', 'benchmark', 'gold-benchmark-v1.jsonl');
const lines = fs.readFileSync(inputPath, 'utf-8').trim().split('\n');

console.log(`Validating ${lines.length} benchmark cases...`);

let totalErrors = 0;
const allErrors: { case_id: string; errors: string[] }[] = [];

for (let i = 0; i < lines.length; i++) {
  let c: BenchmarkCase;
  try {
    c = JSON.parse(lines[i]);
  } catch (e) {
    console.error(`Line ${i + 1}: Invalid JSON`);
    totalErrors++;
    continue;
  }

  const errors = validateCase(c, i);
  if (errors.length > 0) {
    allErrors.push({ case_id: c.case_id, errors });
    totalErrors += errors.length;
  }
}

console.log("\n" + "=".repeat(60));
if (totalErrors === 0) {
  console.log("VALIDATION PASSED - All cases are schema-compliant");
} else {
  console.log(`VALIDATION FAILED - ${totalErrors} errors across ${allErrors.length} cases`);
  for (const { case_id, errors } of allErrors.slice(0, 10)) {
    console.log(`\n${case_id}:`);
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
  }
  if (allErrors.length > 10) {
    console.log(`\n... and ${allErrors.length - 10} more cases with errors`);
  }
}

// Distribution analysis
const cases = lines.map(l => JSON.parse(l));
const familyCoverage = new Set(cases.flatMap(c => c.category.complaint_families));
console.log(`\nComplaint families covered: ${familyCoverage.size}/50`);
console.log(`OOD cases: ${cases.filter(c => c.adjudication.is_out_of_distribution).length}`);
console.log(`Abstention cases: ${cases.filter(c => c.adjudication.should_abstain).length}`);
console.log(`Contradictory cases: ${cases.filter(c => c.adjudication.has_contradictions).length}`);

// Emergency recall check
const emergencyCases = cases.filter(c => c.category.urgency_tier === 1);
const emergencyRecallCases = emergencyCases.filter(c => c.expected_behavior.emergency_recall_required);
console.log(`\nEmergency cases (Tier 1): ${emergencyCases.length}`);
console.log(`With emergency_recall_required: ${emergencyRecallCases.length} (${(emergencyRecallCases.length / emergencyCases.length * 100).toFixed(0)}%)`);
