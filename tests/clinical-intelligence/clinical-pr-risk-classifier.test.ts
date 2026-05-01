import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "clinical-pr-risk-classifier.mjs"
);

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return result;
}

describe("clinical PR risk classifier", () => {
  it("can classify a branch using the repository default base ref", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "clinical-pr-risk-"));

    runGit(repoDir, ["init", "-b", "master"]);
    runGit(repoDir, ["config", "user.email", "test@example.com"]);
    runGit(repoDir, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repoDir, "base.txt"), "base\n");
    runGit(repoDir, ["add", "base.txt"]);
    runGit(repoDir, ["commit", "-m", "base"]);
    runGit(repoDir, ["remote", "add", "origin", repoDir]);
    runGit(repoDir, ["update-ref", "refs/remotes/origin/master", "HEAD"]);
    runGit(repoDir, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/master",
    ]);
    runGit(repoDir, ["checkout", "-b", "feature"]);
    fs.mkdirSync(path.join(repoDir, "scripts"));
    fs.writeFileSync(
      path.join(repoDir, "scripts", "clinical-pr-risk-classifier.mjs"),
      "changed\n"
    );
    runGit(repoDir, ["add", "scripts/clinical-pr-risk-classifier.mjs"]);
    runGit(repoDir, ["commit", "-m", "feature"]);

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--json"], {
      cwd: repoDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed.changedFiles)).toBe(true);
    expect(parsed.changedFiles).toEqual(
      expect.arrayContaining(["scripts/clinical-pr-risk-classifier.mjs"])
    );
  });

  it("falls back to origin master when origin HEAD is absent", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "clinical-pr-risk-"));

    runGit(repoDir, ["init", "-b", "master"]);
    runGit(repoDir, ["config", "user.email", "test@example.com"]);
    runGit(repoDir, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repoDir, "base.txt"), "base\n");
    runGit(repoDir, ["add", "base.txt"]);
    runGit(repoDir, ["commit", "-m", "base"]);
    runGit(repoDir, ["remote", "add", "origin", repoDir]);
    runGit(repoDir, ["update-ref", "refs/remotes/origin/master", "HEAD"]);
    runGit(repoDir, ["checkout", "-b", "feature"]);
    fs.mkdirSync(path.join(repoDir, "scripts"));
    fs.writeFileSync(
      path.join(repoDir, "scripts", "clinical-pr-risk-classifier.mjs"),
      "changed\n"
    );
    runGit(repoDir, ["add", "scripts/clinical-pr-risk-classifier.mjs"]);
    runGit(repoDir, ["commit", "-m", "feature"]);

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--json"], {
      cwd: repoDir,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_BASE_REF: "",
      },
    });

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.changedFiles).toEqual(
      expect.arrayContaining(["scripts/clinical-pr-risk-classifier.mjs"])
    );
  });

  it("marks complaint-module changes as medium-risk clinical-intelligence work", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--file",
        "src/lib/clinical-intelligence/complaint-modules/skin.ts",
        "--file",
        "tests/clinical-intelligence/complaint-modules-mvp.test.ts",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Clinical PR risk classifier: MEDIUM risk");
    expect(result.stdout).toContain("Complaint-module surfaces changed");
  });

  it("marks protected clinical runtime and emergency sentinel changes as high risk", () => {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--json",
        "--file",
        "src/app/api/ai/symptom-chat/route.ts",
        "--file",
        "scripts/check-emergency-sentinels.mjs",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("warn");
    expect(parsed.riskLevel).toBe("high");
    expect(parsed.categories.protectedClinicalRuntimeChanged).toBe(true);
    expect(parsed.categories.emergencySentinelChanged).toBe(true);
    expect(parsed.matches.highRiskFiles).toContain(
      "src/app/api/ai/symptom-chat/route.ts"
    );
    expect(parsed.matches.emergencySentinelFiles).toContain(
      "scripts/check-emergency-sentinels.mjs"
    );
  });

  it("fails on protected workflow changes and emits machine-readable JSON", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--json", "--file", ".github/workflows/ci.yml"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );

    expect(result.status).toBe(1);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe("fail");
    expect(parsed.riskLevel).toBe("high");
    expect(parsed.categories.protectedWorkflowFilesChanged).toBe(true);
    expect(parsed.matches.protectedWorkflowFiles).toEqual([
      ".github/workflows/ci.yml",
    ]);
    expect(parsed.summary).toContain("Protected workflow files changed");
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
