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
const shadowOutputDir = path.join(
  repoRoot,
  "artifacts",
  "model-shadow-eval",
  "extraction",
);

type TemplateOutput = Record<string, unknown> & {
  inputId: string;
  rawOutput?: string;
};

type CandidateEnvelope = Record<string, unknown> & {
  outputs: TemplateOutput[];
};

type FrozenOutputTemplate = {
  variant: string;
  outputPath: string;
  envelope: CandidateEnvelope;
};

type FrozenOutputCase = {
  caseSourceId: string;
  split: string;
  inputSource: {
    recordCount: number;
  };
  templates: FrozenOutputTemplate[];
};

type FrozenOutputTemplates = {
  cases: FrozenOutputCase[];
};

type FrozenOutputStatus = {
  inputArtifacts: {
    outputTemplates: {
      path: string;
    };
  };
  cases: Array<{
    caseSourceId: string;
    candidate: {
      exists: boolean;
      parseableJson: boolean;
      schemaValid: boolean;
      sha256: string | null;
      contentSha256: string | null;
      schemaErrors: string[];
    };
    blockers: string[];
  }>;
};

type PromotionEvidencePacket = {
  frozenOutputSlots: Array<{
    caseSourceId: string;
    candidateOutputSha256: string | null;
    candidateOutputContentSha256: string | null;
    candidateSchemaValid: boolean;
    candidateBlocker: string;
    candidateCaptureGate: {
      status: string;
      requiredApprovalScope: string;
      blockers: string[];
    };
    populated: boolean;
  }>;
  promotionDecision: {
    allowedByThisPacket: boolean;
  };
};

type PromotionReadinessPreflight = {
  summary: {
    readyForPromotionTicket: boolean;
    candidateOutputHashes: number;
    candidateGateBlockedCount: number;
    candidateContentHashWithoutEvidenceHashCount: number;
  };
  inputArtifacts: {
    outputTemplates: {
      exists: boolean;
    };
  };
  outputGateStatus: {
    candidateGates: Array<{
      caseSourceId: string;
      candidateOutputSha256: string | null;
      candidateOutputContentSha256: string | null;
      candidateSchemaValid: boolean;
      candidateBlocker: string;
      captureGate: {
        status: string;
        requiredApprovalScope: string;
      };
    }>;
  };
};

type ReadinessDashboard = {
  lanes: Array<{
    id: string;
    status: string;
    summary: string;
  }>;
};

type CompletionAudit = {
  requirements: Array<{
    id: string;
    status: string;
    evidence: string[];
  }>;
  artifacts: Array<{
    path: string;
    exists: boolean;
  }>;
  completionDecision: {
    canMarkGoalComplete: boolean;
  };
};

type OwnerApprovalRequest = {
  status: string;
  approvalRequestReady: boolean;
  approvalGranted: boolean;
  evidenceRequiredBeforeApproval: string[];
  currentBlockingSummary: {
    preflightOutputGateStatus: {
      candidateGateBlockedCount: number;
      candidateContentHashWithoutEvidenceHashCount: number;
      candidateGates: Array<{
        candidateOutputSha256: string | null;
        captureGate: {
          status: string;
          requiredApprovalScope: string;
          blockers: string[];
        };
      }>;
    };
  };
};

function runNode(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: node ${args.join(" ")}`,
        `exit=${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result.stdout;
}

function runJson<T>(args: string[]) {
  return JSON.parse(runNode(args)) as T;
}

function readJson<T>(relativePath: string) {
  return JSON.parse(
    readFileSync(path.join(repoRoot, relativePath), "utf8"),
  ) as T;
}

function requireDefined<T>(value: T | undefined, label: string) {
  if (value === undefined) {
    throw new Error(`${label} was not found`);
  }
  return value;
}

function regenerateArtifacts() {
  rmSync(shadowOutputDir, {
    force: true,
    recursive: true,
  });
  runNode(["scripts/vet1560-regenerate-all.mjs", "--write"]);
}

function candidateTemplate() {
  const templates = readJson<FrozenOutputTemplates>(
    "plans/VET-1563-extraction-frozen-output-templates.json",
  );
  const templateCase = requireDefined(
    templates.cases.find((item) => item.inputSource.recordCount > 0),
    "frozen output case with records",
  );
  const candidate = requireDefined(
    templateCase.templates.find((item) => item.variant === "candidate"),
    "candidate frozen output template",
  );

  return { templateCase, candidate };
}

function cleanupCandidateOutput(outputPath: string) {
  const absolutePath = path.join(repoRoot, outputPath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
}

function writeCandidateEnvelope(candidate: FrozenOutputTemplate) {
  const absolutePath = path.join(repoRoot, candidate.outputPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(
    absolutePath,
    `${JSON.stringify(
      {
        ...candidate.envelope,
        capturedAt: "2026-06-02T00:00:00.000Z",
        outputs: candidate.envelope.outputs.map((item) => ({
          ...item,
          rawOutput: "{}",
        })),
      },
      null,
      2,
    )}\n`,
  );
}

beforeAll(regenerateArtifacts);
afterEach(regenerateArtifacts);
afterAll(regenerateArtifacts);

describe("VET-1560 model evidence readouts", () => {
  it("surfaces candidate capture-gate blockers in dashboard and completion audit", () => {
    const dashboard = runJson<ReadinessDashboard>([
      "scripts/build-vet1560-readiness-dashboard.mjs",
    ]);
    const modelLane = requireDefined(
      dashboard.lanes.find((item) => item.id === "model-nim-promotion"),
      "model promotion dashboard lane",
    );
    expect(modelLane.status).toBe("blocked");
    expect(modelLane.summary).toContain("candidate capture gates blocked=3");
    expect(modelLane.summary).toContain(
      "diagnostic candidate content hashes without evidence hash=0",
    );

    const audit = runJson<CompletionAudit>([
      "scripts/build-vet1560-completion-audit.mjs",
    ]);
    const modelRequirement = requireDefined(
      audit.requirements.find((item) => item.id === "nim-and-ai-model-improvement"),
      "model promotion audit requirement",
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

  it("keeps candidate capture-gate blockers visible before owner approval", () => {
    const approvalRequest = runJson<OwnerApprovalRequest>([
      "scripts/build-model-owner-approval-request.mjs",
      "--role=extraction",
    ]);

    expect(approvalRequest.status).toBe("blocked-before-owner-approval");
    expect(approvalRequest.approvalRequestReady).toBe(false);
    expect(approvalRequest.approvalGranted).toBe(false);
    expect(approvalRequest.evidenceRequiredBeforeApproval).toContain(
      "Promotion preflight reports candidateGateBlockedCount=0 and no diagnostic candidate content hashes without evidence hashes.",
    );

    const outputGateStatus =
      approvalRequest.currentBlockingSummary.preflightOutputGateStatus;
    expect(outputGateStatus.candidateGateBlockedCount).toBe(3);
    expect(outputGateStatus.candidateContentHashWithoutEvidenceHashCount).toBe(0);
    expect(outputGateStatus.candidateGates).toHaveLength(3);
    expect(outputGateStatus.candidateGates[0].candidateOutputSha256).toBeNull();
    expect(outputGateStatus.candidateGates[0].captureGate.status).toBe("blocked");
    expect(
      outputGateStatus.candidateGates[0].captureGate.requiredApprovalScope,
    ).toBe("validation-output-capture-only");
    expect(outputGateStatus.candidateGates[0].captureGate.blockers).toEqual(
      expect.arrayContaining([
        "candidate identity is not resolved",
        "scoped validation-output-capture approval is not complete",
      ]),
    );
  });

  it("rejects arbitrary candidate JSON before hashes can count", () => {
    const { templateCase, candidate } = candidateTemplate();
    const absolutePath = path.join(repoRoot, candidate.outputPath);
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
      const status = runJson<FrozenOutputStatus>([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
      ]);
      const statusCase = requireDefined(
        status.cases.find((item) => item.caseSourceId === templateCase.caseSourceId),
        "frozen output status case",
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
      cleanupCandidateOutput(candidate.outputPath);
    }
  });

  it("does not count a valid-looking candidate envelope while its capture gate is blocked", () => {
    const { templateCase, candidate } = candidateTemplate();
    writeCandidateEnvelope(candidate);

    try {
      const status = runJson<FrozenOutputStatus>([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
      ]);
      const statusCase = requireDefined(
        status.cases.find((item) => item.caseSourceId === templateCase.caseSourceId),
        "frozen output status case",
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
      cleanupCandidateOutput(candidate.outputPath);
    }
  });

  it("reports blocked candidate capture gates separately from counted hashes", () => {
    const { templateCase, candidate } = candidateTemplate();
    writeCandidateEnvelope(candidate);

    try {
      runNode([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
        "--write",
      ]);
      const preflight = runJson<PromotionReadinessPreflight>([
        "scripts/model-promotion-readiness-preflight.mjs",
        "--role=extraction",
      ]);
      const gate = requireDefined(
        preflight.outputGateStatus.candidateGates.find(
          (item) => item.caseSourceId === templateCase.caseSourceId,
        ),
        "candidate preflight gate",
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
      cleanupCandidateOutput(candidate.outputPath);
    }
  });

  it("surfaces blocked candidate capture gates without counting candidate hashes", () => {
    const { templateCase, candidate } = candidateTemplate();
    writeCandidateEnvelope(candidate);

    try {
      runNode([
        "scripts/build-model-frozen-output-status.mjs",
        "--role=extraction",
        "--write",
      ]);
      const packet = runJson<PromotionEvidencePacket>([
        "scripts/build-model-promotion-evidence-packet.mjs",
        "--role=extraction",
      ]);
      const slot = requireDefined(
        packet.frozenOutputSlots.find(
          (item) => item.caseSourceId === templateCase.caseSourceId,
        ),
        "promotion evidence frozen output slot",
      );

      expect(slot.candidateOutputSha256).toBeNull();
      expect(slot.candidateOutputContentSha256).toEqual(expect.any(String));
      expect(slot.candidateSchemaValid).toBe(false);
      expect(slot.candidateBlocker).toBe("output file schema invalid");
      expect(slot.candidateCaptureGate.status).toBe("blocked");
      expect(slot.candidateCaptureGate.requiredApprovalScope).toBe(
        "validation-output-capture-only",
      );
      expect(slot.candidateCaptureGate.blockers).toEqual(
        expect.arrayContaining([
          "candidate identity is not resolved",
          "scoped validation-output-capture approval is not complete",
        ]),
      );
      expect(slot.populated).toBe(false);
      expect(packet.promotionDecision.allowedByThisPacket).toBe(false);
    } finally {
      cleanupCandidateOutput(candidate.outputPath);
    }
  });
});
