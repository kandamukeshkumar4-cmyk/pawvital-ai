#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("node:module");

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TEST_PATH = path.join(ROOT, "tests", "benchmark.route-sentinels.test.ts");
const FIXTURE_PATH = path.join(
  ROOT,
  "tests",
  "fixtures",
  "clinical",
  "route-sentinel-replay-cases.json"
);
const BENCHMARK_PATH = path.join(
  ROOT,
  "data",
  "benchmarks",
  "dog-triage",
  "gold-v1-enriched.jsonl"
);

function parseArgs(argv) {
  const args = { outputPath: null };

  for (const arg of argv) {
    if (arg.startsWith("--output=")) {
      args.outputPath = path.resolve(ROOT, arg.slice("--output=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function toRepoRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function countValues(values) {
  return values.reduce((acc, value) => {
    const key = String(value);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    throw new Error(`${label} is empty: ${filePath}`);
  }

  return JSON.parse(raw);
}

function normalizeFixtureCase(fixture) {
  const mockExtraction = normalizeObject(fixture.mockExtraction);
  const seedSession = normalizeObject(fixture.seedSession);
  const expected = normalizeObject(fixture.expected);

  return {
    benchmarkId: String(fixture.benchmarkId || ""),
    mode: String(fixture.mode || ""),
    message:
      fixture.message === undefined || fixture.message === null
        ? null
        : String(fixture.message),
    mockExtraction: {
      symptoms: normalizeStringArray(mockExtraction.symptoms),
      answers: normalizeObject(mockExtraction.answers),
    },
    seedSession:
      Object.keys(seedSession).length === 0
        ? null
        : {
            knownSymptoms: normalizeStringArray(seedSession.knownSymptoms),
            lastQuestionAsked:
              seedSession.lastQuestionAsked === undefined
                ? null
                : String(seedSession.lastQuestionAsked),
          },
    expected: {
      allowedTypes: normalizeStringArray(expected.allowedTypes),
      knownSymptoms: normalizeStringArray(expected.knownSymptoms),
      redFlags: normalizeStringArray(expected.redFlags),
      reasonCode:
        expected.reasonCode === undefined || expected.reasonCode === null
          ? null
          : String(expected.reasonCode),
    },
  };
}

function readFixturePack() {
  const parsed = readJsonFile(FIXTURE_PATH, "fixture pack");
  if (!Array.isArray(parsed)) {
    throw new Error("Fixture pack must be a JSON array.");
  }

  const cases = parsed.map(normalizeFixtureCase);
  const reasonCodes = cases
    .map((fixture) => fixture.expected.reasonCode)
    .filter((reasonCode) => reasonCode !== null);

  return {
    totalCases: cases.length,
    modeCounts: countValues(cases.map((fixture) => fixture.mode)),
    expectedTypeCounts: countValues(
      cases.flatMap((fixture) => fixture.expected.allowedTypes)
    ),
    expectedReasonCodeCounts: countValues(reasonCodes),
    cases,
  };
}

function readBenchmarkMap() {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    throw new Error(`Missing benchmark source: ${BENCHMARK_PATH}`);
  }

  const raw = fs.readFileSync(BENCHMARK_PATH, "utf8").trim();
  if (!raw) {
    throw new Error(`Benchmark source is empty: ${BENCHMARK_PATH}`);
  }

  const entries = raw.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid benchmark JSON on line ${index + 1}: ${message}`);
    }
  });

  return new Map(entries.map((entry) => [String(entry.id), entry]));
}

function stringifyLogArg(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function captureConsole(run) {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const logs = { log: [], warn: [], error: [] };

  console.log = (...args) => {
    logs.log.push(args.map(stringifyLogArg).join(" "));
  };
  console.warn = (...args) => {
    logs.warn.push(args.map(stringifyLogArg).join(" "));
  };
  console.error = (...args) => {
    logs.error.push(args.map(stringifyLogArg).join(" "));
  };

  return Promise.resolve()
    .then(run)
    .then((value) => ({ value, logs }))
    .finally(() => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    });
}

function buildCoreMocks() {
  return {
    "next/server": {
      NextResponse: {
        json(body, init = {}) {
          return new Response(JSON.stringify(body), {
            status: init.status ?? 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
    "@/lib/rate-limit": {
      symptomChatLimiter: {},
      checkRateLimit: async () => ({
        success: true,
        reset: Date.now() + 60_000,
      }),
      getRateLimitId: () => "route-sentinel-report",
    },
    "@/lib/supabase-server": {
      createServerSupabaseClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: null },
          }),
        },
      }),
    },
  };
}

function buildNvidiaMocks(state) {
  return {
    "@/lib/nvidia-models": {
      isNvidiaConfigured: () => true,
      extractWithQwen: async () => JSON.stringify(state.currentExtraction),
      phraseWithLlama: async () => "QUESTION_ID:generic",
      reviewQuestionPlanWithNemotron: async () =>
        JSON.stringify({
          include_image_context: false,
          use_deterministic_fallback: true,
          reason: "route-sentinel-report",
        }),
      verifyQuestionWithNemotron: async () =>
        JSON.stringify({ message: "Can you tell me a bit more?" }),
      diagnoseWithDeepSeek: async () =>
        JSON.stringify({
          severity: "medium",
          recommendation: "vet_48h",
          title: "Mock diagnosis",
          explanation: "Mock explanation",
          differential_diagnoses: [],
          clinical_notes: "Mock notes",
          recommended_tests: [],
          home_care: [],
          actions: [],
          warning_signs: [],
          vet_questions: [],
        }),
      verifyWithGLM: async () =>
        JSON.stringify({
          safe: true,
          corrections: {},
          reasoning: "Mock verification",
        }),
      runVisionPipeline: async () => null,
      parseVisionForMatrix: () => ({
        symptoms: [],
        redFlags: [],
        severityClass: "normal",
      }),
      imageGuardrail: () => ({
        triggered: false,
        flags: [],
        blockFurtherAnalysis: false,
      }),
    },
    "@/lib/image-gate": {
      evaluateImageGate: async () => null,
      shouldAnalyzeWoundImage: () => false,
    },
    "@/lib/bayesian-scorer": {
      computeBayesianScore: async () => [],
    },
  };
}

function buildEnrichmentMocks() {
  return {
    "@/lib/pet-enrichment": {
      detectBreedWithNyckel: async () => null,
      fetchBreedProfile: async () => null,
      getEffectivePetProfile: (pet) => pet,
      isLikelyDogContext: () => true,
      runRoboflowSkinWorkflow: async () => ({
        positive: false,
        summary: "",
        labels: [],
      }),
      shouldUseImageInferredBreed: () => false,
    },
    "@/lib/knowledge-retrieval": {
      buildReferenceImageQuery: () => "",
      buildKnowledgeSearchQuery: () => "",
      searchClinicalCases: async () => [],
      formatClinicalCaseContext: () => "",
    },
    "@/lib/minimax": {
      isMiniMaxConfigured: () => true,
      compressCaseMemoryWithMiniMax: async () => ({
        summary: "Mock summary",
        model: "MiniMax-M2.7",
      }),
    },
  };
}

function buildSidecarMocks() {
  return {
    "@/lib/hf-sidecars": {
      isVisionPreprocessConfigured: () => false,
      isRetrievalSidecarConfigured: () => false,
      isMultimodalConsultConfigured: () => false,
      isAsyncReviewServiceConfigured: () => false,
      isAbortLikeError: () => false,
      preprocessVeterinaryImage: async () => null,
      preprocessVeterinaryImageWithResult: async () => ({
        ok: true,
        data: null,
        latencyMs: 1,
        service: "vision-preprocess-service",
      }),
      consultWithMultimodalSidecar: async () => null,
      consultWithMultimodalSidecarWithResult: async () => ({
        ok: true,
        data: null,
        latencyMs: 1,
        service: "multimodal-consult-service",
      }),
      retrieveVeterinaryEvidenceFromSidecar: async () => ({
        textChunks: [],
        imageMatches: [],
        rerankScores: [],
        sourceCitations: [],
      }),
      retrieveVeterinaryTextEvidenceFromSidecarWithResult: async () => ({
        ok: true,
        data: { textChunks: [], rerankScores: [], sourceCitations: [] },
        latencyMs: 1,
        service: "text-retrieval-service",
      }),
      retrieveVeterinaryImageEvidenceFromSidecarWithResult: async () => ({
        ok: true,
        data: { imageMatches: [], sourceCitations: [] },
        latencyMs: 1,
        service: "image-retrieval-service",
      }),
    },
    "@/lib/text-retrieval-service": {
      isTextRetrievalConfigured: () => false,
      retrieveVeterinaryTextEvidence: async () => ({
        textChunks: [],
        rerankScores: [],
        sourceCitations: [],
      }),
    },
    "@/lib/image-retrieval-service": {
      isImageRetrievalConfigured: () => false,
      retrieveVeterinaryImageEvidence: async () => ({
        imageMatches: [],
        sourceCitations: [],
      }),
    },
  };
}

function buildPersistenceMocks() {
  return {
    "@/lib/async-review-client": {
      enqueueAsyncReview: async () => true,
    },
    "@/lib/confidence-calibrator": {
      calibrateDiagnosticConfidence: ({ baseConfidence }) => ({
        final_confidence: baseConfidence,
        base_confidence: baseConfidence,
        adjustments: [],
        confidence_level: "moderate",
        recommendation: "No significant adjustments needed",
      }),
    },
    "@/lib/icd-10-mapper": {
      getICD10CodesForDisease: () => null,
      generateICD10Summary: () => [],
    },
    "@/lib/report-storage": {
      saveSymptomReportToDB: async () => null,
    },
    "@/lib/events/event-bus": {
      EventType: {
        REPORT_READY: "REPORT_READY",
        URGENCY_HIGH: "URGENCY_HIGH",
        OUTCOME_REQUESTED: "OUTCOME_REQUESTED",
        SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
        PET_ADDED: "PET_ADDED",
      },
      emit: () => undefined,
    },
    "@/lib/events/notification-handler": {},
  };
}

function buildMockModules(state) {
  return new Map(
    Object.entries({
      ...buildCoreMocks(),
      ...buildNvidiaMocks(state),
      ...buildEnrichmentMocks(),
      ...buildSidecarMocks(),
      ...buildPersistenceMocks(),
    })
  );
}

function installModuleMocks(state) {
  const originalLoad = Module._load;
  const mockModules = buildMockModules(state);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (mockModules.has(request)) {
      return mockModules.get(request);
    }

    if (request.startsWith("@/")) {
      return originalLoad.call(
        this,
        path.join(ROOT, "src", request.slice(2)),
        parent,
        isMain
      );
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    Module._load = originalLoad;
  };
}

function registerTypeScriptRuntime() {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
    module: "CommonJS",
    moduleResolution: "Node",
    esModuleInterop: true,
    target: "ES2022",
  });

  require("ts-node/register/transpile-only");
}

function createRuntime() {
  registerTypeScriptRuntime();

  const state = {
    currentExtraction: {
      symptoms: [],
      answers: {},
    },
  };
  const restoreMocks = installModuleMocks(state);
  const triageEngine = require(path.join(ROOT, "src", "lib", "triage-engine.ts"));
  const routeModule = require(
    path.join(ROOT, "src", "app", "api", "ai", "symptom-chat", "route.ts")
  );

  return {
    POST: routeModule.POST,
    addSymptoms: triageEngine.addSymptoms,
    createSession: triageEngine.createSession,
    setExtraction(nextExtraction) {
      state.currentExtraction = {
        symptoms: normalizeStringArray(nextExtraction?.symptoms),
        answers: normalizeObject(nextExtraction?.answers),
      };
    },
    cleanup() {
      restoreMocks();
    },
  };
}

function buildSeededSession(runtime, fixture) {
  let session = runtime.createSession();

  for (const symptom of fixture.seedSession?.knownSymptoms ?? []) {
    session = runtime.addSymptoms(session, [symptom]);
  }

  if (!fixture.seedSession?.lastQuestionAsked) {
    return session;
  }

  return {
    ...session,
    last_question_asked: fixture.seedSession.lastQuestionAsked,
  };
}

function buildRequest(session, pet, message) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      pet,
      session,
      messages: [{ role: "user", content: message }],
    }),
  });
}

function containsAll(actualValues, expectedValues) {
  const actualSet = new Set(Array.isArray(actualValues) ? actualValues : []);
  return expectedValues.every((value) => actualSet.has(value));
}

function buildCheck(name, passed, expected, actual) {
  return { name, passed, expected, actual };
}

function buildMissingBenchmarkResult(fixture) {
  return {
    benchmarkId: fixture.benchmarkId,
    mode: fixture.mode,
    passed: false,
    checks: [buildCheck("benchmark_case_exists", false, true, false)],
    error: "Benchmark case not found in gold-v1-enriched.jsonl.",
  };
}

function buildActualResult(response, payload, durationMs) {
  return {
    statusCode: response.status,
    type: payload.type ?? null,
    readyForReport:
      payload.ready_for_report === undefined ? null : payload.ready_for_report,
    reasonCode: payload.reason_code ?? null,
    terminalState: payload.terminal_state ?? null,
    knownSymptoms: payload.session?.known_symptoms ?? [],
    redFlags: payload.session?.red_flags_triggered ?? [],
    durationMs,
  };
}

function buildChecks(fixture, actual) {
  const checks = [
    buildCheck("response_status_200", actual.statusCode === 200, 200, actual.statusCode),
    buildCheck(
      "response_type_allowed",
      fixture.expected.allowedTypes.includes(actual.type),
      fixture.expected.allowedTypes,
      actual.type
    ),
    buildCheck(
      "known_symptoms_present",
      containsAll(actual.knownSymptoms, fixture.expected.knownSymptoms),
      fixture.expected.knownSymptoms,
      actual.knownSymptoms
    ),
  ];

  if (fixture.expected.redFlags.length > 0) {
    checks.push(
      buildCheck(
        "red_flags_present",
        containsAll(actual.redFlags, fixture.expected.redFlags),
        fixture.expected.redFlags,
        actual.redFlags
      )
    );
  }

  if (actual.type === "emergency") {
    checks.push(
      buildCheck(
        "emergency_ready_for_report",
        actual.readyForReport === true,
        true,
        actual.readyForReport
      )
    );
  }

  if (actual.type === "cannot_assess") {
    checks.push(
      buildCheck(
        "cannot_assess_not_ready_for_report",
        actual.readyForReport === false,
        false,
        actual.readyForReport
      )
    );
    checks.push(
      buildCheck(
        "cannot_assess_reason_code",
        actual.reasonCode === fixture.expected.reasonCode,
        fixture.expected.reasonCode,
        actual.reasonCode
      )
    );
    checks.push(
      buildCheck(
        "cannot_assess_terminal_state",
        actual.terminalState === "cannot_assess",
        "cannot_assess",
        actual.terminalState
      )
    );
  }

  return checks;
}

async function runFixture(runtime, fixture, benchmark) {
  if (!benchmark) {
    return buildMissingBenchmarkResult(fixture);
  }

  runtime.setExtraction(fixture.mockExtraction);

  const message =
    fixture.message ?? benchmark.request?.messages?.[0]?.content ?? "";
  const session = buildSeededSession(runtime, fixture);
  const request = buildRequest(session, benchmark.request?.pet, message);
  const startedAt = Date.now();

  try {
    const { value, logs } = await captureConsole(async () => {
      const response = await runtime.POST(request);
      const payload = await response.json();
      return { response, payload };
    });

    const durationMs = Date.now() - startedAt;
    const actual = buildActualResult(value.response, value.payload, durationMs);
    const checks = buildChecks(fixture, actual);
    const passed = checks.every((check) => check.passed);

    return {
      benchmarkId: fixture.benchmarkId,
      mode: fixture.mode,
      passed,
      requestMessage: message,
      expected: fixture.expected,
      actual,
      checks,
      logSummary: {
        logCount: logs.log.length,
        warnCount: logs.warn.length,
        errorCount: logs.error.length,
      },
      logs: passed
        ? undefined
        : {
            log: logs.log,
            warn: logs.warn,
            error: logs.error,
          },
    };
  } catch (error) {
    return {
      benchmarkId: fixture.benchmarkId,
      mode: fixture.mode,
      passed: false,
      requestMessage: message,
      expected: fixture.expected,
      checks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildGuardChecks(fixturePack) {
  const firstTurnCount = fixturePack.cases.filter(
    (fixture) => fixture.mode === "first_turn"
  ).length;
  const followupUnknownCount = fixturePack.cases.filter(
    (fixture) => fixture.mode === "followup_unknown"
  ).length;

  return [
    buildCheck("pack_total_cases", fixturePack.totalCases >= 24, ">=24", fixturePack.totalCases),
    buildCheck("pack_first_turn_cases", firstTurnCount >= 18, ">=18", firstTurnCount),
    buildCheck(
      "pack_followup_unknown_cases",
      followupUnknownCount >= 4,
      ">=4",
      followupUnknownCount
    ),
  ];
}

function summarizeResults(guardChecks, results) {
  const passedCases = results.filter((result) => result.passed).length;
  const actualTypeCounts = countValues(
    results
      .map((result) => result.actual?.type)
      .filter((value) => typeof value === "string")
  );
  const allChecks = [
    ...guardChecks,
    ...results.flatMap((result) => result.checks ?? []),
  ];
  const passedChecks = allChecks.filter((check) => check.passed).length;

  return {
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    totalChecks: allChecks.length,
    passedChecks,
    failedChecks: allChecks.length - passedChecks,
    actualTypeCounts,
  };
}

function buildSuiteMetadata(argv) {
  return {
    paritySource: toRepoRelative(TEST_PATH),
    fixturePath: toRepoRelative(FIXTURE_PATH),
    benchmarkPath: toRepoRelative(BENCHMARK_PATH),
    executionMode: "direct_route_replay",
    command: {
      program: "node",
      args: [toRepoRelative(SCRIPT_PATH), ...argv],
    },
  };
}

function writeOutput(report, outputPath) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }

  process.stdout.write(serialized);
}

function buildFailureReport(error, fixturePack, argv) {
  return {
    generatedAt: new Date().toISOString(),
    reporter: "route-sentinel-report",
    status: "error",
    suite: buildSuiteMetadata(argv),
    fixturePack,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let fixturePack = null;
  let runtime = null;

  try {
    fixturePack = readFixturePack();
    const benchmarkMap = readBenchmarkMap();
    const guardChecks = buildGuardChecks(fixturePack);
    runtime = createRuntime();
    const results = [];

    for (const fixture of fixturePack.cases) {
      results.push(
        await runFixture(runtime, fixture, benchmarkMap.get(fixture.benchmarkId))
      );
    }

    const summary = summarizeResults(guardChecks, results);
    const overallPassed =
      guardChecks.every((check) => check.passed) &&
      results.every((result) => result.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      reporter: "route-sentinel-report",
      status: overallPassed ? "passed" : "failed",
      suite: buildSuiteMetadata(process.argv.slice(2)),
      fixturePack,
      guardChecks,
      summary,
      results,
    };

    writeOutput(report, args.outputPath);
    process.exit(overallPassed ? 0 : 1);
  } catch (error) {
    const failureReport = buildFailureReport(
      error,
      fixturePack,
      process.argv.slice(2)
    );
    writeOutput(failureReport, args.outputPath);
    process.exit(1);
  } finally {
    runtime?.cleanup?.();
  }
}

await main();
