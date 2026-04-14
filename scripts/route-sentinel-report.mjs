#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");

const ROOT = process.cwd();
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
const OUTPUT_ARG_PREFIX = "--output=";
const outputArg = process.argv.find((arg) => arg.startsWith(OUTPUT_ARG_PREFIX));
const outputPath = outputArg
  ? path.resolve(ROOT, outputArg.slice(OUTPUT_ARG_PREFIX.length))
  : null;

function toRepoRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function countValues(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function stringifyLogArg(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readFixturePack() {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`Missing fixture pack: ${FIXTURE_PATH}`);
  }

  const raw = fs.readFileSync(FIXTURE_PATH, "utf8").trim();
  if (!raw) {
    throw new Error(`Fixture pack is empty: ${FIXTURE_PATH}`);
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Fixture pack must be a JSON array.");
  }

  const cases = parsed.map((fixture) => ({
    benchmarkId: String(fixture.benchmarkId || ""),
    mode: String(fixture.mode || ""),
    message:
      fixture.message === undefined || fixture.message === null
        ? null
        : String(fixture.message),
    mockExtraction: {
      symptoms: Array.isArray(fixture.mockExtraction?.symptoms)
        ? fixture.mockExtraction.symptoms.map(String)
        : [],
      answers:
        fixture.mockExtraction?.answers &&
        typeof fixture.mockExtraction.answers === "object"
          ? fixture.mockExtraction.answers
          : {},
    },
    seedSession:
      fixture.seedSession && typeof fixture.seedSession === "object"
        ? {
            knownSymptoms: Array.isArray(fixture.seedSession.knownSymptoms)
              ? fixture.seedSession.knownSymptoms.map(String)
              : [],
            lastQuestionAsked:
              fixture.seedSession.lastQuestionAsked === undefined
                ? null
                : String(fixture.seedSession.lastQuestionAsked),
          }
        : null,
    expected: {
      allowedTypes: Array.isArray(fixture.expected?.allowedTypes)
        ? fixture.expected.allowedTypes.map(String)
        : [],
      knownSymptoms: Array.isArray(fixture.expected?.knownSymptoms)
        ? fixture.expected.knownSymptoms.map(String)
        : [],
      redFlags: Array.isArray(fixture.expected?.redFlags)
        ? fixture.expected.redFlags.map(String)
        : [],
      reasonCode:
        fixture.expected?.reasonCode === undefined
          ? null
          : String(fixture.expected.reasonCode),
    },
  }));

  return {
    totalCases: cases.length,
    modeCounts: countValues(cases.map((fixture) => fixture.mode)),
    expectedTypeCounts: countValues(
      cases.flatMap((fixture) => fixture.expected.allowedTypes)
    ),
    expectedReasonCodeCounts: countValues(
      cases
        .map((fixture) => fixture.expected.reasonCode)
        .filter((reasonCode) => reasonCode !== null)
    ),
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

  return new Map(
    raw
      .split(/\r?\n/)
      .map((line) => JSON.parse(line))
      .map((entry) => [String(entry.id), entry])
  );
}

function captureConsole(run) {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const logs = {
    log: [],
    warn: [],
    error: [],
  };

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

function installModuleMocks(state) {
  const originalLoad = Module._load;
  const mockModules = new Map();

  mockModules.set("next/server", {
    NextResponse: {
      json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });

  mockModules.set("@/lib/rate-limit", {
    symptomChatLimiter: {},
    checkRateLimit: async () => ({
      success: true,
      reset: Date.now() + 60_000,
    }),
    getRateLimitId: () => "route-sentinel-report",
  });

  mockModules.set("@/lib/supabase-server", {
    createServerSupabaseClient: async () => ({
      auth: {
        getUser: async () => ({
          data: {
            user: null,
          },
        }),
      },
    }),
  });

  mockModules.set("@/lib/nvidia-models", {
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
  });

  mockModules.set("@/lib/image-gate", {
    evaluateImageGate: async () => null,
    shouldAnalyzeWoundImage: () => false,
  });

  mockModules.set("@/lib/bayesian-scorer", {
    computeBayesianScore: async () => [],
  });

  mockModules.set("@/lib/pet-enrichment", {
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
  });

  mockModules.set("@/lib/knowledge-retrieval", {
    buildReferenceImageQuery: () => "",
    buildKnowledgeSearchQuery: () => "",
    searchClinicalCases: async () => [],
    formatClinicalCaseContext: () => "",
  });

  mockModules.set("@/lib/minimax", {
    isMiniMaxConfigured: () => true,
    compressCaseMemoryWithMiniMax: async () => ({
      summary: "Mock summary",
      model: "MiniMax-M2.7",
    }),
  });

  mockModules.set("@/lib/hf-sidecars", {
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
  });

  mockModules.set("@/lib/text-retrieval-service", {
    isTextRetrievalConfigured: () => false,
    retrieveVeterinaryTextEvidence: async () => ({
      textChunks: [],
      rerankScores: [],
      sourceCitations: [],
    }),
  });

  mockModules.set("@/lib/image-retrieval-service", {
    isImageRetrievalConfigured: () => false,
    retrieveVeterinaryImageEvidence: async () => ({
      imageMatches: [],
      sourceCitations: [],
    }),
  });

  mockModules.set("@/lib/async-review-client", {
    enqueueAsyncReview: async () => true,
  });

  mockModules.set("@/lib/confidence-calibrator", {
    calibrateDiagnosticConfidence: ({ baseConfidence }) => ({
      final_confidence: baseConfidence,
      base_confidence: baseConfidence,
      adjustments: [],
      confidence_level: "moderate",
      recommendation: "No significant adjustments needed",
    }),
  });

  mockModules.set("@/lib/icd-10-mapper", {
    getICD10CodesForDisease: () => null,
    generateICD10Summary: () => [],
  });

  mockModules.set("@/lib/report-storage", {
    saveSymptomReportToDB: async () => null,
  });

  mockModules.set("@/lib/events/event-bus", {
    EventType: {
      REPORT_READY: "REPORT_READY",
      URGENCY_HIGH: "URGENCY_HIGH",
      OUTCOME_REQUESTED: "OUTCOME_REQUESTED",
      SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
      PET_ADDED: "PET_ADDED",
    },
    emit: () => undefined,
  });

  mockModules.set("@/lib/events/notification-handler", {});

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

function createRuntime() {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
    module: "CommonJS",
    moduleResolution: "Node",
    esModuleInterop: true,
    target: "ES2022",
  });

  require("ts-node/register/transpile-only");

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
        symptoms: Array.isArray(nextExtraction?.symptoms)
          ? nextExtraction.symptoms
          : [],
        answers:
          nextExtraction?.answers && typeof nextExtraction.answers === "object"
            ? nextExtraction.answers
            : {},
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

  if (fixture.seedSession?.lastQuestionAsked) {
    session.last_question_asked = fixture.seedSession.lastQuestionAsked;
  }

  return session;
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

function summarizeCheck(name, passed, expected, actual) {
  return { name, passed, expected, actual };
}

async function runFixture(runtime, fixture, benchmark) {
  const checks = [];

  if (!benchmark) {
    return {
      benchmarkId: fixture.benchmarkId,
      mode: fixture.mode,
      passed: false,
      error: "Benchmark case not found in gold-v1-enriched.jsonl.",
      checks: [
        summarizeCheck("benchmark_case_exists", false, true, false),
      ],
    };
  }

  runtime.setExtraction(fixture.mockExtraction);

  const message =
    fixture.message ?? benchmark.request?.messages?.[0]?.content ?? "";
  const request = buildRequest(
    buildSeededSession(runtime, fixture),
    benchmark.request?.pet,
    message
  );

  try {
    const { value, logs } = await captureConsole(async () => {
      const response = await runtime.POST(request);
      const payload = await response.json();
      return { response, payload };
    });

    const { response, payload } = value;
    const actualKnownSymptoms = payload.session?.known_symptoms ?? [];
    const actualRedFlags = payload.session?.red_flags_triggered ?? [];

    checks.push(
      summarizeCheck("response_status_200", response.status === 200, 200, response.status)
    );
    checks.push(
      summarizeCheck(
        "response_type_allowed",
        fixture.expected.allowedTypes.includes(payload.type),
        fixture.expected.allowedTypes,
        payload.type
      )
    );
    checks.push(
      summarizeCheck(
        "known_symptoms_present",
        containsAll(actualKnownSymptoms, fixture.expected.knownSymptoms),
        fixture.expected.knownSymptoms,
        actualKnownSymptoms
      )
    );

    if (fixture.expected.redFlags.length > 0) {
      checks.push(
        summarizeCheck(
          "red_flags_present",
          containsAll(actualRedFlags, fixture.expected.redFlags),
          fixture.expected.redFlags,
          actualRedFlags
        )
      );
    }

    if (payload.type === "emergency") {
      checks.push(
        summarizeCheck(
          "emergency_ready_for_report",
          payload.ready_for_report === true,
          true,
          payload.ready_for_report
        )
      );
    }

    if (payload.type === "cannot_assess") {
      checks.push(
        summarizeCheck(
          "cannot_assess_not_ready_for_report",
          payload.ready_for_report === false,
          false,
          payload.ready_for_report
        )
      );
      checks.push(
        summarizeCheck(
          "cannot_assess_reason_code",
          payload.reason_code === fixture.expected.reasonCode,
          fixture.expected.reasonCode,
          payload.reason_code ?? null
        )
      );
      checks.push(
        summarizeCheck(
          "cannot_assess_terminal_state",
          payload.terminal_state === "cannot_assess",
          "cannot_assess",
          payload.terminal_state ?? null
        )
      );
    }

    const passed = checks.every((check) => check.passed);

    return {
      benchmarkId: fixture.benchmarkId,
      mode: fixture.mode,
      passed,
      expected: fixture.expected,
      actual: {
        statusCode: response.status,
        type: payload.type ?? null,
        readyForReport:
          payload.ready_for_report === undefined ? null : payload.ready_for_report,
        reasonCode: payload.reason_code ?? null,
        terminalState: payload.terminal_state ?? null,
        knownSymptoms: actualKnownSymptoms,
        redFlags: actualRedFlags,
      },
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
      error: error instanceof Error ? error.message : String(error),
      checks,
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
    summarizeCheck("pack_total_cases", fixturePack.totalCases >= 24, ">=24", fixturePack.totalCases),
    summarizeCheck("pack_first_turn_cases", firstTurnCount >= 18, ">=18", firstTurnCount),
    summarizeCheck(
      "pack_followup_unknown_cases",
      followupUnknownCount >= 4,
      ">=4",
      followupUnknownCount
    ),
  ];
}

function writeOutput(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }

  process.stdout.write(serialized);
}

function buildFailureReport(error, fixturePack) {
  return {
    generatedAt: new Date().toISOString(),
    reporter: "route-sentinel-report",
    status: "error",
    suite: {
      npmScript: "eval:benchmark:route-sentinels:report",
      paritySource: toRepoRelative(TEST_PATH),
      fixturePath: toRepoRelative(FIXTURE_PATH),
      benchmarkPath: toRepoRelative(BENCHMARK_PATH),
      executionMode: "direct_route_replay",
      command: {
        program: "node",
        args: ["scripts/route-sentinel-report.mjs"],
      },
    },
    fixturePack,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function main() {
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

    const passedCases = results.filter((result) => result.passed).length;
    const failedCases = results.length - passedCases;
    const actualTypeCounts = countValues(
      results
        .map((result) => result.actual?.type)
        .filter((value) => typeof value === "string")
    );
    const overallPassed =
      guardChecks.every((check) => check.passed) &&
      results.every((result) => result.passed);

    const report = {
      generatedAt: new Date().toISOString(),
      reporter: "route-sentinel-report",
      status: overallPassed ? "passed" : "failed",
      suite: {
        npmScript: "eval:benchmark:route-sentinels:report",
        paritySource: toRepoRelative(TEST_PATH),
        fixturePath: toRepoRelative(FIXTURE_PATH),
        benchmarkPath: toRepoRelative(BENCHMARK_PATH),
        executionMode: "direct_route_replay",
        command: {
          program: "node",
          args: ["scripts/route-sentinel-report.mjs"],
        },
      },
      fixturePack,
      guardChecks,
      summary: {
        totalCases: results.length,
        passedCases,
        failedCases,
        actualTypeCounts,
      },
      results,
    };

    writeOutput(report);
    process.exit(overallPassed ? 0 : 1);
  } catch (error) {
    writeOutput(buildFailureReport(error, fixturePack));
    process.exit(1);
  } finally {
    runtime?.cleanup?.();
  }
}

await main();
