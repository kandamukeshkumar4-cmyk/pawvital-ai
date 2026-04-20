#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

import type { LiveEvalScorecard } from "../src/lib/benchmark-live-eval";
import {
  evaluateWave3ReleaseGate,
  renderWave3ReleaseGateMarkdown,
} from "../src/lib/wave3-release-gate.ts";
import {
  getAllProvenanceEntries,
  getRequiredHighStakesRuleIds,
} from "../src/lib/provenance-registry.ts";
import { loadWave3CanonicalSuite } from "../src/lib/wave3-suite-manifest.ts";
import {
  buildWave3FailureLedger,
  buildWave3ResidualBlockers,
  renderWave3FailureLedgerMarkdown,
} from "../src/lib/wave3-root-cause-ledger.ts";

interface CliArgs {
  manifestPath: string;
  scorecardPath: string;
  outputPath: string;
  ledgerOutputPath: string;
  ledgerMarkdownPath: string;
  residualOutputPath: string;
  referenceDate?: Date;
}

const ROOT = process.cwd();
const BENCHMARK_DIR = path.join(ROOT, "data", "benchmarks", "dog-triage");
const DEFAULT_MANIFEST_PATH = path.join(
  BENCHMARK_DIR,
  "wave3-freeze-manifest.json"
);
const DEFAULT_SCORECARD_PATH = path.join(BENCHMARK_DIR, "live-scorecard.json");
const DEFAULT_OUTPUT_PATH = path.join(
  BENCHMARK_DIR,
  "wave3-release-gate-report.md"
);
const DEFAULT_LEDGER_OUTPUT_PATH = path.join(
  BENCHMARK_DIR,
  "wave3-emergency-root-cause-ledger.json"
);
const DEFAULT_LEDGER_MARKDOWN_PATH = path.join(
  ROOT,
  "docs",
  "wave3-emergency-baseline-debug.md"
);
const DEFAULT_RESIDUAL_OUTPUT_PATH = path.join(
  BENCHMARK_DIR,
  "wave3-residual-blockers.json"
);

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    scorecardPath: DEFAULT_SCORECARD_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    ledgerOutputPath: DEFAULT_LEDGER_OUTPUT_PATH,
    ledgerMarkdownPath: DEFAULT_LEDGER_MARKDOWN_PATH,
    residualOutputPath: DEFAULT_RESIDUAL_OUTPUT_PATH,
  };

  for (const arg of argv) {
    if (arg.startsWith("--manifest=")) {
      args.manifestPath = path.resolve(ROOT, arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--scorecard=")) {
      args.scorecardPath = path.resolve(ROOT, arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.outputPath = path.resolve(ROOT, arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--ledger-output=")) {
      args.ledgerOutputPath = path.resolve(ROOT, arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--ledger-markdown=")) {
      args.ledgerMarkdownPath = path.resolve(ROOT, arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--residual-output=")) {
      args.residualOutputPath = path.resolve(ROOT, arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--reference-date=")) {
      const value = arg.split("=")[1];
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!Number.isFinite(parsed.valueOf())) {
        throw new Error(
          `Invalid --reference-date value "${value}". Expected YYYY-MM-DD.`
        );
      }
      args.referenceDate = parsed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJsonFile<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function loadScorecard(scorecardPath: string): LiveEvalScorecard | null {
  if (!fs.existsSync(scorecardPath)) {
    return null;
  }

  return readJsonFile<LiveEvalScorecard>(scorecardPath);
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const { manifest, cases } = loadWave3CanonicalSuite(args.manifestPath);
  const modalities = Object.entries(manifest.modalityCounts).map(
    ([modality, caseCount]) => ({
      modality,
      caseCount,
    })
  );
  const scorecard = loadScorecard(args.scorecardPath);

  const result = evaluateWave3ReleaseGate({
    cases,
    modalities,
    scorecard,
    canonicalSuite: {
      suiteId: manifest.suiteId,
      suiteVersion: manifest.suiteVersion,
      generatedAt: manifest.generatedAt,
      manifestHash: manifest.manifestHash,
      totalCases: manifest.totalCases,
      caseIds: manifest.caseIds,
    },
    requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
    provenanceEntries: getAllProvenanceEntries(),
    referenceDate: args.referenceDate,
  });

  const markdown = renderWave3ReleaseGateMarkdown(result);
  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, `${markdown.trimEnd()}\n`, "utf8");

  const ledger = buildWave3FailureLedger({
    manifest,
    cases,
    scorecard,
  });
  const residualBlockers = buildWave3ResidualBlockers(ledger);
  fs.mkdirSync(path.dirname(args.ledgerOutputPath), { recursive: true });
  fs.writeFileSync(
    args.ledgerOutputPath,
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8"
  );
  fs.mkdirSync(path.dirname(args.ledgerMarkdownPath), { recursive: true });
  fs.writeFileSync(
    args.ledgerMarkdownPath,
    `${renderWave3FailureLedgerMarkdown(ledger).trimEnd()}\n`,
    "utf8"
  );
  fs.mkdirSync(path.dirname(args.residualOutputPath), { recursive: true });
  fs.writeFileSync(
    args.residualOutputPath,
    `${JSON.stringify(residualBlockers, null, 2)}\n`,
    "utf8"
  );

  process.stdout.write(
    [
      `Wave 3 release gate: ${result.pass ? "PASS" : "FAIL"}`,
      `Suite ID: ${manifest.suiteId}`,
      `Manifest hash: ${manifest.manifestHash}`,
      `Frozen cases: ${manifest.totalCases}`,
      `Scorecard: ${
        scorecard
          ? `${scorecard.totalCases} cases (${scorecard.passFail})`
          : "missing"
      }`,
      `Failures: ${result.failures.length}`,
      `Warnings: ${result.warnings.length}`,
      `Report written to: ${args.outputPath}`,
      `Ledger written to: ${args.ledgerOutputPath}`,
      `Residual blockers written to: ${args.residualOutputPath}`,
      ...result.failures.map((failure) => `- ${failure}`),
    ].join("\n") + "\n"
  );

  return result.pass ? 0 : 1;
}

try {
  process.exit(main());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
