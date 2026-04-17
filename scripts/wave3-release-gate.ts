#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

import type { LiveEvalScorecard } from "../src/lib/benchmark-live-eval";
import {
  evaluateWave3ReleaseGate,
  renderWave3ReleaseGateMarkdown,
  type Wave3CaseRecord,
  type Wave3ModalitySummary,
} from "../src/lib/wave3-release-gate.ts";
import {
  getAllProvenanceEntries,
  getRequiredHighStakesRuleIds,
} from "../src/lib/provenance-registry.ts";

interface Wave3SuiteFile {
  cases: Wave3CaseRecord[];
}

interface Wave3FreezeManifest {
  uniqueCaseCount?: number;
  strata?: Array<{
    fileName: string;
  }>;
  multimodalSlices?: Array<{
    modality?: string;
    caseCount?: number;
  }>;
}

interface CliArgs {
  manifestPath: string;
  scorecardPath: string;
  outputPath: string;
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

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    scorecardPath: DEFAULT_SCORECARD_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
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

function loadWave3Cases(manifestPath: string): {
  cases: Wave3CaseRecord[];
  modalities: Wave3ModalitySummary[];
} {
  const manifest = readJsonFile<Wave3FreezeManifest>(manifestPath);
  const freezeDir = path.join(path.dirname(manifestPath), "wave3-freeze");
  const caseMap = new Map<string, Wave3CaseRecord>();

  for (const shard of manifest.strata ?? []) {
    const shardPath = path.join(freezeDir, shard.fileName);
    const suite = readJsonFile<Wave3SuiteFile>(shardPath);

    for (const caseRecord of suite.cases ?? []) {
      if (!caseMap.has(caseRecord.id)) {
        caseMap.set(caseRecord.id, caseRecord);
      }
    }
  }

  if (
    typeof manifest.uniqueCaseCount === "number" &&
    manifest.uniqueCaseCount !== caseMap.size
  ) {
    throw new Error(
      `Wave 3 manifest expected ${manifest.uniqueCaseCount} unique cases but loaded ${caseMap.size}.`
    );
  }

  const modalities = (manifest.multimodalSlices ?? [])
    .filter(
      (slice): slice is { modality: string; caseCount: number } =>
        Boolean(slice.modality) && typeof slice.caseCount === "number"
    )
    .map((slice) => ({
      modality: slice.modality,
      caseCount: slice.caseCount,
    }));

  return {
    cases: Array.from(caseMap.values()),
    modalities,
  };
}

function loadScorecard(scorecardPath: string): LiveEvalScorecard | null {
  if (!fs.existsSync(scorecardPath)) {
    return null;
  }

  return readJsonFile<LiveEvalScorecard>(scorecardPath);
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const { cases, modalities } = loadWave3Cases(args.manifestPath);
  const scorecard = loadScorecard(args.scorecardPath);

  const result = evaluateWave3ReleaseGate({
    cases,
    modalities,
    scorecard,
    requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
    provenanceEntries: getAllProvenanceEntries(),
    referenceDate: args.referenceDate,
  });

  const markdown = renderWave3ReleaseGateMarkdown(result);
  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, `${markdown.trimEnd()}\n`, "utf8");

  process.stdout.write(
    [
      `Wave 3 release gate: ${result.pass ? "PASS" : "FAIL"}`,
      `Frozen cases: ${cases.length}`,
      `Scorecard: ${
        scorecard
          ? `${scorecard.totalCases} cases (${scorecard.passFail})`
          : "missing"
      }`,
      `Failures: ${result.failures.length}`,
      `Warnings: ${result.warnings.length}`,
      `Report written to: ${args.outputPath}`,
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
