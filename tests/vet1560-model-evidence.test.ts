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

type ArtifactRef = {
  path: string;
  exists?: boolean;
  sha256?: string | null;
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
    outputTemplates: ArtifactRef;
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

type ShadowEvalScorecard = {
  input: string;
  inputArtifacts: {
    scaffold: ArtifactRef;
    frozenOutputStatus: ArtifactRef;
  };
};

type PromotionReadinessPreflight = {
  summary: {
    readyForPromotionTicket: boolean;
    candidateOutputHashes: number;
    candidateGateBlockedCount: number;
    candidateContentHashWithoutEvidenceHashCount: number;
  };
  inputArtifacts: Record<string, ArtifactRef>;
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

type ArtifactInputs = {
  inputArtifacts: Record<string, ArtifactRef>;
};

type RoutingEvaluationPlan = {
  inputRoutingMatrix: string;
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
  blockers: string[];
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

type CandidateSelectionPacket = {
  candidateIdentityResolved: boolean;
  candidateEvidenceSearch: {
    resolved: boolean;
    conclusion: string;
    sourcesInspected: Array<{
      id: string;
      status: string;
      artifact: {
        path: string;
        exists?: boolean;
        sha256: string | null;
      };
      observedFields: Record<string, unknown> | null;
      finding: string;
    }>;
    nextRequiredEvidence: string[];
  };
  guardrails: string[];
};

type OutputCaptureRunbook = {
  authorizationPreflightCommand: string;
  captureSequence: Array<{
    id: string;
    variant?: string;
    allowedNow: boolean;
    authorizationCheckRequired?: boolean;
    localOnly?: boolean;
    reason: string;
  }>;
};

type OutputCaptureAuthorization = {
  readyForProviderCapture: boolean;
  blockers: string[];
  captureReadiness: {
    baselineValidation: {
      ready: boolean;
      variant: string;
      requiredApprovalScope: string | null;
      blockers: string[];
      runbookSequenceId: string;
    };
    candidateValidation: {
      ready: boolean;
      variant: string;
      requiredApprovalScope: string;
      blockers: string[];
      runbookSequenceId: string;
    };
    holdout: {
      ready: boolean;
      variants: string[];
      blockers: string[];
      runbookSequenceIds: string[];
    };
  };
  allowedNextActions: string[];
};

type PromotionSmokeRunbook = {
  smokeRunbook: Array<{
    step: string;
    requiredInputIds?: string[];
  }>;
};

type PackageJson = {
  scripts: Record<string, string>;
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

function expectRepoRelativePath(artifactPath: string) {
  expect(path.isAbsolute(artifactPath)).toBe(false);
  expect(artifactPath).not.toContain(repoRoot);
  expect(artifactPath).not.toContain("\\");
}

function expectRepoRelativeArtifacts(artifacts: Record<string, ArtifactRef>) {
  for (const artifact of Object.values(artifacts)) {
    expectRepoRelativePath(artifact.path);
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
  it("records candidate evidence provenance without resolving candidate identity", () => {
    const packet = runJson<CandidateSelectionPacket>([
      "scripts/build-model-candidate-selection-packet.mjs",
      "--role=extraction",
    ]);

    expect(packet.candidateIdentityResolved).toBe(false);
    expect(packet.candidateEvidenceSearch.resolved).toBe(false);
    expect(packet.candidateEvidenceSearch.conclusion).toContain(
      "No approved candidate model or adapter identity",
    );
    expect(packet.candidateEvidenceSearch.sourcesInspected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vet-1562-offline-experiment-package",
          status: "unresolved-candidate-identity",
          observedFields: expect.objectContaining({
            baseModel: "unresolved-review-only-candidate",
            adapterOrCheckpointId: null,
            trainingArtifactPath: null,
            trainingArtifactSha256: null,
          }),
        }),
        expect.objectContaining({
          id: "runpod-narrow-model-pack-manifest",
          status: "experiment-manifest-only",
          observedFields: expect.objectContaining({
            experimentPackId: "vet-915-narrow-model-pack",
          }),
        }),
      ]),
    );
    expect(packet.candidateEvidenceSearch.nextRequiredEvidence).toEqual(
      expect.arrayContaining([
        "approved candidate model or adapter id",
        "scoped validation-output-capture approval record",
      ]),
    );
    expect(packet.guardrails).toContain(
      "Do not infer candidate identity from an experiment manifest without an approved model or adapter artifact.",
    );
  });

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
    expect(modelLane.summary).toContain(
      "candidate evidence provenance resolved=false",
    );
    expect(modelLane.summary).toContain(
      "runpod-narrow-model-pack-manifest=experiment-manifest-only",
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
        expect.stringContaining(
          "Candidate evidence provenance: resolved=false",
        ),
      ]),
    );
    expect(audit.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "candidate-selection: No approved candidate model or adapter identity",
        ),
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

  it("keeps provider capture gated by explicit authorization readiness", () => {
    const runbook = runJson<OutputCaptureRunbook>([
      "scripts/build-model-output-capture-runbook.mjs",
      "--role=extraction",
    ]);
    const authorization = runJson<OutputCaptureAuthorization>([
      "scripts/build-model-output-capture-authorization.mjs",
      "--role=extraction",
    ]);
    const baselineSequence = requireDefined(
      runbook.captureSequence.find((item) => item.id === "validation-baseline"),
      "validation baseline capture sequence",
    );
    const candidateSequence = requireDefined(
      runbook.captureSequence.find((item) => item.id === "validation-candidate"),
      "validation candidate capture sequence",
    );
    const freezeSequence = requireDefined(
      runbook.captureSequence.find((item) => item.id === "freeze-validation"),
      "freeze validation sequence",
    );

    expect(runbook.authorizationPreflightCommand).toBe(
      "npm run models:output-capture-authorization",
    );
    expect(baselineSequence.allowedNow).toBe(false);
    expect(baselineSequence.authorizationCheckRequired).toBe(true);
    expect(baselineSequence.reason).toContain(
      "captureReadiness.baselineValidation.ready=true",
    );
    expect(candidateSequence.allowedNow).toBe(false);
    expect(candidateSequence.authorizationCheckRequired).toBe(true);
    expect(candidateSequence.reason).toContain(
      "captureReadiness.candidateValidation.ready=true",
    );
    expect(freezeSequence.allowedNow).toBe(true);
    expect(freezeSequence.localOnly).toBe(true);

    expect(authorization.readyForProviderCapture).toBe(false);
    expect(authorization.captureReadiness.baselineValidation).toEqual(
      expect.objectContaining({
        ready: false,
        variant: "baseline",
        requiredApprovalScope: null,
        runbookSequenceId: "validation-baseline",
      }),
    );
    expect(
      authorization.captureReadiness.baselineValidation.blockers,
    ).toContain(
      "baseline provider credential group is not present in the current process environment",
    );
    expect(authorization.captureReadiness.candidateValidation).toEqual(
      expect.objectContaining({
        ready: false,
        variant: "candidate",
        requiredApprovalScope: "validation-output-capture-only",
        runbookSequenceId: "validation-candidate",
      }),
    );
    expect(
      authorization.captureReadiness.candidateValidation.blockers,
    ).toEqual(
      expect.arrayContaining([
        "candidate capture approval is not complete",
        "candidate provider credential group is not present in the current process environment",
        "candidate model or adapter identity has not been approved",
      ]),
    );
    expect(authorization.captureReadiness.holdout.ready).toBe(false);
    expect(authorization.captureReadiness.holdout.runbookSequenceIds).toEqual([
      "holdout-baseline",
      "holdout-candidate",
    ]);
    expect(authorization.captureReadiness.holdout.blockers).toContain(
      "validation baseline and candidate outputs are not frozen and reviewed",
    );
    expect(authorization.allowedNextActions).toEqual(
      expect.arrayContaining([
        "Provide baseline provider credentials through the authorized environment without writing secret values to artifacts.",
        "Rerun npm run models:output-capture-authorization before any provider call.",
      ]),
    );
  });

  it("exposes the model evidence npm scripts referenced by VET-1563 artifacts", () => {
    const { scripts } = readJson<PackageJson>("package.json");
    const requiredScripts = [
      "models:shadow-eval-scaffold",
      "models:output-capture-plan",
      "models:frozen-output-templates",
      "models:frozen-output-status",
      "models:shadow-eval-score",
      "models:output-capture-runbook",
      "models:scorecard-review-packet",
      "models:rollback-plan",
      "models:protected-clinical-diff-proof",
      "models:promotion-smoke-runbook",
      "models:promotion-ticket",
      "models:promotion-checklist",
      "models:promotion-preflight",
      "models:promotion-evidence-packet",
      "models:owner-approval-request",
      "models:output-capture-authorization",
    ];

    for (const scriptName of requiredScripts) {
      expect(scripts[scriptName]).toEqual(expect.stringContaining("--write"));
    }
    expect(scripts["models:output-capture-authorization"]).toContain(
      "scripts/build-model-output-capture-authorization.mjs",
    );
  });

  it("derives validation smoke ids from split capture sequences without duplicates", () => {
    const smokeRunbook = runJson<PromotionSmokeRunbook>([
      "scripts/build-model-promotion-smoke-runbook.mjs",
      "--role=extraction",
    ]);
    const validationSmoke = requireDefined(
      smokeRunbook.smokeRunbook.find(
        (item) => item.step === "validation-route-smoke",
      ),
      "validation route smoke step",
    );
    const requiredInputIds = validationSmoke.requiredInputIds ?? [];

    expect(requiredInputIds).toEqual(
      expect.arrayContaining([
        "emergency-blue-gums-breathing",
        "emergency-breathing-collapse",
        "limping-follow-up",
      ]),
    );
    expect(new Set(requiredInputIds).size).toBe(requiredInputIds.length);
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

  it("keeps generated model evidence artifact paths repo-relative", () => {
    const evaluationPlan = runJson<RoutingEvaluationPlan>([
      "scripts/build-model-routing-evaluation-plan.mjs",
    ]);
    const scorecard = runJson<ShadowEvalScorecard>([
      "scripts/score-model-shadow-eval.mjs",
      "--role=extraction",
    ]);
    const rollbackPlan = runJson<ArtifactInputs>([
      "scripts/build-model-rollback-plan.mjs",
      "--role=extraction",
    ]);
    const promotionTicket = runJson<ArtifactInputs>([
      "scripts/build-model-promotion-ticket.mjs",
      "--role=extraction",
    ]);
    const promotionChecklist = runJson<ArtifactInputs>([
      "scripts/build-model-promotion-checklist.mjs",
      "--role=extraction",
    ]);
    const preflight = runJson<PromotionReadinessPreflight>([
      "scripts/model-promotion-readiness-preflight.mjs",
      "--role=extraction",
    ]);

    expect(evaluationPlan.inputRoutingMatrix).toBe(
      "plans/VET-1563-model-routing-matrix.json",
    );
    expect(scorecard.input).toBe(
      "plans/VET-1563-extraction-shadow-eval-scaffold.json",
    );
    expect(scorecard.inputArtifacts.scaffold.path).toBe(
      "plans/VET-1563-extraction-shadow-eval-scaffold.json",
    );
    expect(scorecard.inputArtifacts.frozenOutputStatus.path).toBe(
      "plans/VET-1563-extraction-frozen-output-status.json",
    );

    const artifactPaths = Object.values(preflight.inputArtifacts).map(
      (artifact) => artifact.path,
    );
    expect(artifactPaths).toEqual(
      expect.arrayContaining([
        "plans/VET-1563-extraction-promotion-checklist.json",
        "plans/VET-1563-extraction-shadow-eval-scorecard.json",
        "plans/VET-1563-extraction-frozen-output-capture-plan.json",
        "plans/VET-1563-extraction-frozen-output-templates.json",
        "plans/VET-1563-extraction-frozen-output-status.json",
        "plans/VET-1563-extraction-runtime-promotion-ticket.json",
        "plans/VET-1563-extraction-owner-approval-request.json",
        "plans/VET-1563-extraction-promotion-smoke-runbook.json",
      ]),
    );
    expectRepoRelativeArtifacts(rollbackPlan.inputArtifacts);
    expectRepoRelativeArtifacts(promotionTicket.inputArtifacts);
    expectRepoRelativeArtifacts(promotionChecklist.inputArtifacts);

    expectRepoRelativePath(evaluationPlan.inputRoutingMatrix);
    expectRepoRelativePath(scorecard.input);
    for (const artifactPath of artifactPaths) {
      expectRepoRelativePath(artifactPath);
    }
  });
});
