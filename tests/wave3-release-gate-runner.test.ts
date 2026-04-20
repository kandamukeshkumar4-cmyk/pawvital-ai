import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

describe("Wave 3 release gate runner", () => {
  jest.setTimeout(30000);

  it("executes the package entrypoint and writes a markdown report", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pawvital-wave3-release-gate-")
    );
    const outputPath = path.join(tempDir, "wave3-release-gate-report.md");
    const ledgerOutputPath = path.join(tempDir, "wave3-emergency-root-cause-ledger.json");
    const ledgerMarkdownPath = path.join(tempDir, "wave3-emergency-baseline-debug.md");
    const residualOutputPath = path.join(tempDir, "wave3-residual-blockers.json");
    fs.writeFileSync(
      outputPath,
      "# Wave 3 Release Gate Report\n\n- Scorecard case count: 0\n",
      "utf8"
    );
    const tsNodeBin = path.join(
      process.cwd(),
      "node_modules",
      "ts-node",
      "dist",
      "bin.js"
    );

    const result = spawnSync(
      process.execPath,
      [
        tsNodeBin,
        "--esm",
        "scripts/wave3-release-gate.ts",
        `--output=${outputPath}`,
        `--ledger-output=${ledgerOutputPath}`,
        `--ledger-markdown=${ledgerMarkdownPath}`,
        `--residual-output=${residualOutputPath}`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Wave 3 release gate: FAIL");
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.existsSync(ledgerOutputPath)).toBe(true);
    expect(fs.existsSync(ledgerMarkdownPath)).toBe(true);
    expect(fs.existsSync(residualOutputPath)).toBe(true);

    const report = fs.readFileSync(outputPath, "utf8");
    expect(report).toContain("# Wave 3 Release Gate Report");
    expect(report).toContain("## Failures");
    expect(report).toContain("## Failure Bands");
    expect(report).not.toContain("Scorecard case count: 0");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
