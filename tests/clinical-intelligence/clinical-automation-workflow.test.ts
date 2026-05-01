import * as fs from "node:fs";
import * as path from "node:path";

const WORKFLOW_PATH = path.join(
  process.cwd(),
  ".github",
  "workflows",
  "clinical-automation-gates.yml"
);

describe("clinical automation gates workflow", () => {
  it("wires the clinical automation gate scripts into pull request CI", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Clinical Automation Gates");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [master]");
    expect(workflow).toContain("node scripts/clinical-pr-risk-classifier.mjs --json");
    expect(workflow).toContain("node scripts/clinical-pr-required-checks.mjs --json");
    expect(workflow).toContain("node scripts/pr-isolation-check.mjs --json");
    expect(workflow).toContain("clinical-automation-gate-artifacts");
    expect(workflow).toContain("Clinical automation artifacts");
  });
});
