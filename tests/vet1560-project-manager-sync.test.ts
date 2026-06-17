import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

type LocalProjectManagerSync = {
  azure: {
    liveCallMade: boolean;
  };
  localFallback: {
    ready: boolean;
    itemCount: number;
    validation: {
      status: string;
      blockers: string[];
      uniqueTicketCount: number;
      ticketCount: number;
      dependencyEdgeCount: number;
      orderedDependencyEdgeCount: number;
      verifierArtifactCount: number;
    };
    items: Array<{
      ticketId: string;
      dependencies: string[];
      verifierArtifactExists: boolean;
    }>;
  };
};

type ArtifactReference = {
  path: string;
  exists?: boolean;
  sha256: string | null;
  sha256OmittedReason?: string;
};

function runJson<T>(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        "JSON command failed",
        `command=${process.execPath} ${args.join(" ")}`,
        `exit=${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return JSON.parse(result.stdout) as T;
}

function runLocalSync(fromPath = "plans/VET-1560-project-manager-tickets.json") {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/devops/create-vet1560-work-items.mjs",
      "--from",
      fromPath,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "local sync command failed",
        `exit=${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return JSON.parse(result.stdout) as LocalProjectManagerSync;
}

function artifactByPath(
  artifacts: ArtifactReference[],
  artifactPath: string,
) {
  const artifact = artifacts.find((item) => item.path === artifactPath);

  if (!artifact) {
    throw new Error(`Missing artifact reference: ${artifactPath}`);
  }

  return artifact;
}

describe("VET-1560 project-manager local sync", () => {
  it("marks the local execution queue ready only after dependency and verifier validation", () => {
    const localSync = runLocalSync();
    const vet1563 = localSync.localFallback.items.find(
      (item) => item.ticketId === "VET-1563",
    );

    expect(localSync.azure.liveCallMade).toBe(false);
    expect(localSync.localFallback.ready).toBe(true);
    expect(localSync.localFallback.itemCount).toBe(5);
    expect(localSync.localFallback.validation).toEqual(
      expect.objectContaining({
        status: "passed",
        blockers: [],
        uniqueTicketCount: 5,
        ticketCount: 5,
        dependencyEdgeCount: 3,
        orderedDependencyEdgeCount: 3,
        verifierArtifactCount: 5,
      }),
    );
    expect(vet1563).toEqual(
      expect.objectContaining({
        dependencies: ["VET-1561", "VET-1562"],
        verifierArtifactExists: true,
      }),
    );
  });

  it("blocks the local execution queue when ticket ids, dependencies, or verifiers are invalid", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "vet1560-sync-"));
    const payloadPath = path.join(tempDir, "tickets.json");

    try {
      writeFileSync(
        payloadPath,
        `${JSON.stringify(
          {
            ticket: "VET-1560",
            mode: "local-project-manager-ticket-payload",
            tickets: [
              {
                id: "VET-X2",
                title: "out of order dependent",
                dependencies: ["VET-X1"],
                acceptanceCriteria: [],
                verifier: "plans/does-not-exist.json",
              },
              {
                id: "VET-X1",
                title: "first dependency",
                dependencies: [],
                acceptanceCriteria: [],
                verifier: "plans/VET-1561-model-dataset-manifest.json",
              },
              {
                id: "VET-X1",
                title: "duplicate dependency",
                dependencies: [],
                acceptanceCriteria: [],
                verifier: "plans/VET-1562-offline-experiment-package.json",
              },
            ],
          },
          null,
          2,
        )}\n`,
      );

      const localSync = runLocalSync(payloadPath);

      expect(localSync.localFallback.ready).toBe(false);
      expect(localSync.localFallback.validation.status).toBe("blocked");
      expect(localSync.localFallback.validation.blockers).toEqual(
        expect.arrayContaining([
          "duplicate ticket id: VET-X1",
          "VET-X2 depends on VET-X1, but VET-X1 is not queued earlier",
          "VET-X2 verifier artifact missing: plans/does-not-exist.json",
        ]),
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("omits cyclic evidence hashes that would destabilize regeneration", () => {
    const preflight = runJson<{
      inputArtifacts: { ownerApprovalRequest: ArtifactReference };
    }>(["scripts/model-promotion-readiness-preflight.mjs", "--role=extraction"]);
    const ownerApproval = runJson<{
      inputArtifacts: { promotionEvidencePacket: ArtifactReference };
    }>(["scripts/build-model-owner-approval-request.mjs", "--role=extraction"]);
    const dashboard = runJson<{ artifacts: ArtifactReference[] }>([
      "scripts/build-vet1560-readiness-dashboard.mjs",
    ]);
    const audit = runJson<{ artifacts: ArtifactReference[] }>([
      "scripts/build-vet1560-completion-audit.mjs",
    ]);

    const cyclicReferences = [
      preflight.inputArtifacts.ownerApprovalRequest,
      ownerApproval.inputArtifacts.promotionEvidencePacket,
      artifactByPath(
        dashboard.artifacts,
        "plans/VET-1560-regeneration-summary.json",
      ),
      artifactByPath(
        audit.artifacts,
        "plans/VET-1560-regeneration-summary.json",
      ),
    ];

    for (const artifact of cyclicReferences) {
      expect(artifact.sha256).toBeNull();
      expect(artifact.sha256OmittedReason).toEqual(
        expect.stringContaining("non-idempotent"),
      );
    }

    expect(
      preflight.inputArtifacts.ownerApprovalRequest.path.replaceAll("\\", "/"),
    ).toContain("plans/VET-1563-extraction-owner-approval-request.json");
    expect(ownerApproval.inputArtifacts.promotionEvidencePacket.path).toBe(
      "plans/VET-1563-extraction-promotion-evidence-packet.json",
    );
  });
});
