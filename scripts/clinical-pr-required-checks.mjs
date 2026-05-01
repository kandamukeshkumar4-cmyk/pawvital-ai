#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyClinicalPrRisk,
  collectChangedFiles,
  readRequiredCliValue,
} from "./clinical-pr-risk-classifier.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);

const COMPLAINT_MODULE_SUITES = [
  {
    id: "complaint-modules-mvp",
    label: "Complaint Modules MVP",
    testPath: "tests/clinical-intelligence/complaint-modules-mvp.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts",
  },
  {
    id: "complaint-modules-gap-pack",
    label: "Complaint Modules Gap Pack",
    testPath: "tests/clinical-intelligence/complaint-modules-gap-pack.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-gap-pack.test.ts",
  },
  {
    id: "complaint-modules-pack2",
    label: "Complaint Modules Pack 2",
    testPath: "tests/clinical-intelligence/complaint-modules-pack2.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack2.test.ts",
  },
  {
    id: "complaint-modules-pack3",
    label: "Complaint Modules Pack 3",
    testPath: "tests/clinical-intelligence/complaint-modules-pack3.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack3.test.ts",
  },
  {
    id: "complaint-modules-heat-trauma-pack",
    label: "Complaint Modules Heat Trauma Pack",
    testPath:
      "tests/clinical-intelligence/complaint-modules-heat-trauma-pack.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-heat-trauma-pack.test.ts",
  },
];

const VET_KNOWLEDGE_SUITES = [
  {
    id: "vet-knowledge-source-registry",
    label: "Vet Knowledge Source Registry",
    testPath:
      "tests/clinical-intelligence/vet-knowledge-source-registry.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-registry.test.ts",
  },
  {
    id: "vet-knowledge-complaint-source-map",
    label: "Vet Knowledge Complaint Source Map",
    testPath:
      "tests/clinical-intelligence/vet-knowledge-complaint-source-map.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-complaint-source-map.test.ts",
  },
  {
    id: "vet-knowledge-coverage-gap-registry",
    label: "Vet Knowledge Coverage Gap Registry",
    testPath:
      "tests/clinical-intelligence/vet-knowledge-coverage-gap-registry.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-coverage-gap-registry.test.ts",
  },
  {
    id: "vet-knowledge-source-gap-plan",
    label: "Vet Knowledge Source Gap Plan",
    testPath:
      "tests/clinical-intelligence/vet-knowledge-source-gap-plan.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-gap-plan.test.ts",
  },
  {
    id: "vet-knowledge-registry-alignment",
    label: "Vet Knowledge Registry Alignment",
    testPath:
      "tests/clinical-intelligence/vet-knowledge-registry-alignment.test.ts",
    command:
      "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-registry-alignment.test.ts",
  },
];

const BUILD_SUITE = {
  id: "build",
  label: "Build",
  testPath: null,
  command: "npm run build",
};

function resolveRepositoryRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return cwd;
  }

  const repositoryRoot = result.stdout.trim();
  return repositoryRoot.length > 0 ? repositoryRoot : cwd;
}

function cloneSuite(suite, reasonCode, cwd) {
  return {
    ...suite,
    exists: suite.testPath ? fs.existsSync(path.join(cwd, suite.testPath)) : true,
    reasonCodes: [reasonCode],
  };
}

function dedupeSuites(suites) {
  const byId = new Map();

  for (const suite of suites) {
    const existing = byId.get(suite.id);
    if (!existing) {
      byId.set(suite.id, {
        ...suite,
        reasonCodes: [...suite.reasonCodes],
      });
      continue;
    }

    for (const reasonCode of suite.reasonCodes) {
      if (!existing.reasonCodes.includes(reasonCode)) {
        existing.reasonCodes.push(reasonCode);
      }
    }
  }

  return [...byId.values()];
}

function summaryPhrases(result) {
  const phrases = [];

  if (result.categories.complaintModulesChanged) {
    phrases.push(
      `Complaint-module changes require ${COMPLAINT_MODULE_SUITES.length} complaint-module suites plus vet-knowledge alignment coverage.`
    );
  }

  if (result.categories.vetKnowledgeChanged) {
    phrases.push(
      `Vet-knowledge changes require source registry, complaint-source-map, coverage-gap, source-gap-plan, and registry-alignment suites.`
    );
  }

  if (result.requiredSuites.length === 0) {
    phrases.push("No complaint-module or vet-knowledge suite expansion required.");
  }

  if (result.missingSuites.length > 0) {
    phrases.push(
      `Missing suite definitions detected (${result.missingSuites.length}).`
    );
  }

  return phrases;
}

export function mapClinicalPrRequiredChecks(options = {}) {
  const cwd = resolveRepositoryRoot(options.cwd ?? process.cwd());
  const changedFiles = collectChangedFiles({
    ...options,
    cwd,
  });
  const risk = classifyClinicalPrRisk({
    changedFiles,
    cwd,
  });

  const suites = [];

  if (risk.categories.complaintModulesChanged) {
    for (const suite of COMPLAINT_MODULE_SUITES) {
      suites.push(cloneSuite(suite, "complaint_modules_changed", cwd));
    }
    for (const suite of VET_KNOWLEDGE_SUITES.slice(1)) {
      suites.push(cloneSuite(suite, "complaint_modules_changed", cwd));
    }
    suites.push(cloneSuite(BUILD_SUITE, "complaint_modules_changed", cwd));
  }

  if (risk.categories.vetKnowledgeChanged) {
    for (const suite of VET_KNOWLEDGE_SUITES) {
      suites.push(cloneSuite(suite, "vet_knowledge_changed", cwd));
    }
    suites.push(cloneSuite(BUILD_SUITE, "vet_knowledge_changed", cwd));
  }

  const requiredSuites = dedupeSuites(suites);
  const missingSuites = requiredSuites.filter((suite) => suite.exists !== true);
  const status = missingSuites.length > 0 ? "fail" : "pass";
  const result = {
    status,
    changedFiles,
    categories: {
      complaintModulesChanged: risk.categories.complaintModulesChanged,
      vetKnowledgeChanged: risk.categories.vetKnowledgeChanged,
    },
    requiredSuites,
    missingSuites,
    summary: "",
  };

  result.summary = summaryPhrases(result).join(" ");
  return result;
}

export function renderClinicalPrRequiredChecksSummary(result) {
  const lines = [
    `Clinical PR required checks: ${result.status.toUpperCase()}`,
    `Changed files: ${result.changedFiles.length}`,
  ];

  for (const phrase of summaryPhrases(result)) {
    lines.push(`- ${phrase}`);
  }

  if (result.requiredSuites.length === 0) {
    lines.push("- No required suites.");
  } else {
    lines.push("- Required suites:");
    for (const suite of result.requiredSuites) {
      lines.push(`  ${suite.id}: ${suite.command}`);
    }
  }

  return lines.join("\n");
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
  const result = mapClinicalPrRequiredChecks({
    changedFiles: options.changedFiles.length > 0 ? options.changedFiles : undefined,
    baseRef: options.baseRef,
    headRef: options.headRef,
    cwd: process.cwd(),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderClinicalPrRequiredChecksSummary(result));
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
