"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS keeps the helper consumable from both the ESM runner and Jest tests. */

const os = require("node:os");
const path = require("node:path");

const DEFAULT_BASE_URL = "https://pawvital-ai.vercel.app";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TURNS = 8;

const REQUIRED_OWNER_TURNS = Object.freeze([
  {
    id: "initial_complaint",
    phase: "initial complaint",
    text: "Coughing",
  },
  {
    id: "cough_type",
    phase: "first cough-type answer",
    text: "It is a dry honking cough.",
  },
]);

const SAFE_FOLLOW_UP_ANSWERS = Object.freeze([
  {
    id: "cough_duration",
    pattern: /how long|duration|when did (?:it|the coughing) start/i,
    text: "It started about two days ago.",
  },
  {
    id: "cough_timing",
    pattern: /when does (?:the )?cough|at rest|after exercise|at night/i,
    text: "Mostly after excitement and sometimes at night.",
  },
  {
    id: "exercise_intolerance",
    pattern: /tire more easily|exercise|walks|play|activity/i,
    text: "No. Energy is normal during walks and play.",
  },
  {
    id: "breathing_rate",
    pattern: /breaths|breathing rate|15 seconds|per minute/i,
    text: "Resting breathing is about 24 breaths per minute.",
  },
  {
    id: "nasal_discharge",
    pattern: /nasal|discharge|runny nose|sneez/i,
    text: "No nasal discharge.",
  },
  {
    id: "breathing_status",
    pattern: /how is .*breathing|breathing right now|labored|noisy/i,
    text: "Breathing looks normal right now.",
  },
  {
    id: "gum_color",
    pattern: /gum|gums|color/i,
    text: "Gums look pink.",
  },
]);

const FORBIDDEN_OWNER_PHRASES = Object.freeze([
  "breathing trouble",
  "blue gums",
  "collapse",
  "blood",
  "seizure",
]);

const FORBIDDEN_LEAKAGE_MARKERS = Object.freeze([
  "secondOpinionTrace",
  "shadowReadout",
  "eligibility_reason",
  "request_outcome",
  "shadow_comparison",
]);

const JSON_TELEMETRY_PATTERNS = Object.freeze([
  /\{[\s\S]{0,700}"(?:secondOpinionTrace|shadowReadout|eligibility_reason|request_outcome|shadow_comparison|system_observability|shadow_comparisons|case_memory)"\s*:[\s\S]{0,700}\}/gi,
  /\[[\s\S]{0,700}\{[\s\S]{0,700}"(?:event|telemetry|trace|shadow)"\s*:[\s\S]{0,700}\}[\s\S]{0,700}\]/gi,
]);

function resolveDefaultProfileDir(env = process.env) {
  const root =
    env.PAWVITAL_SECOND_OPINION_USER_DATA_DIR ||
    env.LOCALAPPDATA ||
    path.join(os.homedir(), ".pawvital");
  return path.join(root, "pawvital-vet-1549c-live-tester-profile");
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_BASE_URL).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid --base-url: ${raw}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("--base-url must use http or https");
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function parseBooleanFlagValue(name, value) {
  if (value === undefined) return true;
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  throw new Error(`${name} must be true or false when a value is provided`);
}

function parsePositiveInt(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function parseArgs(argv, env = process.env) {
  const options = {
    baseUrl: normalizeBaseUrl(
      env.PAWVITAL_SECOND_OPINION_BASE_URL || DEFAULT_BASE_URL
    ),
    dryRun: false,
    headless: false,
    help: false,
    json: false,
    maxTurns: DEFAULT_MAX_TURNS,
    output: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    userDataDir: resolveDefaultProfileDir(env),
    executablePath: env.PAWVITAL_SECOND_OPINION_CHROME_PATH || null,
  };

  const args = [...argv];
  for (let index = 0; index < args.length; index += 1) {
    const rawArg = args[index];
    const [name, inlineValue] = rawArg.includes("=")
      ? rawArg.split(/=(.*)/s, 2)
      : [rawArg, undefined];

    function readValue(label) {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= args.length || args[index].startsWith("--")) {
        throw new Error(`${label} requires a value`);
      }
      return args[index];
    }

    switch (name) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = parseBooleanFlagValue(name, inlineValue);
        break;
      case "--json":
        options.json = parseBooleanFlagValue(name, inlineValue);
        break;
      case "--headless":
        options.headless = parseBooleanFlagValue(name, inlineValue);
        break;
      case "--headed":
        options.headless = !parseBooleanFlagValue(name, inlineValue);
        break;
      case "--base-url":
        options.baseUrl = normalizeBaseUrl(readValue(name));
        break;
      case "--user-data-dir":
        options.userDataDir = path.resolve(readValue(name));
        break;
      case "--executable-path":
        options.executablePath = path.resolve(readValue(name));
        break;
      case "--timeout-ms":
        options.timeoutMs = parsePositiveInt(readValue(name), name);
        break;
      case "--max-turns":
        options.maxTurns = parsePositiveInt(readValue(name), name);
        break;
      case "--output":
        options.output = path.resolve(readValue(name));
        break;
      default:
        throw new Error(`Unknown option: ${rawArg}`);
    }
  }

  return options;
}

function buildHelpText() {
  return [
    "VET-1549C production-safe second-opinion live tester",
    "",
    "Usage:",
    "  node scripts/vet-1541c-second-opinion-live-tester.mjs --dry-run",
    "  node scripts/vet-1541c-second-opinion-live-tester.mjs --user-data-dir <already-authenticated-browser-profile>",
    "",
    "Options:",
    "  --help, -h                 Show this help.",
    "  --dry-run                  Print the planned cough flow without opening a browser.",
    "  --json                     Print sanitized JSON instead of text.",
    "  --base-url <url>           App URL. Default: https://pawvital-ai.vercel.app",
    "  --user-data-dir <path>     Existing authenticated Playwright/Chrome profile directory.",
    "  --executable-path <path>   Optional Chrome/Chromium executable path.",
    "  --headless                 Run the authenticated browser profile headlessly.",
    "  --headed                   Run with a visible browser. Default.",
    "  --timeout-ms <ms>          Per-step timeout. Default: 45000.",
    "  --max-turns <count>        Maximum safe follow-up answers after cough type. Default: 8.",
    "  --output <path>            Write sanitized checklist JSON.",
    "",
    "Safety:",
    "  - The script never accepts credentials, cookies, auth links, or bearer tokens.",
    "  - It refuses when the browser session is unauthenticated or not allowlisted.",
    "  - It drives only the authenticated UI and does not call debug/admin APIs.",
    "  - It does not promote model flags or change runtime configuration.",
  ].join("\n");
}

function getDryRunSummary(options) {
  return {
    mode: "dry_run",
    baseUrl: options.baseUrl,
    flow: {
      requiredOwnerTurns: REQUIRED_OWNER_TURNS,
      safeFollowUpAnswers: SAFE_FOLLOW_UP_ANSWERS.map(({ id, text }) => ({
        id,
        text,
      })),
      forbiddenOwnerPhrases: FORBIDDEN_OWNER_PHRASES,
    },
    leakageMarkers: FORBIDDEN_LEAKAGE_MARKERS,
    checks: [
      "Refuse if redirected to login or access_required.",
      "Refuse if a saved dog profile is not visible.",
      "Submit Coughing.",
      "Require a cough-type prompt before submitting the exact dry honking answer.",
      "Continue safe non-emergency answers until the final report appears or max turns is reached.",
      "Scan final report and visible history report text for telemetry/debug leakage.",
    ],
  };
}

function formatDryRunSummary(summary) {
  const lines = [
    "VET-1549C second-opinion live tester dry run",
    "",
    `Target: ${summary.baseUrl}`,
    "",
    "Required owner turns:",
  ];

  for (const turn of summary.flow.requiredOwnerTurns) {
    lines.push(`- ${turn.phase}: ${turn.text}`);
  }

  lines.push("", "Safe follow-up answer bank:");
  for (const answer of summary.flow.safeFollowUpAnswers) {
    lines.push(`- ${answer.id}: ${answer.text}`);
  }

  lines.push("", "Forbidden leakage markers:");
  for (const marker of summary.leakageMarkers) {
    lines.push(`- ${marker}`);
  }

  lines.push("", "Checklist:");
  for (const check of summary.checks) {
    lines.push(`- ${check}`);
  }

  return lines.join("\n");
}

function isCoughTypePrompt(text) {
  return /cough sound|dry\/honking|wet\/productive|gagging/i.test(
    String(text || "")
  );
}

function selectSafeFollowUpAnswer(questionText) {
  const text = String(questionText || "");
  return SAFE_FOLLOW_UP_ANSWERS.find((candidate) =>
    candidate.pattern.test(text)
  );
}

function scanVisibleTextForLeakage(text) {
  const source = String(text || "");
  const findings = [];

  for (const marker of FORBIDDEN_LEAKAGE_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = source.match(new RegExp(escaped, "g")) || [];
    if (matches.length > 0) {
      findings.push({
        marker,
        occurrences: matches.length,
      });
    }
  }

  let rawJsonTelemetryBlocks = 0;
  for (const pattern of JSON_TELEMETRY_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = source.match(pattern);
    rawJsonTelemetryBlocks += matches ? matches.length : 0;
  }

  if (rawJsonTelemetryBlocks > 0) {
    findings.push({
      marker: "raw_json_telemetry_block",
      occurrences: rawJsonTelemetryBlocks,
    });
  }

  return findings;
}

function redactSensitive(value) {
  return String(value || "")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/Cookie:\s*[^\r\n]+/gi, "Cookie: [redacted]")
    .replace(
      /\b(sb-[A-Za-z0-9_-]+-auth-token(?:\.\d+)?)=[^;\s]+/gi,
      "$1=[redacted]"
    )
    .replace(
      /\b(access_token|refresh_token|id_token|token|code|password|secret)=([^&\s]+)/gi,
      "$1=[redacted]"
    )
    .replace(
      /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
      "[redacted-token]"
    )
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted-token]");
}

function buildChecklistResult(input) {
  const leakageFindings = input.leakageFindings || [];
  const blockingFailures = [
    !input.authenticated && "authenticated_browser_session",
    !input.savedDogProfile && "saved_dog_profile",
    !input.requiredCoughFlowCompleted && "required_cough_flow",
    !input.finalReportFound && "final_report",
    leakageFindings.length > 0 && "owner_visible_leakage",
  ].filter(Boolean);

  const warningFailures = [
    !input.historyReportScanned && "history_report_scan",
  ].filter(Boolean);

  const overallStatus =
    blockingFailures.length > 0
      ? "fail"
      : warningFailures.length > 0
        ? "needs_review"
        : "pass";

  return {
    ticket: "VET-1549C",
    mode: input.mode || "live",
    overallStatus,
    checks: {
      authenticatedBrowserSession: Boolean(input.authenticated),
      savedDogProfile: Boolean(input.savedDogProfile),
      requiredCoughFlowCompleted: Boolean(input.requiredCoughFlowCompleted),
      finalReportFound: Boolean(input.finalReportFound),
      historyReportScanned: Boolean(input.historyReportScanned),
      ownerVisibleLeakageFree: leakageFindings.length === 0,
    },
    leakageFindings,
    turnsCompleted: input.turnsCompleted || [],
    notes: (input.notes || []).map(redactSensitive),
    blockingFailures,
    warningFailures,
  };
}

function formatChecklistResult(result) {
  const statusLabel = result.overallStatus.toUpperCase();
  const lines = [
    `VET-1549C second-opinion live tester: ${statusLabel}`,
    "",
    "Admin checklist:",
    `- authenticated browser session: ${result.checks.authenticatedBrowserSession ? "PASS" : "FAIL"}`,
    `- saved dog profile visible: ${result.checks.savedDogProfile ? "PASS" : "FAIL"}`,
    `- required cough flow completed: ${result.checks.requiredCoughFlowCompleted ? "PASS" : "FAIL"}`,
    `- final report appears: ${result.checks.finalReportFound ? "PASS" : "FAIL"}`,
    `- history report scanned: ${result.checks.historyReportScanned ? "PASS" : "WARN"}`,
    `- owner-visible telemetry leakage: ${result.checks.ownerVisibleLeakageFree ? "PASS" : "FAIL"}`,
  ];

  if (result.leakageFindings.length > 0) {
    lines.push("", "Leakage markers found:");
    for (const finding of result.leakageFindings) {
      lines.push(`- ${finding.marker}: ${finding.occurrences}`);
    }
  } else {
    lines.push("", "Leakage markers found: none");
  }

  if (result.turnsCompleted.length > 0) {
    lines.push("", "Turns completed:");
    for (const turn of result.turnsCompleted) {
      lines.push(`- ${turn}`);
    }
  }

  if (result.notes.length > 0) {
    lines.push("", "Notes:");
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TURNS,
  DEFAULT_TIMEOUT_MS,
  FORBIDDEN_LEAKAGE_MARKERS,
  FORBIDDEN_OWNER_PHRASES,
  REQUIRED_OWNER_TURNS,
  SAFE_FOLLOW_UP_ANSWERS,
  buildChecklistResult,
  buildHelpText,
  formatChecklistResult,
  formatDryRunSummary,
  getDryRunSummary,
  isCoughTypePrompt,
  normalizeBaseUrl,
  parseArgs,
  redactSensitive,
  resolveDefaultProfileDir,
  scanVisibleTextForLeakage,
  selectSafeFollowUpAnswer,
};
