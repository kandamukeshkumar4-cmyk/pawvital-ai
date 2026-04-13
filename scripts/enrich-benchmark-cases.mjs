#!/usr/bin/env node

/**
 * Enrich benchmark cases with metadata for VET-918
 *
 * Reads all shard files from gold-candidate/, derives:
 * - complaint_family_tags
 * - risk_tier
 * - uncertainty_pattern
 * - must_not_miss_marker
 * - provenance
 *
 * Writes gold-v1-enriched.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const INPUT_DIR = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-candidate");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "benchmarks", "dog-triage", "gold-v1-enriched.jsonl");

// Symptom to complaint family mapping (derived from SYMPTOM_MAP body_systems)
const SYMPTOM_TO_FAMILY = {
  difficulty_breathing: "difficulty_breathing",
  swollen_abdomen: "swollen_abdomen",
  seizure_collapse: "seizure_collapse",
  coughing_breathing_combined: "coughing_breathing_combined",
  heat_intolerance: "heat_intolerance",
  vision_loss: "vision_loss",
  pregnancy_birth: "pregnancy_birth",
  coughing: "coughing",
  vomiting: "vomiting",
  diarrhea: "diarrhea",
  not_eating: "not_eating",
  lethargy: "lethargy",
  limping: "limping",
  excessive_scratching: "excessive_scratching",
  drinking_more: "drinking_more",
  trembling: "trembling",
  eye_discharge: "eye_discharge",
  ear_scratching: "ear_scratching",
  weight_loss: "weight_loss",
  wound_skin_issue: "wound_skin_issue",
  behavior_change: "behavior_change",
  swelling_lump: "swelling_lump",
  dental_problem: "dental_problem",
  hair_loss: "hair_loss",
  regurgitation: "regurgitation",
  constipation: "constipation",
  generalized_stiffness: "generalized_stiffness",
  nasal_discharge: "nasal_discharge",
  vaginal_discharge: "vaginal_discharge",
  testicular_prostate: "testicular_prostate",
  exercise_induced_lameness: "exercise_induced_lameness",
  skin_odor_greasy: "skin_odor_greasy",
  recurrent_ear: "recurrent_ear",
  recurrent_skin: "recurrent_skin",
  inappropriate_urination: "inappropriate_urination",
  fecal_incontinence: "fecal_incontinence",
  vomiting_diarrhea_combined: "vomiting_diarrhea_combined",
  oral_mass: "oral_mass",
  hearing_loss: "hearing_loss",
  aggression: "aggression",
  pacing_restlessness: "pacing_restlessness",
  abnormal_gait: "abnormal_gait",
  postoperative_concern: "postoperative_concern",
  medication_reaction: "medication_reaction",
  puppy_concern: "puppy_concern",
  senior_decline: "senior_decline",
  multi_system_decline: "multi_system_decline",
  unknown_concern: "unknown_concern",
  blood_in_stool: "blood_in_stool",
  urination_problem: "urination_problem",
};

// Emergency-tier complaint families (Tier 1)
const EMERGENCY_FAMILIES = new Set([
  "difficulty_breathing",
  "swollen_abdomen",
  "seizure_collapse",
  "coughing_breathing_combined",
  "heat_intolerance",
  "vision_loss",
  "pregnancy_birth",
]);

function normalizePet(pet = {}) {
  return {
    name: pet.name,
    breed: pet.breed,
    age_years: pet.age_years ?? pet.age,
    weight: pet.weight,
    species: pet.species ?? "dog",
  };
}

function normalizeMessages(messages = []) {
  return messages.map((message) =>
    typeof message === "string" ? { role: "user", content: message } : message
  );
}

function normalizeRequest(caseData) {
  if (caseData.request) {
    return {
      ...caseData.request,
      pet: normalizePet(caseData.request.pet),
      messages: normalizeMessages(caseData.request.messages),
    };
  }

  return {
    action: "chat",
    pet: normalizePet(caseData.pet),
    ...(caseData.session ? { session: caseData.session } : {}),
    messages: normalizeMessages(caseData.messages),
  };
}

function extractSymptomsFromCase(caseData) {
  const symptoms = new Set();
  const expectations = caseData.expectations || {};

  // From knownSymptomsInclude
  if (expectations.knownSymptomsInclude) {
    expectations.knownSymptomsInclude.forEach((s) => symptoms.add(s));
  }

  // From tags
  if (caseData.tags) {
    caseData.tags.forEach((tag) => {
      if (SYMPTOM_TO_FAMILY[tag]) {
        symptoms.add(tag);
      }
    });
  }

  return Array.from(symptoms);
}

function deriveComplaintFamilies(caseData) {
  if (Array.isArray(caseData.complaint_family_tags) && caseData.complaint_family_tags.length > 0) {
    return Array.from(new Set(caseData.complaint_family_tags));
  }

  const symptoms = extractSymptomsFromCase(caseData);
  const families = new Set();

  symptoms.forEach((symptom) => {
    const family = SYMPTOM_TO_FAMILY[symptom];
    if (family) {
      families.add(family);
    }
  });

  // Also check tags for direct family matches
  if (caseData.tags) {
    caseData.tags.forEach((tag) => {
      if (tag.includes("emergency") || tag.includes("respiratory") || tag.includes("gdv")) {
        if (tag.includes("respiratory") || tag.includes("breathing")) families.add("difficulty_breathing");
        if (tag.includes("gdv") || tag.includes("abdomen")) families.add("swollen_abdomen");
        if (tag.includes("seizure") || tag.includes("neurologic")) families.add("seizure_collapse");
        if (tag.includes("heat")) families.add("heat_intolerance");
        if (tag.includes("toxin")) families.add("vomiting");
        if (tag.includes("trauma")) families.add("wound_skin_issue");
      }
    });
  }

  return Array.from(families).length > 0 ? Array.from(families) : ["unknown_concern"];
}

function deriveRiskTier(families) {
  const hasEmergency = families.some((f) => EMERGENCY_FAMILIES.has(f));
  if (hasEmergency) return "tier_1_emergency";

  // Check for blood/acute indicators
  if (families.includes("blood_in_stool") || families.includes("urination_problem")) {
    return "tier_2_same_day";
  }

  return "tier_3_48h_monitor";
}

function deriveUncertaintyPattern(caseData) {
  const messages = caseData.request?.messages || [];
  const userContent = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");

  if (userContent.includes("not sure") || userContent.includes("don't know") || userContent.includes("cannot assess")) {
    return "owner_cannot_assess";
  }

  if (userContent.includes("maybe") || userContent.includes("seems") || userContent.includes("might")) {
    return "ambiguous";
  }

  if (messages.length > 1) {
    return "multi_turn";
  }

  return "clean";
}

function deriveMustNotMissMarker(families) {
  return families.some((f) => EMERGENCY_FAMILIES.has(f));
}

function loadSuites(inputDir) {
  const files = fs
    .readdirSync(inputDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".schema.json"))
    .sort();

  return files.map((fileName) => ({
    fileName,
    suite: JSON.parse(fs.readFileSync(path.join(inputDir, fileName), "utf8")),
  }));
}

function main() {
  console.log("Enriching benchmark cases...");
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_FILE}`);

  const suites = loadSuites(INPUT_DIR);
  let totalCases = 0;
  const enrichedCases = [];

  for (const { fileName, suite } of suites) {
    console.log(`\nProcessing ${fileName} (${suite.cases.length} cases)...`);

    for (const caseData of suite.cases) {
      const normalizedRequest = normalizeRequest(caseData);
      const normalizedCase = {
        ...caseData,
        request: normalizedRequest,
      };

      const families = deriveComplaintFamilies(normalizedCase);
      const riskTier = caseData.risk_tier || deriveRiskTier(families);
      const uncertaintyPattern = caseData.uncertainty_pattern || deriveUncertaintyPattern(normalizedCase);
      const mustNotMiss =
        typeof caseData.must_not_miss_marker === "boolean"
          ? caseData.must_not_miss_marker
          : deriveMustNotMissMarker(families);

      const enriched = {
        ...caseData,
        request: normalizedRequest,
        complaint_family_tags: families,
        risk_tier: riskTier,
        uncertainty_pattern: uncertaintyPattern,
        must_not_miss_marker: mustNotMiss,
        provenance: {
          source_shard: fileName,
          source_suite_id: suite.suite_id,
          freeze_date: new Date().toISOString().split("T")[0],
          version: "gold-v1",
        },
      };

      delete enriched.pet;
      delete enriched.messages;
      delete enriched.session;

      enrichedCases.push(enriched);
      totalCases++;
    }
  }

  // Write as JSONL
  fs.writeFileSync(OUTPUT_FILE, enrichedCases.map((c) => JSON.stringify(c)).join("\n"), "utf8");

  console.log(`\nEnrichment complete!`);
  console.log(`Total cases enriched: ${totalCases}`);
  console.log(`Output written to: ${OUTPUT_FILE}`);

  // Summary stats
  const familyCounts = {};
  const tierCounts = {};
  const uncertaintyCounts = {};
  let mustNotMissCount = 0;

  for (const caseData of enrichedCases) {
    caseData.complaint_family_tags.forEach((f) => {
      familyCounts[f] = (familyCounts[f] || 0) + 1;
    });
    tierCounts[caseData.risk_tier] = (tierCounts[caseData.risk_tier] || 0) + 1;
    uncertaintyCounts[caseData.uncertainty_pattern] = (uncertaintyCounts[caseData.uncertainty_pattern] || 0) + 1;
    if (caseData.must_not_miss_marker) mustNotMissCount++;
  }

  console.log("\nFamily distribution:");
  Object.entries(familyCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([family, count]) => console.log(`  ${family}: ${count}`));

  console.log("\nRisk tier distribution:");
  Object.entries(tierCounts).forEach(([tier, count]) => console.log(`  ${tier}: ${count}`));

  console.log("\nUncertainty pattern distribution:");
  Object.entries(uncertaintyCounts).forEach(([pattern, count]) => console.log(`  ${pattern}: ${count}`));

  console.log(`\nMust-not-miss cases: ${mustNotMissCount}/${totalCases}`);
}

main();
