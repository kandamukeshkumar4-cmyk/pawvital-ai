import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const defaultInputPath = path.join(
  rootDir,
  "data",
  "benchmarks",
  "dog-triage",
  "sample-cases.json"
);
const defaultOutputPath = path.join(rootDir, "runpod-benchmark-report.json");
const sidecarRegistry = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src", "lib", "sidecar-service-registry.json"),
    "utf8"
  )
);
const readinessRoutePath = "/api/ai/sidecar-readiness";
const readinessTimeoutMs = Number(process.env.HF_SIDECAR_HEALTH_TIMEOUT_MS) || 8000;

function loadEnvFiles() {
  for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function parseArgs(argv) {
  const options = {
    input: defaultInputPath,
    output: defaultOutputPath,
    baseUrl:
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
    dryRun: false,
    skipPreflight: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-preflight") {
      options.skipPreflight = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--input=")) {
      options.input = path.resolve(rootDir, arg.slice("--input=".length));
    } else if (arg.startsWith("--output=")) {
      options.output = path.resolve(rootDir, arg.slice("--output=".length));
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length).trim();
    }
  }

  return options;
}

function printHelp() {
  console.log(`RunPod benchmark harness

Usage:
  node scripts/runpod-benchmark.mjs
  node scripts/runpod-benchmark.mjs --dry-run
  node scripts/runpod-benchmark.mjs --input=path/to/suite.json --base-url=https://pawvital-ai.vercel.app

Options:
  --dry-run       Validate and enumerate the suite without calling the app
  --skip-preflight
                  Skip strict sidecar readiness validation before live runs
  --input=PATH    Benchmark suite JSON
  --output=PATH   Output report JSON
  --base-url=URL  App base URL used for live execution
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadSuite(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) {
    const files = fs
      .readdirSync(inputPath)
      .filter(
        (name) =>
          name.endsWith(".json") &&
          !name.endsWith(".schema.json")
      )
      .sort();
    ensure(files.length > 0, `No benchmark JSON files found in ${inputPath}`);

    const suites = files.map((name) => readJson(path.join(inputPath, name)));
    for (const suite of suites) {
      validateSuite(suite);
    }

    return {
      suite_id: `${path.basename(inputPath)}-merged`,
      version: new Date().toISOString().slice(0, 10),
      species: "dog",
      description: `Merged benchmark suite from ${inputPath}`,
      cases: suites.flatMap((suite) => suite.cases),
    };
  }

  return readJson(inputPath);
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateSuite(suite) {
  ensure(suite && typeof suite === "object", "Benchmark suite must be an object");
  ensure(typeof suite.suite_id === "string" && suite.suite_id, "suite_id is required");
  ensure(suite.species === "dog", "species must be dog");
  ensure(Array.isArray(suite.cases) && suite.cases.length > 0, "cases must be a non-empty array");

  for (const row of suite.cases) {
    ensure(typeof row.id === "string" && row.id, "each case needs an id");
    ensure(typeof row.description === "string" && row.description, `case ${row.id} needs description`);
    ensure(row.request && typeof row.request === "object", `case ${row.id} needs request`);
    ensure(
      row.request.action === "chat" || row.request.action === "generate_report",
      `case ${row.id} request.action must be chat or generate_report`
    );
    ensure(row.request.pet?.species === "dog", `case ${row.id} pet.species must be dog`);
    ensure(Array.isArray(row.request.messages) && row.request.messages.length > 0, `case ${row.id} needs messages`);
    ensure(row.expectations && typeof row.expectations === "object", `case ${row.id} needs expectations`);
  }
}

function resolveSession(payload) {
  return payload?.session && typeof payload.session === "object" ? payload.session : {};
}

function buildAuthHeaders() {
  const apiKey = String(process.env.HF_SIDECAR_API_KEY || "").trim();
  if (!apiKey) return {};
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

async function fetchReadiness(baseUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readinessTimeoutMs);
  try {
    const routeUrl = new URL(readinessRoutePath, baseUrl).toString();
    const response = await fetch(routeUrl, {
      method: "GET",
      headers: buildAuthHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { routeUrl, status: response.status, ok: response.ok, body: parsed, rawText: text };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runPreflight(baseUrl) {
  const readinessResponse = await fetchReadiness(baseUrl);
  if (!readinessResponse.ok || readinessResponse.body?.ok !== true) {
    const detail =
      readinessResponse.body?.error ||
      readinessResponse.rawText ||
      `status ${readinessResponse.status}`;
    throw new Error(
      `Sidecar readiness preflight failed at ${readinessResponse.routeUrl}: ${detail}`
    );
  }

  const readiness = readinessResponse.body?.readiness || {};
  const requiredServices = Array.isArray(sidecarRegistry) ? sidecarRegistry.length : 5;
  const configuredCount = Number(readiness.configuredCount || 0);
  const healthyCount = Number(readiness.healthyCount || 0);
  const stubCount = Number(readiness.stubCount || 0);
  const blockers = [];

  if (configuredCount < requiredServices) {
    blockers.push(
      `configured=${configuredCount}/${requiredServices}; all sidecars must be configured`
    );
  }
  if (healthyCount < requiredServices) {
    blockers.push(
      `healthy=${healthyCount}/${requiredServices}; all sidecars must be healthy`
    );
  }
  if (stubCount > 0) {
    blockers.push(`stub=${stubCount}; live baseline forbids stub sidecars`);
  }

  return {
    performedAt: new Date().toISOString(),
    routeUrl: readinessResponse.routeUrl,
    ready: blockers.length === 0,
    requiredServices,
    configuredCount,
    healthyCount,
    stubCount,
    blockers,
    readiness,
  };
}

function resolveReport(payload) {
  return payload?.report && typeof payload.report === "object" ? payload.report : {};
}

function getExtractedAnswers(payload) {
  const session = resolveSession(payload);
  return session.extracted_answers && typeof session.extracted_answers === "object"
    ? session.extracted_answers
    : {};
}

function getAnsweredQuestions(payload) {
  const session = resolveSession(payload);
  return Array.isArray(session.answered_questions) ? session.answered_questions : [];
}

function getKnownSymptoms(payload) {
  const session = resolveSession(payload);
  return Array.isArray(session.known_symptoms) ? session.known_symptoms : [];
}

function getRedFlags(payload) {
  const session = resolveSession(payload);
  return Array.isArray(session.red_flags_triggered) ? session.red_flags_triggered : [];
}

function addCheck(checks, name, pass, expected, actual) {
  checks.push({ name, pass, expected, actual });
}

function evaluateExpectations(payload, expectations) {
  const checks = [];
  const session = resolveSession(payload);
  const report = resolveReport(payload);
  const answeredQuestions = getAnsweredQuestions(payload);
  const knownSymptoms = getKnownSymptoms(payload);
  const extractedAnswers = getExtractedAnswers(payload);
  const redFlags = getRedFlags(payload);
  const message = String(payload?.message || "");

  if (expectations.responseType !== undefined) {
    addCheck(checks, "responseType", payload?.type === expectations.responseType, expectations.responseType, payload?.type);
  }
  if (expectations.readyForReport !== undefined) {
    addCheck(
      checks,
      "readyForReport",
      payload?.ready_for_report === expectations.readyForReport,
      expectations.readyForReport,
      payload?.ready_for_report
    );
  }
  if (expectations.conversationState !== undefined) {
    addCheck(
      checks,
      "conversationState",
      payload?.conversationState === expectations.conversationState,
      expectations.conversationState,
      payload?.conversationState
    );
  }
  if (expectations.lastQuestionAsked !== undefined) {
    addCheck(
      checks,
      "lastQuestionAsked",
      session?.last_question_asked === expectations.lastQuestionAsked,
      expectations.lastQuestionAsked,
      session?.last_question_asked
    );
  }
  for (const questionId of expectations.answeredQuestionsInclude || []) {
    addCheck(
      checks,
      `answeredQuestionsInclude:${questionId}`,
      answeredQuestions.includes(questionId),
      true,
      answeredQuestions.includes(questionId)
    );
  }
  for (const questionId of expectations.answeredQuestionsExclude || []) {
    addCheck(
      checks,
      `answeredQuestionsExclude:${questionId}`,
      !answeredQuestions.includes(questionId),
      true,
      !answeredQuestions.includes(questionId)
    );
  }
  for (const symptomId of expectations.knownSymptomsInclude || []) {
    addCheck(
      checks,
      `knownSymptomsInclude:${symptomId}`,
      knownSymptoms.includes(symptomId),
      true,
      knownSymptoms.includes(symptomId)
    );
  }
  for (const symptomId of expectations.knownSymptomsExclude || []) {
    addCheck(
      checks,
      `knownSymptomsExclude:${symptomId}`,
      !knownSymptoms.includes(symptomId),
      true,
      !knownSymptoms.includes(symptomId)
    );
  }
  for (const [key, expectedValue] of Object.entries(expectations.extractedAnswersMatch || {})) {
    addCheck(
      checks,
      `extractedAnswersMatch:${key}`,
      extractedAnswers[key] === expectedValue,
      expectedValue,
      extractedAnswers[key]
    );
  }
  for (const flag of expectations.redFlagsInclude || []) {
    addCheck(checks, `redFlagsInclude:${flag}`, redFlags.includes(flag), true, redFlags.includes(flag));
  }
  if (expectations.reportRecommendation !== undefined) {
    addCheck(
      checks,
      "reportRecommendation",
      report?.recommendation === expectations.reportRecommendation,
      expectations.reportRecommendation,
      report?.recommendation
    );
  }
  if (expectations.reportSeverity !== undefined) {
    addCheck(
      checks,
      "reportSeverity",
      report?.severity === expectations.reportSeverity,
      expectations.reportSeverity,
      report?.severity
    );
  }
  for (const snippet of expectations.messageIncludes || []) {
    addCheck(checks, `messageIncludes:${snippet}`, message.includes(snippet), true, message.includes(snippet));
  }

  const totalChecks = checks.length;
  const passedChecks = checks.filter((row) => row.pass).length;
  const score = totalChecks > 0 ? passedChecks / totalChecks : 1;

  return {
    totalChecks,
    passedChecks,
    failedChecks: totalChecks - passedChecks,
    score,
    pass: totalChecks === 0 ? true : passedChecks === totalChecks,
    checks,
  };
}

async function runCase(baseUrl, row) {
  const apiUrl = new URL("/api/ai/symptom-chat", baseUrl).toString();
  const startedAt = Date.now();
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row.request),
  });
  const payload = await response.json();
  return {
    status: response.status,
    payload,
    durationMs: Date.now() - startedAt,
  };
}

function summarizeResults(caseResults) {
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((row) => row.evaluation.pass).length;
  const meanScore =
    totalCases > 0
      ? caseResults.reduce((sum, row) => sum + row.evaluation.score, 0) / totalCases
      : 0;
  const emergencyCases = caseResults.filter(
    (row) => row.expectations.responseType === "emergency"
  );
  const emergencyMisses = emergencyCases.filter((row) => row.actualType !== "emergency").length;

  return {
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    meanScore: Number(meanScore.toFixed(4)),
    emergencyCaseCount: emergencyCases.length,
    emergencyMissCount: emergencyMisses,
  };
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const suite = loadSuite(options.input);
  validateSuite(suite);

  if (options.dryRun) {
    const report = {
      mode: "dry-run",
      generatedAt: new Date().toISOString(),
      suiteId: suite.suite_id,
      species: suite.species,
      caseCount: suite.cases.length,
      cases: suite.cases.map((row) => ({
        id: row.id,
        description: row.description,
        expectedResponseType: row.expectations.responseType || null,
      })),
    };
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Validated ${suite.cases.length} benchmark case(s)`);
    console.log(`Wrote dry-run report to ${options.output}`);
    return;
  }

  const preflight = options.skipPreflight
    ? {
        performedAt: new Date().toISOString(),
        routeUrl: new URL(readinessRoutePath, options.baseUrl).toString(),
        ready: false,
        requiredServices: Array.isArray(sidecarRegistry) ? sidecarRegistry.length : 5,
        configuredCount: 0,
        healthyCount: 0,
        stubCount: 0,
        blockers: ["preflight skipped by operator"],
        readiness: null,
      }
    : await runPreflight(options.baseUrl);

  if (!options.skipPreflight && !preflight.ready) {
    throw new Error(
      `Refusing live benchmark run because sidecar preflight is not ready: ${preflight.blockers.join("; ")}`
    );
  }

  const caseResults = [];
  for (const row of suite.cases) {
    const startedAt = new Date().toISOString();
    const live = await runCase(options.baseUrl, row);
    const evaluation = evaluateExpectations(live.payload, row.expectations || {});
    caseResults.push({
      id: row.id,
      description: row.description,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: live.durationMs,
      httpStatus: live.status,
      actualType: live.payload?.type || null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      weight: typeof row.weight === "number" ? row.weight : 1,
      riskTier: typeof row.risk_tier === "string" ? row.risk_tier : null,
      complaintFamilyTags: Array.isArray(row.complaint_family_tags)
        ? row.complaint_family_tags
        : [],
      mustNotMissMarker: row.must_not_miss_marker === true,
      evaluation,
      expectations: row.expectations || {},
    });
  }

  const report = {
    mode: "live",
    generatedAt: new Date().toISOString(),
    suiteId: suite.suite_id,
    species: suite.species,
    baseUrl: options.baseUrl,
    preflight,
    summary: summarizeResults(caseResults),
    cases: caseResults,
  };

  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Ran ${caseResults.length} benchmark case(s) against ${options.baseUrl}`);
  console.log(`Wrote live report to ${options.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
