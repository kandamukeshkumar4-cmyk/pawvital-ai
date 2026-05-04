import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type CliOptions = {
  json: boolean;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TSC_ENTRYPOINT = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");

function parseArgs(argv: readonly string[]): CliOptions {
  let json = false;

  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { json };
}

function buildRunnerSource(options: CliOptions): string {
  return `
import fs from "node:fs";
import path from "node:path";
import {
  evaluateShadowPlannerScenarios,
  renderShadowPlannerScenarioEvalSummary,
} from "../src/lib/clinical-intelligence/shadow-planner-scenario-eval";

const scenarios = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "clinical-intelligence",
      "shadow-planner-scenarios.json"
    ),
    "utf8"
  )
);
const expectedOutcomes = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "clinical-intelligence",
      "shadow-planner-expected-outcomes.json"
    ),
    "utf8"
  )
);
const edgeScenarios = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "clinical-intelligence",
      "shadow-planner-edge-case-scenarios.json"
    ),
    "utf8"
  )
);
const normalizationRows = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "clinical-intelligence",
      "shadow-planner-expected-outcome-normalization.json"
    ),
    "utf8"
  )
);
const report = evaluateShadowPlannerScenarios({
  scenarios,
  expectedOutcomes,
  edgeScenarios,
  normalizationRows,
});

if (${options.json ? "true" : "false"}) {
  console.log(JSON.stringify(report.summary, null, 2));
} else {
  console.log(renderShadowPlannerScenarioEvalSummary(report.summary));
}
`;
}

function compileRunner(tempDir: string): string {
  const outDir = path.join(tempDir, "out");
  const runnerPath = path.join(tempDir, "runner.ts");
  const result = spawnSync(
    process.execPath,
    [
      TSC_ENTRYPOINT,
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--moduleResolution",
      "node",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck",
      "--outDir",
      outDir,
      "--rootDir",
      ".",
      runnerPath,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }

    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || "tsc compilation failed");
  }

  return path.join(outDir, path.relative(ROOT, runnerPath)).replace(/\.ts$/, ".js");
}

function runCompiledRunner(compiledRunnerPath: string): number {
  const result = spawnSync(process.execPath, [compiledRunnerPath], {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main(): number {
  const options = parseArgs(process.argv.slice(2));
  const tempDir = fs.mkdtempSync(
    path.join(ROOT, ".shadow-planner-scenario-eval-")
  );

  try {
    const runnerPath = path.join(tempDir, "runner.ts");
    fs.writeFileSync(runnerPath, buildRunnerSource(options), "utf8");
    const compiledRunnerPath = compileRunner(tempDir);
    return runCompiledRunner(compiledRunnerPath);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

try {
  process.exit(main());
} catch (error) {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
}
