#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROTECTED_INFRA_PATTERNS,
  PROTECTED_WORKFLOW_PATTERNS,
  collectChangedFiles,
  normalizeChangedFiles,
  pathMatchesAnyPattern,
  readRequiredCliValue,
} from "./clinical-pr-risk-classifier.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);

const TEMP_ARTIFACT_PATTERNS = [
  "tmp/**",
  "temp/**",
  "**/*.tmp",
  "**/*.temp",
];

function buildFinding(code, severity, files, message) {
  return {
    code,
    severity,
    files: [...files],
    message,
  };
}

function summaryPhrases(result) {
  const phrases = [];

  if (result.tempArtifacts.length > 0) {
    phrases.push(
      `Temp artifacts detected (${result.tempArtifacts.length}).`
    );
  }

  if (result.spilloverFiles.length > 0) {
    phrases.push(
      `Unrelated spillover outside ticket-owned paths (${result.spilloverFiles.length}).`
    );
  }

  if (result.protectedWorkflowFiles.length > 0) {
    phrases.push(
      `Protected workflow files changed (${result.protectedWorkflowFiles.length}).`
    );
  }

  if (result.protectedInfraFiles.length > 0) {
    phrases.push(
      `Protected infra files changed (${result.protectedInfraFiles.length}).`
    );
  }

  if (result.ownedPathPatterns.length === 0 && result.changedFiles.length > 0) {
    phrases.push("Owned path patterns were not provided, so spillover checking is advisory only.");
  }

  if (phrases.length === 0) {
    phrases.push("PR diff is isolated to the declared ticket-owned paths.");
  }

  return phrases;
}

export function checkPrIsolation(options = {}) {
  const changedFiles = collectChangedFiles(options);
  const ownedPathPatterns = normalizeChangedFiles(options.ownedPathPatterns ?? []);
  const tempArtifacts = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, TEMP_ARTIFACT_PATTERNS)
  );
  const protectedWorkflowFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, PROTECTED_WORKFLOW_PATTERNS)
  );
  const protectedInfraFiles = changedFiles.filter((filePath) =>
    pathMatchesAnyPattern(filePath, PROTECTED_INFRA_PATTERNS)
  );
  const spilloverFiles =
    ownedPathPatterns.length === 0
      ? []
      : changedFiles.filter(
          (filePath) => !pathMatchesAnyPattern(filePath, ownedPathPatterns)
        );

  const failures = [];
  const warnings = [];

  if (tempArtifacts.length > 0) {
    failures.push(
      buildFinding(
        "temp_artifact",
        "fail",
        tempArtifacts,
        "Temp or scratch artifacts should not be present in a mergeable PR diff."
      )
    );
  }

  if (spilloverFiles.length > 0) {
    failures.push(
      buildFinding(
        "spillover",
        "fail",
        spilloverFiles,
        "Changed files fall outside the ticket-owned paths and look like unrelated spillover."
      )
    );
  }

  if (protectedWorkflowFiles.length > 0) {
    failures.push(
      buildFinding(
        "protected_workflow",
        "fail",
        protectedWorkflowFiles,
        "Protected workflow files changed and should require explicit approval before merge."
      )
    );
  }

  if (protectedInfraFiles.length > 0) {
    warnings.push(
      buildFinding(
        "protected_infra",
        "warn",
        protectedInfraFiles,
        "Protected infra files changed and should be reviewed carefully even when they are ticket-owned."
      )
    );
  }

  if (ownedPathPatterns.length === 0 && changedFiles.length > 0) {
    warnings.push(
      buildFinding(
        "owned_paths_not_configured",
        "warn",
        changedFiles,
        "Owned path patterns were not provided, so spillover detection could not run in strict mode."
      )
    );
  }

  const status =
    failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

  const result = {
    status,
    changedFiles,
    ownedPathPatterns,
    tempArtifacts,
    spilloverFiles,
    protectedWorkflowFiles,
    protectedInfraFiles,
    failures,
    warnings,
    summary: "",
  };

  result.summary = summaryPhrases(result).join(" ");
  return result;
}

export function renderPrIsolationSummary(result) {
  const lines = [
    `PR isolation check: ${result.status.toUpperCase()}`,
    `Changed files: ${result.changedFiles.length}`,
    `Owned path patterns: ${result.ownedPathPatterns.length}`,
  ];

  for (const phrase of summaryPhrases(result)) {
    lines.push(`- ${phrase}`);
  }

  if (result.failures.length > 0) {
    lines.push("- Failures:");
    for (const finding of result.failures) {
      lines.push(`  ${finding.code}: ${finding.files.join(", ")}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("- Warnings:");
    for (const finding of result.warnings) {
      lines.push(`  ${finding.code}: ${finding.files.join(", ")}`);
    }
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {
    changedFiles: [],
    ownedPathPatterns: [],
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

    if (current === "--owned-path") {
      options.ownedPathPatterns.push(
        readRequiredCliValue(argv, index, "--owned-path")
      );
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
  const result = checkPrIsolation({
    changedFiles: options.changedFiles.length > 0 ? options.changedFiles : undefined,
    ownedPathPatterns: options.ownedPathPatterns,
    baseRef: options.baseRef,
    headRef: options.headRef,
    cwd: process.cwd(),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderPrIsolationSummary(result));
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
