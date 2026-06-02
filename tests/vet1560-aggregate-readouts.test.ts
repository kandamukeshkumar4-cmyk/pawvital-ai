import { spawnSync } from "node:child_process";

function runNode(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  expect(result.status).toBe(0);
  return result.stdout;
}

function runJson(args: string[]) {
  return JSON.parse(runNode(args));
}

describe("VET-1560 aggregate readouts", () => {
  beforeAll(() => {
    runNode(["scripts/vet1560-regenerate-all.mjs", "--write"]);
  });

  it("surfaces candidate capture-gate blockers in dashboard and completion audit", () => {
    const dashboard = runJson(["scripts/build-vet1560-readiness-dashboard.mjs"]);
    const modelLane = dashboard.lanes.find(
      (item: any) => item.id === "model-nim-promotion",
    );
    expect(modelLane.status).toBe("blocked");
    expect(modelLane.summary).toContain("candidate capture gates blocked=3");
    expect(modelLane.summary).toContain(
      "diagnostic candidate content hashes without evidence hash=0",
    );

    const audit = runJson(["scripts/build-vet1560-completion-audit.mjs"]);
    const modelRequirement = audit.requirements.find(
      (item: any) => item.id === "nim-and-ai-model-improvement",
    );
    expect(modelRequirement.status).toBe("blocked");
    expect(modelRequirement.evidence).toEqual(
      expect.arrayContaining([
        "Promotion preflight gate summary: candidateGateBlockedCount=3, candidateContentHashWithoutEvidenceHashCount=0.",
      ]),
    );
    expect(audit.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "plans/VET-1563-extraction-promotion-readiness-preflight.json",
          exists: true,
        }),
      ]),
    );
    expect(audit.completionDecision.canMarkGoalComplete).toBe(false);
  });
});
