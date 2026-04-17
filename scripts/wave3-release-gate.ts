import fs from "node:fs";
import path from "node:path";

import { getAllProvenanceEntries, getRequiredHighStakesRuleIds } from "../src/lib/provenance-registry.ts";
import {
  evaluateWave3ReleaseGate,
  renderWave3ReleaseGateMarkdown,
  type Wave3LiveScorecard,
} from "../src/lib/wave3-release-gate.ts";
import { loadWave3CanonicalBundle } from "./wave3-suite-manifest.ts";

const ROOT = process.cwd();
const BENCHMARK_DIR = path.join(ROOT, "data", "benchmarks", "dog-triage");
const SCORECARD_PATH = path.join(BENCHMARK_DIR, "live-scorecard.json");
const REPORT_PATH = path.join(BENCHMARK_DIR, "wave3-release-gate-report.md");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function loadScorecard(): Wave3LiveScorecard | null {
  if (!fs.existsSync(SCORECARD_PATH)) {
    return null;
  }

  return readJson<Wave3LiveScorecard>(SCORECARD_PATH);
}

function renderFatalReport(message: string): string {
  return [
    "# Wave 3 Release Gate Report",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    "- Result: FAIL",
    "- Suite ID: unavailable",
    "- Manifest hash: unavailable",
    "- Total frozen cases: unavailable",
    "- Scorecard case count: unavailable",
    "",
    "## Suite Identity",
    "",
    "- Stale or partial artifacts blocked release-gate evaluation.",
    "",
    "## Failures",
    "",
    `- ${message}`,
    "",
    "## Warnings",
    "",
    "_None_",
    "",
  ].join("\n");
}

function main() {
  try {
    const bundle = loadWave3CanonicalBundle(ROOT);
    const result = evaluateWave3ReleaseGate({
      manifest: bundle.manifest,
      cases: bundle.cases,
      modalities: bundle.modalities,
      scorecard: loadScorecard(),
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });
    const markdown = renderWave3ReleaseGateMarkdown(result);

    writeFile(REPORT_PATH, `${markdown}\n`);
    console.log(`Wave 3 suiteId: ${result.suiteId}`);
    console.log(`Wave 3 manifestHash: ${result.manifestHash}`);
    console.log(`Wave 3 totalCases: ${result.totalCases}`);
    console.log(`Release gate result: ${result.pass ? "PASS" : "FAIL"}`);
    console.log(`Report written to ${REPORT_PATH}`);

    if (!result.pass) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFile(REPORT_PATH, `${renderFatalReport(message)}\n`);
    console.error(message);
    process.exitCode = 1;
  }
}

main();
