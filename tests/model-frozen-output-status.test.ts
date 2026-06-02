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

function candidateTemplate() {
  const templates = readJson("plans/VET-1563-extraction-frozen-output-templates.json");
  const templateCase = templates.cases.find(
    (item: any) => item.inputSource.recordCount > 0,
  );
  expect(templateCase).toBeDefined();

  const candidate = templateCase.templates.find(
    (item: any) => item.variant === "candidate",
  );
  expect(candidate).toBeDefined();
  return { templateCase, candidate };
}

function cleanupCandidateOutput(outputPath: string) {
  const absolutePath = path.join(repoRoot, outputPath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
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

describe("model frozen output status", () => {
  it("rejects arbitrary candidate JSON before hashes can count", () => {
    const { templateCase, candidate } = candidateTemplate();
    const outputPath = candidate.outputPath;
    const absolutePath = path.join(repoRoot, outputPath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });

    writeFileSync(
      absolutePath,
      JSON.stringify(
        {
          role: "wrong-role",
          caseSourceId: "wrong-case",
          split: "wrong-split",
          model: "",
          capturedAt: "not-a-date",
          outputs: [{ inputId: "unexpected", rawOutput: "{}" }],
        },
        null,
        2,
      ),
    );

    try {
      const status = runJson([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
      ]);
      const statusCase = status.cases.find(
        (item: any) => item.caseSourceId === templateCase.caseSourceId,
      );

      expect(statusCase.candidate.exists).toBe(true);
      expect(statusCase.candidate.parseableJson).toBe(true);
      expect(statusCase.candidate.schemaValid).toBe(false);
      expect(statusCase.candidate.sha256).toBeNull();
      expect(statusCase.candidate.contentSha256).toEqual(expect.any(String));
      expect(statusCase.candidate.schemaErrors).toEqual(
        expect.arrayContaining([
          "role must be extraction",
          `caseSourceId must be ${templateCase.caseSourceId}`,
          `split must be ${templateCase.split}`,
          "model must be a non-empty string",
          "capturedAt must be an ISO-like date string",
          `outputs length must match input record count ${templateCase.inputSource.recordCount}`,
          expect.stringContaining("outputs missing inputId(s):"),
          "outputs include unexpected inputId(s): unexpected",
          expect.stringContaining("capture gate blocked:"),
        ]),
      );
      expect(statusCase.blockers).toContain("candidate output file schema invalid");
    } finally {
      cleanupCandidateOutput(outputPath);
    }
  });

  it("does not count a valid-looking candidate envelope while its capture gate is blocked", () => {
    const { templateCase, candidate } = candidateTemplate();
    const outputPath = candidate.outputPath;
    const absolutePath = path.join(repoRoot, outputPath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });

    const envelope = {
      ...candidate.envelope,
      capturedAt: "2026-06-02T00:00:00.000Z",
      outputs: candidate.envelope.outputs.map((item: any) => ({
        ...item,
        rawOutput: "{}",
      })),
    };
    writeFileSync(absolutePath, `${JSON.stringify(envelope, null, 2)}\n`);

    try {
      const status = runJson([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
      ]);
      const statusCase = status.cases.find(
        (item: any) => item.caseSourceId === templateCase.caseSourceId,
      );

      expect(status.inputArtifacts.outputTemplates.path).toBe(
        "plans/VET-1563-extraction-frozen-output-templates.json",
      );
      expect(statusCase.candidate.exists).toBe(true);
      expect(statusCase.candidate.parseableJson).toBe(true);
      expect(statusCase.candidate.schemaValid).toBe(false);
      expect(statusCase.candidate.sha256).toBeNull();
      expect(statusCase.candidate.contentSha256).toEqual(expect.any(String));
      expect(statusCase.candidate.schemaErrors).toEqual(
        expect.arrayContaining([expect.stringContaining("capture gate blocked:")]),
      );
      expect(statusCase.blockers).toContain("candidate output file schema invalid");
    } finally {
      cleanupCandidateOutput(outputPath);
    }
  });
});
