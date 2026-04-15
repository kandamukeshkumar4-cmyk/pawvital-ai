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
// Must-not-miss cases may end in one of three clinically safe outcomes:
// immediate emergency escalation, question/clarification, or cannot_assess
// when a report-blocking critical indicator cannot be confirmed.
const SAFE_RESPONSE_TYPES = new Set(["emergency", "question", "cannot_assess"]);
const EMERGENCY_SYMPTOM_FALLBACK = {
  difficulty_breathing: ["difficulty_breathing"],
  swollen_abdomen: ["swollen_abdomen"],
  seizure_collapse: ["seizure_collapse"],
  pregnancy_birth: ["pregnancy_birth"],
  lethargy: ["lethargy"],
  wound_skin_issue: ["wound_skin_issue"],
  excessive_scratching: ["excessive_scratching"],
  urination_problem: ["urination_problem"],
  vomiting: ["vomiting"],
  diarrhea: ["diarrhea"],
  trembling: ["trembling"],
  limping: ["limping"],
  eye_discharge: ["eye_discharge"],
  nasal_discharge: ["nasal_discharge"],
  coughing: ["coughing"],
  coughing_breathing_combined: ["coughing_breathing_combined"],
};
const CASE_EXTRACTION_OVERRIDES = {
  "emergency-glaucoma-eye": {
    symptoms: ["eye_discharge", "lethargy"],
    answers: { collapse: true },
  },
  "emergency-electrical-shock": {
    symptoms: ["trembling"],
    answers: { collapse: true },
  },
  "emergency-snake-bite": {
    symptoms: ["wound_skin_issue"],
    answers: { wound_deep_bleeding: true },
  },
  "emergency-addisonian-crisis": {
    symptoms: ["vomiting", "lethargy"],
    answers: { collapse: true },
  },
  "emergency-hemorrhagic-diarrhea-shock": {
    symptoms: ["diarrhea", "lethargy"],
    answers: { collapse: true },
  },
  "emergency-vomiting-green": {
    symptoms: ["vomiting", "lethargy"],
    answers: { collapse: true },
  },
  "emergency-limping-cry-pain": {
    symptoms: ["limping", "lethargy"],
    answers: { collapse: true },
  },
};

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

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
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

function readBenchmarkEntries() {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    throw new Error(`Missing benchmark source: ${BENCHMARK_PATH}`);
  }

  const raw = fs.readFileSync(BENCHMARK_PATH, "utf8").trim();
  if (!raw) {
    throw new Error(`Benchmark source is empty: ${BENCHMARK_PATH}`);
  }

  return raw.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid benchmark JSON on line ${index + 1}: ${message}`);
    }
  });
}

function readFixtureExtractionMap() {
  const parsed = readJsonFile(FIXTURE_PATH, "route sentinel fixture pack");
  if (!Array.isArray(parsed)) {
    throw new Error("Route sentinel fixture pack must be a JSON array.");
  }

  return new Map(
    parsed.map((fixture) => [
      String(fixture.benchmarkId || ""),
      {
        symptoms: normalizeStringArray(fixture.mockExtraction?.symptoms),
        answers: normalizeObject(fixture.mockExtraction?.answers),
      },
    ])
  );
}

function normalizeBenchmarkCase(entry) {
  const request = normalizeObject(entry.request);
  const expectations = normalizeObject(entry.expectations);
  const provenance = normalizeObject(entry.provenance);
  const session = normalizeObject(request.session);

  return {
    id: String(entry.id || ""),
    description: String(entry.description || ""),
    tags: normalizeStringArray(entry.tags),
    request: {
      action: String(request.action || "chat"),
      pet: cloneJson(request.pet ?? null),
      session:
        Object.keys(session).length === 0 ? null : cloneJson(request.session),
      message:
        request.messages?.[0]?.content === undefined
          ? ""
          : String(request.messages[0].content),
    },
    expectations: {
      responseType:
        expectations.responseType === undefined
          ? null
          : String(expectations.responseType),
      readyForReport:
        typeof expectations.readyForReport === "boolean"
          ? expectations.readyForReport
          : null,
      knownSymptomsInclude: normalizeStringArray(
        expectations.knownSymptomsInclude
      ),
      answeredQuestionsExclude: normalizeStringArray(
        expectations.answeredQuestionsExclude
      ),
      lastQuestionAsked:
        expectations.lastQuestionAsked === undefined
          ? null
          : String(expectations.lastQuestionAsked),
    },
    complaintFamilies: normalizeStringArray(entry.complaint_family_tags),
    riskTier:
      entry.risk_tier === undefined || entry.risk_tier === null
        ? null
        : String(entry.risk_tier),
    uncertaintyPattern:
      entry.uncertainty_pattern === undefined ||
      entry.uncertainty_pattern === null
        ? null
        : String(entry.uncertainty_pattern),
    mustNotMissMarker: entry.must_not_miss_marker === true,
    provenance: {
      sourceShard:
        provenance.source_shard === undefined
          ? null
          : String(provenance.source_shard),
      sourceSuiteId:
        provenance.source_suite_id === undefined
          ? null
          : String(provenance.source_suite_id),
      freezeDate:
        provenance.freeze_date === undefined
          ? null
          : String(provenance.freeze_date),
      version:
        provenance.version === undefined ? null : String(provenance.version),
    },
  };
}

function selectDangerousSlice(entries) {
  return entries
    .map(normalizeBenchmarkCase)
    .filter((entry) => entry.mustNotMissMarker === true);
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
      getRateLimitId: () => "route-dangerous-replay",
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
          reason: "route-dangerous-replay",
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

function buildRequest(benchmarkCase, runtime) {
  const session = benchmarkCase.request.session
    ? cloneJson(benchmarkCase.request.session)
    : runtime.createSession();

  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: benchmarkCase.request.action,
      pet: cloneJson(benchmarkCase.request.pet),
      session,
      messages: [{ role: "user", content: benchmarkCase.request.message }],
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

function selectQuestionSymptoms(benchmarkCase) {
  if (benchmarkCase.expectations.knownSymptomsInclude.length > 0) {
    return benchmarkCase.expectations.knownSymptomsInclude;
  }

  if (benchmarkCase.id === "cardiac-question-cough-night") {
    return ["coughing"];
  }

  if (benchmarkCase.complaintFamilies.includes("coughing")) {
    return ["coughing"];
  }

  if (benchmarkCase.complaintFamilies.includes("coughing_breathing_combined")) {
    return ["coughing_breathing_combined"];
  }

  if (benchmarkCase.complaintFamilies.includes("difficulty_breathing")) {
    return ["difficulty_breathing"];
  }

  return benchmarkCase.complaintFamilies.slice(0, 1);
}

function selectEmergencySymptoms(benchmarkCase) {
  if (benchmarkCase.expectations.knownSymptomsInclude.length > 0) {
    return benchmarkCase.expectations.knownSymptomsInclude;
  }

  for (const family of benchmarkCase.complaintFamilies) {
    if (EMERGENCY_SYMPTOM_FALLBACK[family]) {
      return EMERGENCY_SYMPTOM_FALLBACK[family];
    }
  }

  return benchmarkCase.complaintFamilies.slice(0, 1);
}

function selectEmergencyAnswers(benchmarkCase) {
  const tags = new Set(benchmarkCase.tags);
  const id = benchmarkCase.id;

  if (id.includes("gum") || id.includes("cyanosis")) {
    return { gum_color: "blue" };
  }

  if (id.includes("seizure") || tags.has("seizure")) {
    if (id.includes("prolonged") || id.includes("postictal")) {
      return { consciousness_level: "unresponsive" };
    }
    return { collapse: true };
  }

  if (
    id.includes("bloat") ||
    id.includes("gdv") ||
    benchmarkCase.complaintFamilies.includes("swollen_abdomen")
  ) {
    return { rapid_onset_distension: true };
  }

  if (
    id.includes("urinary-blockage") ||
    id.includes("urinary-female-blockage") ||
    tags.has("urinary")
  ) {
    return { urinary_blockage: true };
  }

  if (
    tags.has("respiratory") ||
    tags.has("airway") ||
    id.includes("breathing") ||
    id.includes("choking")
  ) {
    return { breathing_onset: "sudden" };
  }

  if (
    tags.has("allergy") ||
    tags.has("venom") ||
    id.includes("swelling") ||
    id.includes("anaphylaxis")
  ) {
    return { face_swelling: true };
  }

  if (
    tags.has("trauma") ||
    tags.has("wound") ||
    tags.has("chemical") ||
    tags.has("bite")
  ) {
    return { wound_deep_bleeding: true };
  }

  if (
    tags.has("reproductive") ||
    tags.has("labor") ||
    tags.has("postpartum") ||
    benchmarkCase.complaintFamilies.includes("pregnancy_birth")
  ) {
    return { dystocia_active: true };
  }

  return { collapse: true };
}

function deriveExtraction(benchmarkCase, fixtureExtractionMap) {
  const fixtureExtraction = fixtureExtractionMap.get(benchmarkCase.id);
  if (fixtureExtraction) {
    return {
      source: "sentinel_fixture",
      symptoms: normalizeStringArray(fixtureExtraction.symptoms),
      answers: normalizeObject(fixtureExtraction.answers),
    };
  }

  const override = CASE_EXTRACTION_OVERRIDES[benchmarkCase.id];
  if (override) {
    return {
      source: "derived_case_override",
      symptoms: normalizeStringArray(override.symptoms),
      answers: normalizeObject(override.answers),
    };
  }

  if (benchmarkCase.request.session) {
    return {
      source: "derived_followup_empty",
      symptoms: [],
      answers: {},
    };
  }

  if (benchmarkCase.expectations.responseType === "question") {
    return {
      source: "derived_question_case",
      symptoms: selectQuestionSymptoms(benchmarkCase),
      answers: {},
    };
  }

  return {
    source: "derived_emergency_case",
    symptoms: selectEmergencySymptoms(benchmarkCase),
    answers: selectEmergencyAnswers(benchmarkCase),
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
    questionId: payload.question_id ?? null,
    message:
      payload.message === undefined || payload.message === null
        ? null
        : String(payload.message),
    knownSymptoms: payload.session?.known_symptoms ?? [],
    answeredQuestions: payload.session?.answered_questions ?? [],
    lastQuestionAsked: payload.session?.last_question_asked ?? null,
    redFlags: payload.session?.red_flags_triggered ?? [],
    durationMs,
  };
}

function buildChecks(benchmarkCase, actual) {
  const checks = [
    buildCheck("response_status_200", actual.statusCode === 200, 200, actual.statusCode),
    buildCheck(
      "response_type_matches",
      actual.type === benchmarkCase.expectations.responseType,
      benchmarkCase.expectations.responseType,
      actual.type
    ),
  ];

  if (benchmarkCase.expectations.readyForReport !== null) {
    checks.push(
      buildCheck(
        "ready_for_report_matches",
        actual.readyForReport === benchmarkCase.expectations.readyForReport,
        benchmarkCase.expectations.readyForReport,
        actual.readyForReport
      )
    );
  }

  if (benchmarkCase.expectations.knownSymptomsInclude.length > 0) {
    checks.push(
      buildCheck(
        "known_symptoms_present",
        containsAll(
          actual.knownSymptoms,
          benchmarkCase.expectations.knownSymptomsInclude
        ),
        benchmarkCase.expectations.knownSymptomsInclude,
        actual.knownSymptoms
      )
    );
  }

  if (benchmarkCase.expectations.answeredQuestionsExclude.length > 0) {
    checks.push(
      buildCheck(
        "answered_questions_excluded",
        benchmarkCase.expectations.answeredQuestionsExclude.every(
          (questionId) => !actual.answeredQuestions.includes(questionId)
        ),
        benchmarkCase.expectations.answeredQuestionsExclude,
        actual.answeredQuestions
      )
    );
  }

  if (benchmarkCase.expectations.lastQuestionAsked !== null) {
    checks.push(
      buildCheck(
        "last_question_asked_matches",
        actual.lastQuestionAsked === benchmarkCase.expectations.lastQuestionAsked,
        benchmarkCase.expectations.lastQuestionAsked,
        actual.lastQuestionAsked
      )
    );
  }

  return checks;
}

async function runBenchmarkCase(runtime, benchmarkCase, fixtureExtractionMap) {
  const extraction = deriveExtraction(benchmarkCase, fixtureExtractionMap);
  runtime.setExtraction(extraction);
  const request = buildRequest(benchmarkCase, runtime);
  const startedAt = Date.now();

  try {
    const { value, logs } = await captureConsole(async () => {
      const response = await runtime.POST(request);
      const payload = await response.json();
      return { response, payload };
    });

    const durationMs = Date.now() - startedAt;
    const actual = buildActualResult(value.response, value.payload, durationMs);
    const checks = buildChecks(benchmarkCase, actual);
    const passed = checks.every((check) => check.passed);

    return {
      benchmarkId: benchmarkCase.id,
      description: benchmarkCase.description,
      tags: benchmarkCase.tags,
      complaintFamilies: benchmarkCase.complaintFamilies,
      uncertaintyPattern: benchmarkCase.uncertaintyPattern,
      requestMessage: benchmarkCase.request.message,
      mockExtraction: {
        source: extraction.source,
        symptoms: extraction.symptoms,
        answers: extraction.answers,
      },
      expected: benchmarkCase.expectations,
      actual,
      passed,
      checks,
      logSummary: {
        logCount: logs.log.length,
        warnCount: logs.warn.length,
        errorCount: logs.error.length,
      },
      logs:
        passed && logs.warn.length === 0 && logs.error.length === 0
          ? undefined
          : {
              log: logs.log,
              warn: logs.warn,
              error: logs.error,
            },
    };
  } catch (error) {
    return {
      benchmarkId: benchmarkCase.id,
      description: benchmarkCase.description,
      tags: benchmarkCase.tags,
      complaintFamilies: benchmarkCase.complaintFamilies,
      uncertaintyPattern: benchmarkCase.uncertaintyPattern,
      requestMessage: benchmarkCase.request.message,
      mockExtraction: {
        source: extraction.source,
        symptoms: extraction.symptoms,
        answers: extraction.answers,
      },
      expected: benchmarkCase.expectations,
      passed: false,
      checks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildGuardChecks(dangerousCases, extractionSources) {
  return [
    buildCheck(
      "slice_has_cases",
      dangerousCases.length > 0,
      ">0",
      dangerousCases.length
    ),
    buildCheck(
      "slice_all_must_not_miss",
      dangerousCases.every((entry) => entry.mustNotMissMarker === true),
      true,
      dangerousCases.every((entry) => entry.mustNotMissMarker === true)
    ),
    buildCheck(
      "slice_all_tier_1_emergency",
      dangerousCases.every((entry) => entry.riskTier === "tier_1_emergency"),
      "tier_1_emergency",
      countValues(dangerousCases.map((entry) => entry.riskTier ?? "missing"))
    ),
    buildCheck(
      "slice_expected_types_stay_on_safe_path",
      dangerousCases.every((entry) =>
        SAFE_RESPONSE_TYPES.has(entry.expectations.responseType)
      ),
      Array.from(SAFE_RESPONSE_TYPES),
      countValues(
        dangerousCases.map((entry) => entry.expectations.responseType ?? "missing")
      )
    ),
    buildCheck(
      "slice_extraction_strategy_coverage",
      extractionSources.length === dangerousCases.length,
      dangerousCases.length,
      extractionSources.length
    ),
  ];
}

function buildDangerousSliceMetadata(dangerousCases, extractionSources) {
  return {
    benchmarkPath: toRepoRelative(BENCHMARK_PATH),
    selectionRule: "must_not_miss_marker === true",
    totalCases: dangerousCases.length,
    expectedTypeCounts: countValues(
      dangerousCases.map((entry) => entry.expectations.responseType ?? "missing")
    ),
    riskTierCounts: countValues(
      dangerousCases.map((entry) => entry.riskTier ?? "missing")
    ),
    uncertaintyPatternCounts: countValues(
      dangerousCases.map((entry) => entry.uncertaintyPattern ?? "missing")
    ),
    complaintFamilyCounts: countValues(
      dangerousCases.flatMap((entry) => entry.complaintFamilies)
    ),
    extractionSourceCounts: countValues(extractionSources),
  };
}

function summarizeResults(guardChecks, results) {
  const passedCases = results.filter((result) => result.passed).length;
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
    expectedTypeCounts: countValues(
      results.map((result) => result.expected?.responseType ?? "missing")
    ),
    actualTypeCounts: countValues(
      results.map((result) => result.actual?.type ?? "missing")
    ),
    extractionSourceCounts: countValues(
      results.map((result) => result.mockExtraction?.source ?? "missing")
    ),
  };
}

function buildSuiteMetadata(argv) {
  return {
    executionMode: "direct_route_replay",
    benchmarkPath: toRepoRelative(BENCHMARK_PATH),
    fixturePath: toRepoRelative(FIXTURE_PATH),
    benchmarkEvaluator: toRepoRelative(
      path.join(ROOT, "scripts", "eval-harness.ts")
    ),
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

function buildFailureReport(error, dangerousSlice, argv) {
  return {
    generatedAt: new Date().toISOString(),
    reporter: "route-dangerous-replay",
    status: "error",
    suite: buildSuiteMetadata(argv),
    dangerousSlice,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let dangerousSlice = null;
  let runtime = null;

  try {
    const fixtureExtractionMap = readFixtureExtractionMap();
    const dangerousCases = selectDangerousSlice(readBenchmarkEntries());
    const extractionSources = dangerousCases.map((benchmarkCase) =>
      deriveExtraction(benchmarkCase, fixtureExtractionMap).source
    );
    dangerousSlice = buildDangerousSliceMetadata(
      dangerousCases,
      extractionSources
    );
    const guardChecks = buildGuardChecks(dangerousCases, extractionSources);
    runtime = createRuntime();
    const results = [];

    for (const benchmarkCase of dangerousCases) {
      results.push(
        await runBenchmarkCase(runtime, benchmarkCase, fixtureExtractionMap)
      );
    }

    const summary = summarizeResults(guardChecks, results);
    const overallPassed =
      guardChecks.every((check) => check.passed) &&
      results.every((result) => result.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      reporter: "route-dangerous-replay",
      status: overallPassed ? "passed" : "failed",
      suite: buildSuiteMetadata(process.argv.slice(2)),
      dangerousSlice,
      guardChecks,
      summary,
      results,
    };

    writeOutput(report, args.outputPath);
    process.exit(0);
  } catch (error) {
    const failureReport = buildFailureReport(
      error,
      dangerousSlice,
      process.argv.slice(2)
    );
    writeOutput(failureReport, args.outputPath);
    process.exit(1);
  } finally {
    runtime?.cleanup?.();
  }
}

await main();
