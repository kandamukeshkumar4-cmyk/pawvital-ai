#!/usr/bin/env node
/**
 * Build the VET-1564 review-only product intelligence roadmap.
 *
 * This captures the Whoop-for-dogs product lane without applying migrations,
 * changing clinical logic, calling providers, or enabling runtime model routes.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadProductProductionEvidence,
  summarizeProductProductionEvidence,
} from "./product-production-evidence.mjs";

const outPath = resolve(
  process.cwd(),
  "plans/VET-1564-product-intelligence-roadmap.json"
);

const referencedFiles = [
  "src/lib/product-intelligence.ts",
  "src/lib/readiness-snapshot.ts",
  "src/lib/recovery-checkpoint.ts",
  "src/components/analytics/product-intelligence-panel.tsx",
  "src/app/(dashboard)/analytics/page.tsx",
  "supabase-product-intelligence-schema.sql",
  "plans/VET-1564-production-evidence.json",
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  return {
    path: relativePath,
    exists: existsSync(absolutePath),
    sha256: existsSync(absolutePath) ? sha256(absolutePath) : null,
  };
}

const productionEvidenceSummary = summarizeProductProductionEvidence(
  loadProductProductionEvidence()
);
const productionBlockers = productionEvidenceSummary.blockers;

const roadmap = {
  ticket: "VET-1564",
  mode: "review-only-product-intelligence-roadmap",
  generatedAt:
    process.env.PRODUCT_INTELLIGENCE_ROADMAP_GENERATED_AT ??
    "2026-05-31T00:00:00.000Z",
  productLane: "Whoop-style daily readiness, recovery, and baseline-shift intelligence for dogs",
  note:
    "Roadmap only. It does not apply Supabase migrations, write production data, call providers, mutate clinical logic, or promote runtime model routes.",
  ownerPromise:
    "Explain readiness, baseline shift, trend, recovery, and missing evidence using existing evidence while avoiding diagnosis, prognosis, treatment, or emergency-clearance claims.",
  phases: [
    {
      id: "VET-1564A",
      title: "Persist daily readiness snapshots from existing evidence",
      status: productionEvidenceSummary.authenticatedProductionSmokeComplete
        ? "go-current-production"
        : "planned-blocked",
      blockers: productionEvidenceSummary.authenticatedProductionSmokeComplete
        ? []
        : productionBlockers,
    },
    {
      id: "VET-1564B",
      title: "Add report-linked recovery checkpoints",
      status: productionEvidenceSummary.authenticatedProductionSmokeComplete
        ? "schema-and-route-ready-production-write-not-exercised"
        : "planned-blocked",
      blockers: productionEvidenceSummary.authenticatedProductionSmokeComplete
        ? [
            "recovery checkpoint production write was not exercised by the VET-1571C owner smoke",
          ]
        : productionBlockers,
    },
    {
      id: "VET-1564C",
      title: "Run owner-facing claim-language clinical review",
      status: "ready-for-local-review",
      blockers: [],
    },
    {
      id: "VET-1564D",
      title: "Add deterministic baseline-shift product intelligence",
      status: productionEvidenceSummary.authenticatedProductionSmokeComplete
        ? "go-current-production-daily-readiness"
        : "review-only-foundation",
      blockers: productionEvidenceSummary.authenticatedProductionSmokeComplete
        ? []
        : productionBlockers,
    },
  ],
  claimGuards: [
    "not a diagnosis",
    "not a diagnosis, prognosis, treatment plan, or emergency clearance",
    "not a diagnosis or clearance",
    "not disease progression certainty",
    "not a vet discharge decision",
    "do not delay urgent care",
  ],
  modelBoundaries: {
    allowed: [
      "summarize existing deterministic evidence after gates pass",
      "normalize owner-language evidence in review-only evaluation",
      "verify unsafe reassurance in generated copy",
    ],
    blocked: [
      "model-owned clinical state",
      "runtime NIM promotion",
      "adapter or checkpoint promotion",
      "vision-only readiness state",
    ],
  },
  referencedArtifacts: referencedFiles.map(artifact),
  productionEvidenceStatus: {
    liveMigrationApplied: productionEvidenceSummary.liveMigrationApplied,
    authenticatedProductionSmokeComplete:
      productionEvidenceSummary.authenticatedProductionSmokeComplete,
    recoveryCheckpointStatus:
      productionEvidenceSummary.recoveryCheckpointStatus,
    blockers: productionBlockers,
  },
  acceptanceGates: [
    "schema readiness packet passes local review",
    "baseline-shift tests cover below-baseline, unknown, urgent override, and panel rendering states",
    "claim-language review passes",
    "authenticated route tests cover owner-scoped save/history",
    "production smoke runbook is executed only after approved migration",
  ],
};

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(roadmap, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(roadmap, null, 2));
}
