import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function runNode(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  expect(result.status).toBe(0);
  return result.stdout;
}

function runJson(args: string[]) {
  return JSON.parse(runNode(args));
}

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

beforeAll(() => {
  runNode(["scripts/vet1560-regenerate-all.mjs", "--write"]);
});

afterAll(() => {
  rmSync(path.join(repoRoot, "artifacts", "model-shadow-eval", "extraction"), {
    force: true,
    recursive: true,
  });
  runNode(["scripts/vet1560-regenerate-all.mjs", "--write"]);
});

describe("model promotion readiness preflight", () => {
  it("reports blocked candidate capture gates separately from counted hashes", () => {
    const templates = readJson("plans/VET-1563-extraction-frozen-output-templates.json");
    const templateCase = templates.cases.find(
      (item: any) => item.inputSource.recordCount > 0,
    );
    expect(templateCase).toBeDefined();

    const candidateTemplate = templateCase.templates.find(
      (item: any) => item.variant === "candidate",
    );
    expect(candidateTemplate).toBeDefined();

    const candidateOutputPath = path.join(repoRoot, candidateTemplate.outputPath);
    mkdirSync(path.dirname(candidateOutputPath), { recursive: true });
    writeFileSync(
      candidateOutputPath,
      `${JSON.stringify(
        {
          ...candidateTemplate.envelope,
          capturedAt: "2026-06-02T00:00:00.000Z",
          outputs: candidateTemplate.envelope.outputs.map((item: any) => ({
            ...item,
            rawOutput: "{}",
          })),
        },
        null,
        2,
      )}\n`,
    );

    try {
      runNode([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
        "--write",
      ]);
      const preflight = runJson([
        "scripts/model-promotion-readiness-preflight.mjs",
        "--role=extraction",
      ]);
      const gate = preflight.outputGateStatus.candidateGates.find(
        (item: any) => item.caseSourceId === templateCase.caseSourceId,
      );

      expect(preflight.summary.readyForPromotionTicket).toBe(false);
      expect(preflight.summary.candidateOutputHashes).toBe(0);
      expect(preflight.summary.candidateGateBlockedCount).toBe(3);
      expect(
        preflight.summary.candidateContentHashWithoutEvidenceHashCount,
      ).toBe(1);
      expect(preflight.inputArtifacts.outputTemplates.exists).toBe(true);
      expect(gate.candidateOutputSha256).toBeNull();
      expect(gate.candidateOutputContentSha256).toEqual(expect.any(String));
      expect(gate.candidateSchemaValid).toBe(false);
      expect(gate.candidateBlocker).toBe("output file schema invalid");
      expect(gate.captureGate.status).toBe("blocked");
      expect(gate.captureGate.requiredApprovalScope).toBe(
        "validation-output-capture-only",
      );
    } finally {
      if (existsSync(candidateOutputPath)) {
        unlinkSync(candidateOutputPath);
      }
    }
  });
});
