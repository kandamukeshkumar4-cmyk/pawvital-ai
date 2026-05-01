import * as path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "pr-isolation-check.mjs"
);

describe("PR isolation check", () => {
  it("fails on tmp artifacts even when the path is otherwise owned", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--owned-path",
        "tmp/**",
        "--file",
        "tmp/rate-limit-failover-report.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("fail");
    expect(parsed.tempArtifacts).toEqual([
      "tmp/rate-limit-failover-report.json",
    ]);
    expect(parsed.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "temp_artifact",
        }),
      ])
    );
  });

  it("fails on root-level scratch temp artifacts", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--owned-path",
        "*.tmp",
        "--file",
        "scratch.tmp",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("fail");
    expect(parsed.tempArtifacts).toEqual(["scratch.tmp"]);
    expect(parsed.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "temp_artifact",
        }),
      ])
    );
  });

  it("fails on unrelated spillover outside ticket-owned paths", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--owned-path",
        "scripts/clinical-pr-*.mjs",
        "--owned-path",
        "tests/clinical-intelligence/clinical-pr-*.test.ts",
        "--owned-path",
        "tests/clinical-intelligence/pr-isolation-check.test.ts",
        "--owned-path",
        "docs/clinical-intelligence/automation-safety-gates-codex.md",
        "--file",
        "scripts/clinical-pr-risk-classifier.mjs",
        "--file",
        "src/lib/clinical-intelligence/complaint-modules/skin.ts",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "Unrelated spillover outside ticket-owned paths"
    );
  });

  it("warns on protected infra files when they are explicitly owned by the ticket", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--owned-path",
        "deploy/**",
        "--file",
        "deploy/sidecars-gpu-host/docker-compose.yml",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("warn");
    expect(parsed.protectedInfraFiles).toEqual([
      "deploy/sidecars-gpu-host/docker-compose.yml",
    ]);
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "protected_infra",
        }),
      ])
    );
  });

  it("fails on protected workflow files and emits JSON", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--owned-path",
        ".github/workflows/**",
        "--file",
        ".github/workflows/ci.yml",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("fail");
    expect(parsed.protectedWorkflowFiles).toEqual([
      ".github/workflows/ci.yml",
    ]);
    expect(parsed.summary).toContain("Protected workflow files changed");
  });

  it("fails fast when --owned-path is missing its value", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--owned-path"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--owned-path requires a value.");
  });

  it("fails fast on unknown arguments instead of downgrading ownership checks", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--ownedpath",
        "scripts/**",
        "--file",
        "scripts/clinical-pr-risk-classifier.mjs",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --ownedpath");
  });
});
