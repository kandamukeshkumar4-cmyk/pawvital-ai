#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPLAINT_MODULE_PATTERNS = [
  "src/lib/clinical-intelligence/complaint-modules/**",
  "tests/clinical-intelligence/complaint-modules*.test.ts",
  "docs/clinical-intelligence/complaint-modules*.md",
];

export const VET_KNOWLEDGE_PATTERNS = [
  "src/lib/clinical-intelligence/vet-knowledge/**",
  "tests/clinical-intelligence/vet-knowledge-*.test.ts",
  "docs/clinical-intelligence/vet-knowledge-*.md",
];

export const PROTECTED_CLINICAL_RUNTIME_PATTERNS = [
  "src/app/api/ai/symptom-chat/route.ts",
  "src/lib/triage-engine.ts",
  "src/lib/clinical-matrix.ts",
  "src/lib/symptom-memory.ts",
];

export const PLANNER_RUNTIME_PATTERNS = [
  "src/lib/clinical-intelligence/next-question-planner.ts",
  "src/app/api/triage/next/route.ts",
];

export const EMERGENCY_SENTINEL_PATTERNS = [
  "scripts/check-emergency-sentinels.mjs",
  "scripts/route-sentinel-report.mjs",
  "tests/benchmark.route-sentinels.test.ts",
  "tests/fixtures/clinical/route-sentinel-replay-cases.json",
  "data/benchmarks/dog-triage/gold-v1-enriched.jsonl",
];

export const PROTECTED_WORKFLOW_PATTERNS = [
  ".github/workflows/**",
  ".github/actions/**",
];

export const PROTECTED_INFRA_PATTERNS = [
  "deploy/**",
  "scripts/runpod-*.mjs",
  "scripts/*sidecar*.mjs",
  "scripts/sync-sidecar-vercel-envs.mjs",
  "scripts/verify-sidecars.mjs",
  "vercel.json",
  ".env*",
];

const THIS_FILE = fileURLToPath(import.meta.url);

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function normalizeChangedFilePath(filePath) {
  return String(filePath ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

export function normalizeChangedFiles(files = []) {
  const uniquePaths = new Set();

  for (const filePath of files) {
    const normalized = normalizeChangedFilePath(filePath);
    if (normalized.length > 0) {
      uniquePaths.add(normalized);
    }
  }

  return [...uniquePaths];
}

export function globToRegExp(globPattern) {
  let output = "^";

  for (let index = 0; index < globPattern.length; index += 1) {
    const current = globPattern[index];
    const next = globPattern[index + 1];

    if (current === "*" && next === "*" && globPattern[index + 2] === "/") {
      output += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (current === "*" && next === "*") {
      output += ".*";
      index += 1;
      continue;
    }

    if (current === "*") {
      output += "[^/]*";
      continue;
    }

    output += escapeRegex(current);
  }

  output += "$";
  return new RegExp(output);
}

export function pathMatchesPattern(filePath, pattern) {
  return globToRegExp(normalizeChangedFilePath(pattern)).test(
    normalizeChangedFilePath(filePath)
  );
}

export function pathMatchesAnyPattern(filePath, patterns = []) {
  return patterns.some((pattern) => pathMatchesPattern(filePath, pattern));
}

export function resolveDefaultBaseRef(cwd = process.cwd()) {
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }

  const result = spawnSync(
    "git",
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    {
      cwd,
      encoding: "utf8",
    }
  );

  if (result.status === 0) {
    const defaultRef = result.stdout.trim();
    if (defaultRef.length > 0) {
      return defaultRef;
    }
  }

  for (const branchName of ["master", "main"]) {
    const candidateRef = `origin/${branchName}`;
    ensureRemoteRefAvailable(candidateRef, cwd);

    const verifyResult = spawnSync(
      "git",
      ["rev-parse", "--verify", `${candidateRef}^{commit}`],
      {
        cwd,
        encoding: "utf8",
      }
    );

    if (verifyResult.status === 0) {
      return candidateRef;
    }
  }

  throw new Error(
    "Unable to resolve default base ref. Pass --base or provide changed files with --file."
  );
}

function ensureRemoteRefAvailable(ref, cwd) {
  if (!ref.startsWith("origin/")) {
    return;
  }

  const verifyResult = spawnSync(
    "git",
    ["rev-parse", "--verify", `${ref}^{commit}`],
    {
      cwd,
      encoding: "utf8",
    }
  );

  if (verifyResult.status === 0) {
    return;
  }

  const branchName = ref.replace(/^origin\//, "");
  spawnSync(
    "git",
    [
      "fetch",
      "--depth=1",
      "origin",
      `${branchName}:refs/remotes/origin/${branchName}`,
    ],
    {
      cwd,
      encoding: "utf8",
    }
  );
}

export function collectChangedFiles({
  changedFiles,
  baseRef,
  headRef = "HEAD",
  cwd = process.cwd(),
} = {}) {
  if (Array.isArray(changedFiles)) {
    return normalizeChangedFiles(changedFiles);
  }

  const resolvedBaseRef = baseRef ?? resolveDefaultBaseRef(cwd);
  ensureRemoteRefAvailable(resolvedBaseRef, cwd);
  const result = spawnSync(
    "git",
    ["diff", "--name-only", `${resolvedBaseRef}...${headRef}`],
    {
      cwd,
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "git diff failed";
    throw new Error(stderr);
  }

  return normalizeChangedFiles(result.stdout.split(/\r?\n/));
}

function buildFinding(code, severity, files, message) {
  return {
    code,
    severity,
    files: [...files],
    message,
  };
}

function summarizePhrases(result) {
  const phrases = [];

  if (result.categories.complaintModulesChanged) {
    phrases.push(
      `Complaint-module surfaces changed (${result.matches.complaintModuleFiles.length}).`
    );
  }

  if (result.categories.vetKnowledgeChanged) {
    phrases.push(
      `Vet-knowledge surfaces changed (${result.matches.vetKnowledgeFiles.length}).`
    );
  }

  if (result.categories.protectedClinicalRuntimeChanged) {
    phrases.push(
      `Protected clinical runtime files changed (${result.matches.highRiskFiles.filter((filePath) => pathMatchesAnyPattern(filePath, PROTECTED_CLINICAL_RUNTIME_PATTERNS)).length}).`
    );
  }

  if (result.categories.plannerRuntimeChanged) {
    phrases.push(
      `Planner runtime files changed (${result.matches.highRiskFiles.filter((filePath) => pathMatchesAnyPattern(filePath, PLANNER_RUNTIME_PATTERNS)).length}).`
    );
  }

  if (result.categories.emergencySentinelChanged) {
    phrases.push(
      `Emergency sentinel files changed (${result.matches.emergencySentinelFiles.length}).`
    );
  }

  if (result.categories.protectedWorkflowFilesChanged) {
    phrases.push(
      `Protected workflow files changed (${result.matches.protectedWorkflowFiles.length}).`
    );
  }

  if (result.categories.protectedInfraFilesChanged) {
    phrases.push(
      `Protected infra files changed (${result.matches.protectedInfraFiles.length}).`
    );
  }

  if (phrases.length === 0) {
    phrases.push("No flagged clinical-intelligence or protected-path changes detected.");
  }

  return phrases;
}

export function classifyClinicalPrRisk(options = {}) {
  const changedFiles = collectChangedFiles(options);
  const complaintModuleFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, COMPLAINT_MODULE_PATTERNS)
  );
  const vetKnowledgeFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, VET_KNOWLEDGE_PATTERNS)
  );
  const protectedClinicalRuntimeFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, PROTECTED_CLINICAL_RUNTIME_PATTERNS)
  );
  const plannerRuntimeFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, PLANNER_RUNTIME_PATTERNS)
  );
  const emergencySentinelFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, EMERGENCY_SENTINEL_PATTERNS)
  );
  const protectedWorkflowFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, PROTECTED_WORKFLOW_PATTERNS)
  );
  const protectedInfraFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, PROTECTED_INFRA_PATTERNS)
  );

  const highRiskFiles = normalizeChangedFiles([
    ...protectedClinicalRuntimeFiles,
    ...plannerRuntimeFiles,
  ]);

  const categories = {
    complaintModulesChanged: complaintModuleFiles.length > 0,
    vetKnowledgeChanged: vetKnowledgeFiles.length > 0,
    protectedClinicalRuntimeChanged: protectedClinicalRuntimeFiles.length > 0,
    plannerRuntimeChanged: plannerRuntimeFiles.length > 0,
    emergencySentinelChanged: emergencySentinelFiles.length > 0,
    protectedWorkflowFilesChanged: protectedWorkflowFiles.length > 0,
    protectedInfraFilesChanged: protectedInfraFiles.length > 0,
  };

  const findings = [];

  if (categories.complaintModulesChanged) {
    findings.push(
      buildFinding(
        "complaint_modules_changed",
        "warn",
        complaintModuleFiles,
        "Complaint-module surfaces changed and should keep the complaint and vet-knowledge guard suites green."
      )
    );
  }

  if (categories.vetKnowledgeChanged) {
    findings.push(
      buildFinding(
        "vet_knowledge_changed",
        "warn",
        vetKnowledgeFiles,
        "Vet-knowledge surfaces changed and should keep registry, complaint-source-map, coverage-gap, and alignment suites green."
      )
    );
  }

  if (categories.protectedClinicalRuntimeChanged) {
    findings.push(
      buildFinding(
        "protected_clinical_runtime",
        "warn",
        protectedClinicalRuntimeFiles,
        "Protected clinical runtime files changed and should be treated as high-risk."
      )
    );
  }

  if (categories.plannerRuntimeChanged) {
    findings.push(
      buildFinding(
        "planner_runtime_changed",
        "warn",
        plannerRuntimeFiles,
        "Planner runtime files changed and should be treated as high-risk."
      )
    );
  }

  if (categories.emergencySentinelChanged) {
    findings.push(
      buildFinding(
        "emergency_sentinel_changed",
        "warn",
        emergencySentinelFiles,
        "Emergency sentinel files changed and should be treated as high-risk."
      )
    );
  }

  if (categories.protectedWorkflowFilesChanged) {
    findings.push(
      buildFinding(
        "protected_workflow",
        "fail",
        protectedWorkflowFiles,
        "Protected workflow files changed and require explicit approval before automation should allow merge."
      )
    );
  }

  if (categories.protectedInfraFilesChanged) {
    findings.push(
      buildFinding(
        "protected_infra",
        "warn",
        protectedInfraFiles,
        "Protected infra files changed and should be reviewed before automation should allow merge."
      )
    );
  }

  const riskLevel =
    categories.protectedClinicalRuntimeChanged ||
    categories.plannerRuntimeChanged ||
    categories.emergencySentinelChanged ||
    categories.protectedWorkflowFilesChanged ||
    categories.protectedInfraFilesChanged
      ? "high"
      : categories.complaintModulesChanged || categories.vetKnowledgeChanged
        ? "medium"
        : "low";

  const status = categories.protectedWorkflowFilesChanged
    ? "fail"
    : findings.length > 0
      ? "warn"
      : "pass";

  const result = {
    status,
    riskLevel,
    changedFiles,
    categories,
    matches: {
      complaintModuleFiles,
      vetKnowledgeFiles,
      highRiskFiles,
      emergencySentinelFiles,
      protectedWorkflowFiles,
      protectedInfraFiles,
    },
    findings,
    summary: "",
  };

  result.summary = `${riskLevel.toUpperCase()} risk (${status}). ${summarizePhrases(result).join(" ")}`;
  return result;
}

export function renderClinicalPrRiskSummary(result) {
  const lines = [
    `Clinical PR risk classifier: ${result.riskLevel.toUpperCase()} risk (${result.status})`,
    `Changed files: ${result.changedFiles.length}`,
  ];

  for (const phrase of summarizePhrases(result)) {
    lines.push(`- ${phrase}`);
  }

  if (result.findings.length === 0) {
    lines.push("- No additional findings.");
  } else {
    lines.push("- Findings:");
    for (const finding of result.findings) {
      lines.push(
        `  ${finding.severity.toUpperCase()} ${finding.code}: ${finding.files.join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

export function readRequiredCliValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    changedFiles: [],
    json: false,
    baseRef: undefined,
    headRef: "HEAD",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--json") {
      options.json = true;
      continue;
    }

    if (current === "--file") {
      options.changedFiles.push(readRequiredCliValue(argv, index, "--file"));
      index += 1;
      continue;
    }

    if (current === "--base") {
      options.baseRef = readRequiredCliValue(argv, index, "--base");
      index += 1;
      continue;
    }

    if (current === "--head") {
      options.headRef = readRequiredCliValue(argv, index, "--head");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function isDirectRun() {
  return process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = classifyClinicalPrRisk({
    changedFiles: options.changedFiles.length > 0 ? options.changedFiles : undefined,
    baseRef: options.baseRef,
    headRef: options.headRef,
    cwd: process.cwd(),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderClinicalPrRiskSummary(result));
  }

  process.exit(result.status === "fail" ? 1 : 0);
}

if (isDirectRun()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
