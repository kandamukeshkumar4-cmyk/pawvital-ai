import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const benchmarkDir = path.join(rootDir, "data", "benchmarks", "dog-triage");
const defaultInput = path.join(benchmarkDir, "gold-candidate");
const defaultJsonOutput = path.join(benchmarkDir, "adjudication-worklist.json");
const defaultCsvOutput = path.join(benchmarkDir, "adjudication-worklist.csv");
const defaultFreezeOutputDir = path.join(benchmarkDir, "wave3-freeze");
const defaultFreezeManifestOutput = path.join(
  benchmarkDir,
  "wave3-freeze-manifest.json"
);
const defaultFreezeReportOutput = path.join(
  benchmarkDir,
  "wave3-freeze-report.md"
);
const defaultVetAOutput = path.join(benchmarkDir, "vet-a-packet.json");
const defaultVetBOutput = path.join(benchmarkDir, "vet-b-packet.json");
const multimodalSlicesDir = path.join(benchmarkDir, "multimodal-slices");

const STRATA = [
  {
    key: "emergency",
    title: "Emergency",
    description:
      "Tier 1 emergency cases that must preserve emergency recall and safe escalation.",
  },
  {
    key: "urgent",
    title: "Urgent",
    description:
      "Tier 2 same-day cases that must avoid unsafe downgrade while still supporting questioning.",
  },
  {
    key: "common",
    title: "Common",
    description:
      "Representative non-high-risk complaint flows for everyday dog triage coverage.",
  },
  {
    key: "ambiguous",
    title: "Ambiguous",
    description:
      "Cases with vague, multi-complaint, or otherwise clinically ambiguous owner phrasing.",
  },
  {
    key: "contradictory",
    title: "Contradictory",
    description:
      "Cases that explicitly test contradiction detection and safe resolution behavior.",
  },
  {
    key: "low-information",
    title: "Low Information",
    description:
      "Cases where the owner cannot assess a critical signal or key question directly.",
  },
  {
    key: "rare-but-critical",
    title: "Rare But Critical",
    description:
      "Dangerous cases that are safety-sensitive even when they are not the most common presentation.",
  },
];

const HIGH_RISK_STRATA = new Set([
  "emergency",
  "urgent",
  "contradictory",
  "low-information",
  "rare-but-critical",
]);

function parseArgs(argv) {
  const options = {
    input: defaultInput,
    jsonOutput: defaultJsonOutput,
    csvOutput: defaultCsvOutput,
    freezeOutputDir: defaultFreezeOutputDir,
    freezeManifestOutput: defaultFreezeManifestOutput,
    freezeReportOutput: defaultFreezeReportOutput,
    vetAOutput: defaultVetAOutput,
    vetBOutput: defaultVetBOutput,
    format: "v2",
  };

  for (const arg of argv) {
    if (arg.startsWith("--input=")) {
      options.input = path.resolve(rootDir, arg.slice("--input=".length));
      continue;
    }
    if (arg.startsWith("--json-output=")) {
      options.jsonOutput = path.resolve(rootDir, arg.slice("--json-output=".length));
      continue;
    }
    if (arg.startsWith("--csv-output=")) {
      options.csvOutput = path.resolve(rootDir, arg.slice("--csv-output=".length));
      continue;
    }
    if (arg.startsWith("--freeze-output-dir=")) {
      options.freezeOutputDir = path.resolve(
        rootDir,
        arg.slice("--freeze-output-dir=".length)
      );
      continue;
    }
    if (arg.startsWith("--freeze-manifest-output=")) {
      options.freezeManifestOutput = path.resolve(
        rootDir,
        arg.slice("--freeze-manifest-output=".length)
      );
      continue;
    }
    if (arg.startsWith("--freeze-report-output=")) {
      options.freezeReportOutput = path.resolve(
        rootDir,
        arg.slice("--freeze-report-output=".length)
      );
      continue;
    }
    if (arg.startsWith("--vet-a-output=")) {
      options.vetAOutput = path.resolve(rootDir, arg.slice("--vet-a-output=".length));
      continue;
    }
    if (arg.startsWith("--vet-b-output=")) {
      options.vetBOutput = path.resolve(rootDir, arg.slice("--vet-b-output=".length));
      continue;
    }
    if (arg.startsWith("--format=")) {
      options.format = arg.slice("--format=".length);
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function loadSuites(inputDir) {
  const files = fs
    .readdirSync(inputDir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".schema.json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No benchmark JSON files found in ${inputDir}`);
  }

  return files.map((fileName) => ({
    fileName,
    suite: readJson(path.join(inputDir, fileName)),
  }));
}

function buildBlankReview(reviewerId) {
  return {
    reviewer_id: reviewerId,
    reviewer: reviewerId,
    status: "pending",
    presentation_valid: null,
    urgency_valid: null,
    must_not_miss: null,
    questioning_valid: null,
    unknown_policy_valid: null,
    expectation_precision: "unset",
    edit_reason: "",
    notes: "",
  };
}

function flattenRequestText(messages) {
  return (messages ?? [])
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function inferComplaintFamilies(row) {
  const direct = uniqueStrings(row.complaint_family_tags);
  if (direct.length > 0) {
    return direct;
  }

  const inferredFromSymptoms = uniqueStrings([
    ...(row.expectations?.knownSymptomsInclude ?? []),
    ...(row.request?.session?.known_symptoms ?? []),
  ]);
  if (inferredFromSymptoms.length > 0) {
    return inferredFromSymptoms;
  }

  const tags = new Set(uniqueStrings(row.tags));
  const text = flattenRequestText(row.request?.messages || []).toLowerCase();
  const inferred = [];

  if (tags.has("trauma") || /hit by car|car accident|fracture|severe bleeding|dragging/i.test(text)) {
    inferred.push("trauma");
  }
  if (
    tags.has("allergy") ||
    tags.has("anaphylaxis") ||
    /vaccine|shot|bee sting|face swelled|hives/i.test(text)
  ) {
    inferred.push("post_vaccination_reaction");
  }
  if (tags.has("toxin") || /poison|toxin|xylitol|rat poison|gum/i.test(text)) {
    inferred.push("medication_reaction");
  }
  if (
    tags.has("pregnancy") ||
    tags.has("birth") ||
    /pregnan|labor|postpartum|green discharge|puppy/i.test(text)
  ) {
    inferred.push("pregnancy_birth");
  }
  if (tags.has("reproductive")) {
    inferred.push(
      tags.has("male") || /scrotal|testicle|penis|paraphimosis/i.test(text)
        ? "testicular_prostate"
        : /vaginal|discharge|heat|spotting/i.test(text)
          ? "vaginal_discharge"
          : "pregnancy_birth"
    );
  }
  if (
    tags.has("collapse") ||
    tags.has("seizure") ||
    /collapse|seizure|unresponsive|paralysis/i.test(text)
  ) {
    inferred.push("seizure_collapse");
  }
  if (/breathe|breathing|panting|blue gums|gums look blue/i.test(text)) {
    inferred.push("difficulty_breathing");
  }
  if (/vomit|throwing up|retch/i.test(text)) {
    inferred.push("vomiting");
  }
  if (/diarrhea|bloody stool|blood in stool/i.test(text)) {
    inferred.push("diarrhea");
  }
  if (/limp|lameness|cannot stand|won't stand/i.test(text)) {
    inferred.push("limping");
  }
  if (tags.has("cardiac")) {
    inferred.push(
      tags.has("respiratory") || /cough|breathing/i.test(text)
        ? "coughing_breathing_combined"
        : tags.has("abdomen") || /belly|abdominal|fluid/i.test(text)
          ? "swollen_abdomen"
          : "lethargy"
    );
  }
  if (tags.has("oncology")) {
    if (tags.has("oral") || /oral|mouth|gum/i.test(text)) {
      inferred.push("oral_mass");
    }
    if (tags.has("nasal") || /nosebleed|nasal/i.test(text)) {
      inferred.push("nasal_discharge");
    }
    if (tags.has("mass") || /lump|mass|swelling|node/i.test(text)) {
      inferred.push("swelling_lump");
    }
    if (tags.has("systemic") || /weight loss|weakness/i.test(text)) {
      inferred.push("weight_loss");
    }
  }

  return uniqueStrings(inferred);
}

function inferRiskTier(row) {
  if (typeof row.risk_tier === "string" && row.risk_tier.trim()) {
    return row.risk_tier;
  }

  const responseType = String(row.expectations?.responseType || "");
  if (responseType === "emergency") return "tier_1_emergency";

  const recommendation = String(row.expectations?.reportRecommendation || "");
  if (recommendation === "vet_24h" || recommendation === "same_day_vet") {
    return "tier_2_same_day";
  }
  if (recommendation === "vet_48h") {
    return "tier_3_48h_monitor";
  }
  if (recommendation === "monitor") {
    return "tier_4_monitor";
  }

  const tags = new Set(uniqueStrings(row.tags));
  if (tags.has("emergency")) return "tier_1_emergency";
  if (tags.has("urgent") || tags.has("same_day")) return "tier_2_same_day";
  return "tier_3_48h_monitor";
}

function inferUncertaintyPattern(row) {
  if (typeof row.uncertainty_pattern === "string" && row.uncertainty_pattern.trim()) {
    return row.uncertainty_pattern;
  }

  const tags = new Set(uniqueStrings(row.tags));
  if (tags.has("contradictory")) return "contradictory";
  if (tags.has("ambiguous")) return "ambiguous";
  if (tags.has("unknown") || tags.has("low_information")) {
    return "owner_cannot_assess";
  }
  return "clean";
}

function inferMustAskExpectationIds(row) {
  const questionIds = uniqueStrings([
    row.expectations?.lastQuestionAsked,
    row.request?.session?.last_question_asked,
    ...(row.expectations?.answeredQuestionsExclude ?? []),
  ]);

  const status =
    questionIds.length > 0
      ? "seeded_from_case_expectations"
      : "pending_clinical_definition";

  const notes =
    questionIds.length > 0
      ? "Seeded from existing benchmark expectation fields and requires veterinarian confirmation during adjudication."
      : "Source case does not encode explicit must-ask IDs. Clinical reviewers must populate this field during adjudication.";

  return {
    question_ids: questionIds,
    status,
    notes,
  };
}

function deriveStrata(meta) {
  const strata = new Set();
  const tags = new Set(meta.tags);

  if (meta.riskTier === "tier_1_emergency") {
    strata.add("emergency");
  }
  if (meta.riskTier === "tier_2_same_day") {
    strata.add("urgent");
  }
  if (meta.uncertaintyPattern === "contradictory" || tags.has("contradictory")) {
    strata.add("contradictory");
  }
  if (
    meta.uncertaintyPattern === "owner_cannot_assess" ||
    meta.uncertaintyPattern === "low_info" ||
    tags.has("unknown") ||
    tags.has("low_information")
  ) {
    strata.add("low-information");
  }
  if (
    meta.uncertaintyPattern === "ambiguous" ||
    meta.uncertaintyPattern === "vague" ||
    meta.uncertaintyPattern === "slang" ||
    meta.uncertaintyPattern === "multi_complaint" ||
    meta.uncertaintyPattern === "low_literacy" ||
    tags.has("ambiguous")
  ) {
    strata.add("ambiguous");
  }
  if (
    meta.mustNotMissMarker ||
    tags.has("rare_but_critical") ||
    tags.has("rare") ||
    tags.has("dangerous")
  ) {
    strata.add("rare-but-critical");
  }
  if (strata.size === 0) {
    strata.add("common");
  }

  return [...strata];
}

function isHighRisk(strata) {
  return strata.some((stratum) => HIGH_RISK_STRATA.has(stratum));
}

function buildWave3Adjudication(meta) {
  const requiresDualReview = isHighRisk(meta.strata);
  const reviewerSlots = requiresDualReview
    ? [
        { role: "vet_a", reviewer_id: "vet_a", status: "pending" },
        { role: "vet_b", reviewer_id: "vet_b", status: "pending" },
      ]
    : [{ role: "vet_a", reviewer_id: "vet_a", status: "pending" }];

  return {
    high_risk: requiresDualReview,
    review_tier: requiresDualReview
      ? "dual_review_required"
      : "single_review_allowed",
    reviewer_slots: reviewerSlots,
    disagreement_status: requiresDualReview
      ? "pending_dual_review"
      : "not_required",
    must_ask_expectations: meta.mustAskExpectations,
  };
}

function normalizeCase(fileName, suite, row, freezeDate) {
  const tags = uniqueStrings(row.tags);
  const complaintFamilies = inferComplaintFamilies(row);
  const riskTier = inferRiskTier(row);
  const uncertaintyPattern = inferUncertaintyPattern(row);
  const mustNotMissMarker = Boolean(
    row.must_not_miss_marker ?? riskTier === "tier_1_emergency"
  );
  const mustAskExpectations = inferMustAskExpectationIds(row);
  const meta = {
    tags,
    complaintFamilies,
    riskTier,
    uncertaintyPattern,
    mustNotMissMarker,
    mustAskExpectations,
    strata: [],
  };
  meta.strata = deriveStrata(meta);
  const wave3Adjudication = buildWave3Adjudication(meta);

  const freezeCase = {
    ...row,
    complaint_family_tags: complaintFamilies,
    risk_tier: riskTier,
    uncertainty_pattern: uncertaintyPattern,
    must_not_miss_marker: mustNotMissMarker,
    provenance: {
      source_shard: fileName,
      source_suite_id: suite.suite_id,
      freeze_date: freezeDate,
      version: "wave3-freeze-v2",
    },
    wave3_strata: meta.strata,
    wave3_adjudication: wave3Adjudication,
  };

  const worklistCase = {
    id: row.id,
    description: row.description,
    tags,
    weight: typeof row.weight === "number" ? row.weight : 1,
    expectedResponseType: String(row.expectations?.responseType || ""),
    sourceSuiteId: suite.suite_id,
    sourceFile: fileName,
    requestText: flattenRequestText(row.request?.messages || []),
    complaintFamilies,
    riskTier,
    uncertaintyPattern,
    strata: meta.strata,
    highRisk: wave3Adjudication.high_risk,
    mustNotMissMarker,
    mustAskExpectations,
    disagreementStatus: wave3Adjudication.disagreement_status,
    reviewTier: wave3Adjudication.review_tier,
    reviewA: buildBlankReview("vet_a"),
    reviewB: buildBlankReview("vet_b"),
    panelDecision: {
      status: "pending",
      owner: "",
      notes: "",
    },
  };

  return { freezeCase, worklistCase };
}

function loadMultimodalSliceSummaries() {
  if (!fs.existsSync(multimodalSlicesDir)) {
    return [];
  }

  return fs
    .readdirSync(multimodalSlicesDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((fileName) => {
      const fullPath = path.join(multimodalSlicesDir, fileName);
      const content = fs.readFileSync(fullPath, "utf8").trim();
      const entries = JSON.parse(content);
      return {
        fileName,
        modality: String(entries[0]?.modality || fileName.replace(".jsonl", "")),
        caseCount: Array.isArray(entries) ? entries.length : 0,
      };
    });
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(rows) {
  const headers = [
    "id",
    "description",
    "tags",
    "weight",
    "expectedResponseType",
    "sourceSuiteId",
    "sourceFile",
    "requestText",
    "complaintFamilies",
    "riskTier",
    "uncertaintyPattern",
    "strata",
    "highRisk",
    "mustNotMissMarker",
    "mustAskExpectationIds",
    "mustAskExpectationStatus",
    "disagreementStatus",
    "reviewTier",
    "reviewA_reviewer_id",
    "reviewA_status",
    "reviewA_presentation_valid",
    "reviewA_urgency_valid",
    "reviewA_must_not_miss",
    "reviewA_questioning_valid",
    "reviewA_unknown_policy_valid",
    "reviewA_expectation_precision",
    "reviewA_edit_reason",
    "reviewA_notes",
    "reviewB_reviewer_id",
    "reviewB_status",
    "reviewB_presentation_valid",
    "reviewB_urgency_valid",
    "reviewB_must_not_miss",
    "reviewB_questioning_valid",
    "reviewB_unknown_policy_valid",
    "reviewB_expectation_precision",
    "reviewB_edit_reason",
    "reviewB_notes",
    "panel_status",
    "panel_owner",
    "panel_notes",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.description,
        row.tags.join("|"),
        row.weight,
        row.expectedResponseType,
        row.sourceSuiteId,
        row.sourceFile,
        row.requestText,
        row.complaintFamilies.join("|"),
        row.riskTier,
        row.uncertaintyPattern,
        row.strata.join("|"),
        row.highRisk,
        row.mustNotMissMarker,
        row.mustAskExpectations.question_ids.join("|"),
        row.mustAskExpectations.status,
        row.disagreementStatus,
        row.reviewTier,
        row.reviewA.reviewer_id,
        row.reviewA.status,
        row.reviewA.presentation_valid,
        row.reviewA.urgency_valid,
        row.reviewA.must_not_miss,
        row.reviewA.questioning_valid,
        row.reviewA.unknown_policy_valid,
        row.reviewA.expectation_precision,
        row.reviewA.edit_reason,
        row.reviewA.notes,
        row.reviewB.reviewer_id,
        row.reviewB.status,
        row.reviewB.presentation_valid,
        row.reviewB.urgency_valid,
        row.reviewB.must_not_miss,
        row.reviewB.questioning_valid,
        row.reviewB.unknown_policy_valid,
        row.reviewB.expectation_precision,
        row.reviewB.edit_reason,
        row.reviewB.notes,
        row.panelDecision.status,
        row.panelDecision.owner,
        row.panelDecision.notes,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildVetPacket(reviewerId, rows) {
  return {
    reviewer: reviewerId,
    generatedAt: new Date().toISOString(),
    caseCount: rows.length,
    instructions: {
      presentation_valid:
        "Does the case presentation match veterinary expectations?",
      urgency_valid:
        "Is the assigned urgency level clinically appropriate?",
      must_not_miss:
        "Are all critical red flags and must-not-miss conditions addressed?",
      questioning_valid:
        "Is the questioning sequence clinically sound?",
      unknown_policy_valid:
        "Are 'cannot assess' responses handled per policy?",
      expectation_precision:
        "Rate precision of expected response (excellent|good|acceptable|needs_work)",
    },
    cases: rows.map((row) => ({
      id: row.id,
      description: row.description,
      tags: row.tags,
      weight: row.weight,
      expectedResponseType: row.expectedResponseType,
      requestText: row.requestText,
      complaintFamilies: row.complaintFamilies,
      riskTier: row.riskTier,
      strata: row.strata,
      highRisk: row.highRisk,
      mustNotMissMarker: row.mustNotMissMarker,
      mustAskExpectations: row.mustAskExpectations,
      disagreementStatus: row.disagreementStatus,
      sourceSuiteId: row.sourceSuiteId,
      sourceFile: row.sourceFile,
      review: buildBlankReview(reviewerId),
    })),
  };
}

function buildLegacyRows(suites) {
  return suites.flatMap(({ fileName, suite }) =>
    suite.cases.map((row) => ({
      id: row.id,
      description: row.description,
      tags: Array.isArray(row.tags) ? row.tags : [],
      weight: typeof row.weight === "number" ? row.weight : 1,
      expectedResponseType: String(row.expectations?.responseType || ""),
      sourceSuiteId: suite.suite_id,
      sourceFile: fileName,
      requestText: flattenRequestText(row.request?.messages || []),
      reviewA: buildBlankReview("reviewer_a"),
      reviewB: buildBlankReview("reviewer_b"),
      panelDecision: {
        status: "pending",
        owner: "",
        notes: "",
      },
    }))
  );
}

function buildFreezeSuites(freezeCases) {
  return STRATA.map((stratum) => ({
    stratum,
    suite: {
      suite_id: `dog-triage-wave3-freeze-${stratum.key}`,
      version: "wave3-freeze-v2",
      species: "dog",
      description: stratum.description,
      cases: freezeCases.filter((caseData) =>
        (caseData.wave3_strata ?? []).includes(stratum.key)
      ),
    },
  }));
}

function buildFreezeManifest(freezeSuites, allFreezeCases, sourceInput, multimodalSlices) {
  const hashInput = allFreezeCases
    .map((caseData) => `${caseData.id}:${caseData.provenance?.source_shard || ""}`)
    .sort()
    .join("|");

  return {
    version: "wave3-freeze-v2",
    generatedAt: new Date().toISOString(),
    sourceInput,
    uniqueCaseCount: allFreezeCases.length,
    highRiskCaseCount: allFreezeCases.filter((caseData) =>
      Boolean(caseData.wave3_adjudication?.high_risk)
    ).length,
    shardHash: crypto.createHash("sha256").update(hashInput).digest("hex"),
    strata: freezeSuites.map(({ stratum, suite }) => ({
      key: stratum.key,
      title: stratum.title,
      fileName: `${stratum.key}.json`,
      caseCount: suite.cases.length,
      dualReviewRequiredCount: suite.cases.filter((caseData) =>
        Boolean(caseData.wave3_adjudication?.high_risk)
      ).length,
    })),
    multimodalSlices,
  };
}

function buildFreezeReport(manifest) {
  const lines = [
    "# Wave 3 Freeze Report",
    "",
    `Generated at: ${manifest.generatedAt}`,
    `Source input: ${manifest.sourceInput}`,
    `Unique case count: ${manifest.uniqueCaseCount}`,
    `High-risk cases requiring dual review: ${manifest.highRiskCaseCount}`,
    "",
    "## Freeze Strata",
    "",
    "| Stratum | Cases | Dual-review required |",
    "| --- | ---: | ---: |",
    ...manifest.strata.map(
      (entry) =>
        `| ${entry.title} | ${entry.caseCount} | ${entry.dualReviewRequiredCount} |`
    ),
    "",
    "## Multimodal Slice Inputs",
    "",
    "| File | Modality | Cases |",
    "| --- | --- | ---: |",
    ...manifest.multimodalSlices.map(
      (entry) => `| ${entry.fileName} | ${entry.modality} | ${entry.caseCount} |`
    ),
    "",
    "## Notes",
    "",
    "- High-risk cases are pre-seeded with dual-review metadata, reviewer slots, disagreement status, and must-ask expectation scaffolding.",
    "- Must-ask expectation IDs are seeded from existing benchmark expectation fields and still require veterinarian confirmation.",
    "- This freeze remains pre-adjudication until independent clinical review is completed and disagreement cases are reconciled.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const suites = loadSuites(options.input);

  if (options.format === "v1") {
    const rows = buildLegacyRows(suites);
    const jsonPayload = {
      suiteId: "gold-candidate-merged",
      generatedAt: new Date().toISOString(),
      caseCount: rows.length,
      source: options.input,
      cases: rows,
    };

    writeJson(options.jsonOutput, jsonPayload);
    writeText(options.csvOutput, buildCsv(rows));

    console.log(`Wrote adjudication JSON to ${options.jsonOutput}`);
    console.log(`Wrote adjudication CSV to ${options.csvOutput}`);
    console.log(`Prepared ${rows.length} adjudication case(s)`);
    return;
  }

  const freezeDate = new Date().toISOString().slice(0, 10);
  const normalized = suites.flatMap(({ fileName, suite }) =>
    suite.cases.map((row) => normalizeCase(fileName, suite, row, freezeDate))
  );
  const freezeCases = normalized.map((entry) => entry.freezeCase);
  const worklistRows = normalized.map((entry) => entry.worklistCase);
  const multimodalSlices = loadMultimodalSliceSummaries();

  const worklistPayload = {
    suiteId: "wave3-freeze-worklist-v2",
    generatedAt: new Date().toISOString(),
    caseCount: worklistRows.length,
    source: options.input,
    cases: worklistRows,
  };

  const freezeSuites = buildFreezeSuites(freezeCases);
  const freezeManifest = buildFreezeManifest(
    freezeSuites,
    freezeCases,
    options.input,
    multimodalSlices
  );
  const freezeReport = buildFreezeReport(freezeManifest);

  writeJson(options.jsonOutput, worklistPayload);
  writeText(options.csvOutput, buildCsv(worklistRows));
  writeJson(options.vetAOutput, buildVetPacket("vet_a", worklistRows));
  writeJson(options.vetBOutput, buildVetPacket("vet_b", worklistRows));

  fs.mkdirSync(options.freezeOutputDir, { recursive: true });
  for (const { stratum, suite } of freezeSuites) {
    writeJson(path.join(options.freezeOutputDir, `${stratum.key}.json`), suite);
  }
  writeJson(options.freezeManifestOutput, freezeManifest);
  writeText(options.freezeReportOutput, freezeReport);

  console.log(`Wrote Wave 3 adjudication JSON to ${options.jsonOutput}`);
  console.log(`Wrote Wave 3 adjudication CSV to ${options.csvOutput}`);
  console.log(`Wrote Vet A packet to ${options.vetAOutput}`);
  console.log(`Wrote Vet B packet to ${options.vetBOutput}`);
  console.log(`Wrote Wave 3 freeze suites to ${options.freezeOutputDir}`);
  console.log(`Wrote Wave 3 freeze manifest to ${options.freezeManifestOutput}`);
  console.log(`Wrote Wave 3 freeze report to ${options.freezeReportOutput}`);
  console.log(`Prepared ${worklistRows.length} case(s) for Wave 3 freeze + dual-review adjudication`);
}

main();
