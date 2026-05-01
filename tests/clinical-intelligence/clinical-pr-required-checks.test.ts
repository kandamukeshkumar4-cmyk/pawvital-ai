import * as path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "clinical-pr-required-checks.mjs"
);

describe("clinical PR required checks mapper", () => {
  it("maps complaint-module changes to the complaint and vet-knowledge guard suites", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--file",
        "src/lib/clinical-intelligence/complaint-modules/skin.ts",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("pass");
    expect(parsed.categories.complaintModulesChanged).toBe(true);
    expect(parsed.categories.vetKnowledgeChanged).toBe(false);

    const commands = parsed.requiredSuites.map(
      (suite: { command: string }) => suite.command
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-gap-pack.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack2.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack3.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-heat-trauma-pack.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-complaint-source-map.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-coverage-gap-registry.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-gap-plan.test.ts",
        "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-registry-alignment.test.ts",
        "npm run build",
      ])
    );
    expect(parsed.summary).toContain("Complaint-module changes require");
  });

  it("maps vet-knowledge changes to the full vet-knowledge suite without duplicate build commands", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--file",
        "src/lib/clinical-intelligence/complaint-modules/skin.ts",
        "--file",
        "src/lib/clinical-intelligence/vet-knowledge/source-registry.ts",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    const commands = parsed.requiredSuites.map(
      (suite: { command: string }) => suite.command
    );
    const buildCommands = commands.filter(
      (command: string) => command === "npm run build"
    );

    expect(parsed.categories.complaintModulesChanged).toBe(true);
    expect(parsed.categories.vetKnowledgeChanged).toBe(true);
    expect(commands).toContain(
      "npm test -- --runTestsByPath tests/clinical-intelligence/vet-knowledge-source-registry.test.ts"
    );
    expect(buildCommands).toHaveLength(1);
  });

  it("prints JSON output for future workflow wiring", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--file",
        "src/lib/clinical-intelligence/vet-knowledge/source-registry.ts",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("pass");
    expect(parsed.categories.vetKnowledgeChanged).toBe(true);
    expect(parsed.requiredSuites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vet-knowledge-source-registry",
        }),
        expect.objectContaining({
          id: "build",
        }),
      ])
    );
  });

  it("validates suite existence against the repository root when run from a subdirectory", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--file",
        "src/lib/clinical-intelligence/vet-knowledge/source-registry.ts",
      ],
      {
        cwd: path.join(process.cwd(), "tests"),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("pass");
    expect(parsed.missingSuites).toEqual([]);
    expect(parsed.requiredSuites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vet-knowledge-source-registry",
          exists: true,
        }),
      ])
    );
  });

  it("fails fast when --file is missing its path value", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--file"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--file requires a value.");
  });

  it("fails fast on unknown arguments", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--unknown"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --unknown");
  });
});
