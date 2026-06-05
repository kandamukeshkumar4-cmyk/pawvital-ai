import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

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

describe("VET-1564 production evidence sync", () => {
  it("keeps product-intelligence production readiness aligned with VET-1571C proof", () => {
    const schema = runJson<{
      liveMigrationApplied: boolean;
      productionEvidence: {
        authenticatedProductionSmokeComplete: boolean;
        productionPersistenceStatus: string;
        currentDeploymentReadOnlySmokePassed: boolean;
        currentDeploymentAuthenticatedWriteSmokeComplete: boolean;
        currentDeploymentSmokeStatus: string;
        recoveryCheckpointStatus: string;
        blockers: string[];
        currentDeploymentGaps: string[];
      };
    }>(["scripts/verify-product-intelligence-schema.mjs"]);
    const contract = runJson<{
      productionEvidenceStatus: {
        authenticatedProductionSmokeComplete: boolean;
        recoveryCheckpointStatus: string;
      };
    }>(["scripts/build-product-longitudinal-readiness-contract.mjs"]);
    const roadmap = runJson<{
      phases: Array<{ id: string; status: string; blockers: string[] }>;
      productionEvidenceStatus: {
        authenticatedProductionSmokeComplete: boolean;
      };
    }>(["scripts/build-product-intelligence-roadmap.mjs"]);
    const readiness = runJson<{
      liveMigrationApplied: boolean;
      authenticatedProductionSmokeComplete: boolean;
      currentDeploymentReadOnlySmokePassed: boolean;
      currentDeploymentAuthenticatedWriteSmokeComplete: boolean;
      currentDeploymentSmokeStatus: string;
      productionPersistenceStatus: string;
      recoveryCheckpointProductionWriteExercised: boolean;
      recoveryCheckpointStatus: string;
      blockers: string[];
      currentDeploymentGaps: string[];
      productionEvidence: {
        decision: {
          publicBeta: string;
        };
        deploymentId: string;
        currentDeploymentId: string;
        readinessRowId: string;
        postSmoke500JsonRecordCount: number;
      };
    }>(["scripts/build-product-production-readiness.mjs"]);

    expect(schema.liveMigrationApplied).toBe(true);
    expect(schema.productionEvidence.authenticatedProductionSmokeComplete).toBe(true);
    expect(schema.productionEvidence.productionPersistenceStatus).toBe(
      "go-current-read-historical-write",
    );
    expect(schema.productionEvidence.currentDeploymentReadOnlySmokePassed).toBe(true);
    expect(schema.productionEvidence.currentDeploymentAuthenticatedWriteSmokeComplete).toBe(
      false,
    );
    expect(schema.productionEvidence.currentDeploymentSmokeStatus).toBe(
      "current-deployment-read-only-pass-write-not-exercised",
    );
    expect(schema.productionEvidence.blockers).toEqual([]);
    expect(schema.productionEvidence.currentDeploymentGaps).toEqual([
      "current deployment authenticated write smoke was not exercised",
    ]);
    expect(contract.productionEvidenceStatus.authenticatedProductionSmokeComplete).toBe(true);
    expect(roadmap.productionEvidenceStatus.authenticatedProductionSmokeComplete).toBe(true);
    expect(roadmap.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "VET-1564A",
          status: "go-current-read-historical-write",
          blockers: [],
        }),
        expect.objectContaining({
          id: "VET-1564D",
          status: "go-current-read-historical-write",
          blockers: [],
        }),
      ]),
    );
    expect(readiness.liveMigrationApplied).toBe(true);
    expect(readiness.authenticatedProductionSmokeComplete).toBe(true);
    expect(readiness.currentDeploymentReadOnlySmokePassed).toBe(true);
    expect(readiness.currentDeploymentAuthenticatedWriteSmokeComplete).toBe(false);
    expect(readiness.currentDeploymentSmokeStatus).toBe(
      "current-deployment-read-only-pass-write-not-exercised",
    );
    expect(readiness.productionPersistenceStatus).toBe(
      "go-current-read-historical-write",
    );
    expect(readiness.blockers).toEqual([]);
    expect(readiness.currentDeploymentGaps).toEqual([
      "current deployment authenticated write smoke was not exercised",
    ]);
    expect(readiness.productionEvidence.deploymentId).toBe(
      "dpl_Bo7RYGjXjV6HGNs5XXUMA97zs7FL",
    );
    expect(readiness.productionEvidence.currentDeploymentId).toBe(
      "dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb",
    );
    expect(readiness.productionEvidence.readinessRowId).toBe(
      "8815e992-9b9b-4b1d-9fb4-8690578ecc24",
    );
    expect(readiness.productionEvidence.postSmoke500JsonRecordCount).toBe(0);
    expect(readiness.productionEvidence.decision.publicBeta).toBe("HOLD");
    expect(readiness.recoveryCheckpointProductionWriteExercised).toBe(false);
    expect(readiness.recoveryCheckpointStatus).toBe(
      "schema-and-route-ready-production-write-not-exercised",
    );
  });
});
