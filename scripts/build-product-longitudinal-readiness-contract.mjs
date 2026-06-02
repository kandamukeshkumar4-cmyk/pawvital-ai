#!/usr/bin/env node
/**
 * Build the VET-1564 longitudinal readiness contract.
 *
 * This is a review-only product contract for Whoop-for-dogs style readiness and
 * recovery analytics. It defines evidence fields, windows, missing-data states,
 * and clinical claim guards before deeper UI/model work. It does not call
 * providers, train models, mutate clinical logic, or write runtime data.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(
  process.cwd(),
  "plans/VET-1564-longitudinal-readiness-contract.json"
);

const dependencies = [
  "plans/VET-1564-product-intelligence-roadmap.json",
  "src/lib/product-intelligence.ts",
  "src/lib/readiness-snapshot.ts",
  "src/lib/recovery-checkpoint.ts",
  "src/lib/product-intelligence-persistence.ts",
  "supabase-product-intelligence-schema.sql",
  "plans/VET-1564-product-persistence-schema-readiness.json",
  "src/app/api/product-intelligence/snapshots/route.ts",
  "src/app/(dashboard)/analytics/page.tsx",
  "src/components/analytics/product-intelligence-panel.tsx",
  "tests/product-intelligence.test.ts",
  "tests/readiness-snapshot.test.ts",
  "tests/recovery-checkpoint.test.ts",
  "tests/product-intelligence-persistence.test.ts",
  "tests/product-intelligence-schema.test.ts",
  "tests/product-intelligence-snapshots.route.test.ts",
  "tests/product-intelligence-panel.test.tsx",
  "tests/analytics-product-owner-workflow.test.ts",
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function dependencyArtifact(relativePath) {
  const absolutePath = resolve(process.cwd(), relativePath);
  return {
    path: relativePath,
    exists: existsSync(absolutePath),
    sha256: existsSync(absolutePath) ? sha256(absolutePath) : null,
  };
}

const contract = {
  ticket: "VET-1564",
  generatedAt:
    process.env.PRODUCT_READINESS_CONTRACT_GENERATED_AT ??
    "2026-05-31T00:00:00.000Z",
  mode: "review-only",
  productName: "PawVital Longitudinal Readiness Contract",
  intent:
    "Define the evidence contract for a Whoop-for-dogs style daily readiness and recovery layer without creating unsupported diagnosis, prognosis, treatment, or emergency-clearance claims.",
  ownerVisiblePromise:
    "Show whether available evidence looks baseline, watchful, urgent, or unknown, and explain exactly which evidence created that state.",
  evidenceWindows: {
    dailyReadiness: {
      lookbackDays: 1,
      requiredSignals: ["health score or derived wellness index", "latest symptom check"],
      optionalSignals: ["journal energy", "journal mood", "appetite", "hydration", "rest"],
      missingState:
        "unknown readiness or watch state with explicit next evidence prompt; never coerce missing evidence to zero.",
    },
    trend: {
      lookbackDays: 7,
      requiredSignals: ["at least two symptom checks or journal entries"],
      optionalSignals: ["outcome feedback", "follow-up answers", "report disposition"],
      missingState:
        "unknown trend until there are at least two comparable observations.",
    },
    recovery: {
      lookbackDays: 14,
      requiredSignals: ["post-event journal entries or report-linked follow-up"],
      optionalSignals: ["energy trend", "mood trend", "appetite trend", "hydration trend"],
      missingState:
        "unknown recovery until a baseline and at least one follow-up checkpoint exist.",
    },
  },
  scoringContract: {
    outputShape: {
      state: ["stable", "watch", "urgent", "unknown"],
      confidence: ["high", "medium", "low", "insufficient"],
      evidenceCoverage: "available evidence fields divided by available plus missing fields",
      nextEvidencePrompt: "single most useful missing evidence field unless urgent override exists",
    },
    forbiddenOutputs: [
      "single magic health score without source evidence",
      "diagnosis certainty",
      "treatment recommendation",
      "prognosis promise",
      "emergency clearance",
      "model confidence displayed as medical certainty",
    ],
    deterministicOverrides: [
      "emergency symptom check forces urgent state",
      "same-day clinical red flag forces urgent or watch state according to deterministic clinical rules",
      "urgent override suppresses coaching prompts that could delay care",
    ],
  },
  modelUsageBoundaries: {
    allowed: [
      "normalize owner-language evidence after extraction scorecard gates pass",
      "summarize already-determined deterministic state in owner-friendly wording",
      "detect unsafe reassurance in generated copy through safety verifier",
    ],
    blockedUntilSeparateTicket: [
      "runtime NIM or narrow-pack route promotion",
      "adapter or checkpoint promotion",
      "model-owned clinical state",
      "vision-only readiness state",
    ],
  },
  uiContract: {
    surface: "analytics Evidence ring",
    mustShow: [
      "module state",
      "evidence chips",
      "missing evidence chips",
      "deterministic override when present",
      "claim guard",
      "review-only or evidence-quality status while gates are not complete",
      "save controls only when selected-dog evidence is persistable",
      "saved snapshot history count when authenticated database reads are available",
    ],
    mustNotShow: [
      "marketing hero as primary experience",
      "pet wellness score without evidence source",
      "hidden missing-data penalty",
      "clinical clearance language",
    ],
  },
  acceptanceGates: [
    "readiness snapshot tests cover persistable, insufficient-evidence, and urgent override states",
    "recovery checkpoint tests cover report-linked, insufficient-evidence, and urgent override states",
    "product-intelligence unit tests cover stable, urgent, and missing-data states",
    "analytics panel test covers Evidence ring, coverage text, missing-data state, and claim guard",
    "analytics owner workflow can save persistable readiness/recovery records and read back history through authenticated routes",
    "build passes",
    "no protected clinical file diff unless separately authorized",
    "no runtime model routing or provider env diff",
    "claim-language clinical review before expanding owner-visible copy",
  ],
  nextImplementationTickets: [
    {
      id: "VET-1564A",
      title: "Persist daily readiness snapshots from existing evidence",
      scope:
        "Add read-only snapshot generation from existing journal, symptom, and health-score evidence; no diagnosis claims and no model routing changes.",
      implementedFoundation: {
        module: "src/lib/readiness-snapshot.ts",
        persistenceMapper: "src/lib/product-intelligence-persistence.ts",
        readWriteRoute: "src/app/api/product-intelligence/snapshots/route.ts",
        schema: "supabase-product-intelligence-schema.sql",
        ownerWorkflow: "src/app/(dashboard)/analytics/page.tsx",
        test: "tests/readiness-snapshot.test.ts",
        persistenceStatus:
          "schema, pure row mapper, authenticated read/write route, and analytics save/history controls exist; live migration not applied",
      },
    },
    {
      id: "VET-1564B",
      title: "Add report-linked recovery checkpoints",
      scope:
        "Create follow-up checkpoints tied to report disposition and journal evidence, with urgent override and missing-data states.",
      implementedFoundation: {
        module: "src/lib/recovery-checkpoint.ts",
        persistenceMapper: "src/lib/product-intelligence-persistence.ts",
        readWriteRoute: "src/app/api/product-intelligence/snapshots/route.ts",
        schema: "supabase-product-intelligence-schema.sql",
        ownerWorkflow: "src/app/(dashboard)/analytics/page.tsx",
        test: "tests/recovery-checkpoint.test.ts",
        persistenceStatus:
          "schema, pure row mapper, authenticated read/write route, and analytics save/history controls exist; live migration not applied",
      },
    },
    {
      id: "VET-1564C",
      title: "Run owner-facing claim-language clinical review",
      scope:
        "Review readiness, trend, recovery, and evidence-coach copy for unsupported diagnosis, prognosis, treatment, or emergency-clearance claims.",
    },
  ],
  dependencyArtifacts: dependencies.map(dependencyArtifact),
};

contract.missingDependencyArtifacts = contract.dependencyArtifacts
  .filter((artifact) => !artifact.exists)
  .map((artifact) => artifact.path);
contract.status =
  contract.missingDependencyArtifacts.length === 0 ? "ready-for-review" : "blocked";
contract.blockers = contract.missingDependencyArtifacts.map(
  (path) => `missing readiness contract dependency: ${path}`
);

if (!contract.acceptanceGates.some((gate) => gate.includes("build passes"))) {
  throw new Error("Readiness contract must require build verification.");
}
if (!contract.scoringContract.forbiddenOutputs.includes("diagnosis certainty")) {
  throw new Error("Readiness contract must block diagnosis certainty.");
}
if (!contract.dependencyArtifacts.length) {
  throw new Error("Readiness contract must include dependency artifacts.");
}

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(contract, null, 2));
}
