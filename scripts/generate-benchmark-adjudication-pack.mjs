import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const defaultInput = path.join(rootDir, "data", "benchmarks", "dog-triage", "gold-candidate");
const defaultJsonOutput = path.join(rootDir, "data", "benchmarks", "dog-triage", "adjudication-worklist.json");
const defaultCsvOutput = path.join(rootDir, "data", "benchmarks", "dog-triage", "adjudication-worklist.csv");

function parseArgs(argv) {
  const options = {
    input: defaultInput,
    jsonOutput: defaultJsonOutput,
    csvOutput: defaultCsvOutput,
    format: "v1", // v1 = legacy worklist, v2 = separate vet-a/vet-b packets
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
    if (arg.startsWith("--format=")) {
      options.format = arg.slice("--format=".length);
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function buildBlankReview(reviewer) {
  return {
    reviewer,
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
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function toRow(fileName, suite, row) {
  return {
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
  };
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
    "reviewA_status",
    "reviewA_presentation_valid",
    "reviewA_urgency_valid",
    "reviewA_must_not_miss",
    "reviewA_questioning_valid",
    "reviewA_unknown_policy_valid",
    "reviewA_expectation_precision",
    "reviewA_edit_reason",
    "reviewA_notes",
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
    "panel_notes"
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
        row.reviewA.status,
        row.reviewA.presentation_valid,
        row.reviewA.urgency_valid,
        row.reviewA.must_not_miss,
        row.reviewA.questioning_valid,
        row.reviewA.unknown_policy_valid,
        row.reviewA.expectation_precision,
        row.reviewA.edit_reason,
        row.reviewA.notes,
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
      ].map(escapeCsv).join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildVetPacket(reviewer, cases) {
  return {
    reviewer,
    generatedAt: new Date().toISOString(),
    caseCount: cases.length,
    instructions: {
      presentation_valid: "Does the case presentation match veterinary expectations?",
      urgency_valid: "Is the assigned urgency level clinically appropriate?",
      must_not_miss: "Are all critical red flags and must-not-miss conditions addressed?",
      questioning_valid: "Is the questioning sequence clinically sound?",
      unknown_policy_valid: "Are 'cannot assess' responses handled per policy?",
      expectation_precision: "Rate precision of expected response (excellent|good|acceptable|needs_work)",
    },
    cases: cases.map((row) => ({
      id: row.id,
      description: row.description,
      tags: row.tags,
      weight: row.weight,
      expectedResponseType: row.expectedResponseType,
      requestText: row.requestText,
      review: buildBlankReview(reviewer),
    })),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const suites = loadSuites(options.input);
  const rows = suites.flatMap(({ fileName, suite }) =>
    suite.cases.map((row) => toRow(fileName, suite, row))
  );

  if (options.format === "v2") {
    // Generate separate vet-a and vet-b packets
    const outputDir = path.dirname(options.jsonOutput);
    const vetAPacket = buildVetPacket("vet_a", rows);
    const vetBPacket = buildVetPacket("vet_b", rows);

    const vetAPath = path.join(outputDir, "vet-a-packet.json");
    const vetBPath = path.join(outputDir, "vet-b-packet.json");

    fs.writeFileSync(vetAPath, JSON.stringify(vetAPacket, null, 2) + "\n");
    fs.writeFileSync(vetBPath, JSON.stringify(vetBPacket, null, 2) + "\n");

    console.log(`Wrote Vet A packet to ${vetAPath}`);
    console.log(`Wrote Vet B packet to ${vetBPath}`);
    console.log(`Prepared ${rows.length} case(s) for independent dual-vet review`);

    // Also generate legacy CSV for cross-reference
    fs.writeFileSync(options.csvOutput, buildCsv(rows));
    console.log(`Wrote cross-reference CSV to ${options.csvOutput}`);
    return;
  }

  // Legacy v1 format
  const jsonPayload = {
    suiteId: "gold-candidate-merged",
    generatedAt: new Date().toISOString(),
    caseCount: rows.length,
    source: options.input,
    cases: rows,
  };

  fs.writeFileSync(options.jsonOutput, JSON.stringify(jsonPayload, null, 2) + "\n");
  fs.writeFileSync(options.csvOutput, buildCsv(rows));

  console.log(`Wrote adjudication JSON to ${options.jsonOutput}`);
  console.log(`Wrote adjudication CSV to ${options.csvOutput}`);
  console.log(`Prepared ${rows.length} adjudication case(s)`);
}

main();
