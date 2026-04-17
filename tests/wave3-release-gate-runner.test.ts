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
    const tsNodeBin = path.join(
      process.cwd(),
      "node_modules",
      "ts-node",
      "dist",
      "bin.js"
    );

    const result = spawnSync(
      process.execPath,
      [tsNodeBin, "--esm", "scripts/wave3-release-gate.ts", `--output=${outputPath}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Wave 3 release gate: FAIL");
    expect(fs.existsSync(outputPath)).toBe(true);

    const report = fs.readFileSync(outputPath, "utf8");
    expect(report).toContain("# Wave 3 Release Gate Report");
    expect(report).toContain("## Failures");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
