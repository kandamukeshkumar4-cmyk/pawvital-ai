#!/usr/bin/env node
/**
 * Build the VET-1565 Tugboat governance adoption plan.
 *
 * This is review-only. It does not install Tugboat, run llmff, mutate
 * instruction files, or create project-manager work items.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadModelTechniqueIntake,
  requireModelTechniqueSource,
} from "./vet1560-model-technique-intake.mjs";

const outPath = resolve(process.cwd(), "plans/VET-1565-tugboat-governance-plan.json");

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function buildPlan() {
  const ticketsPath = resolve(process.cwd(), "plans/VET-1560-project-manager-tickets.json");
  const ticketsText = existsSync(ticketsPath) ? readFileSync(ticketsPath, "utf8") : null;
  const tickets = ticketsText ? JSON.parse(ticketsText) : { tickets: [] };
  const tugboatTicket = tickets.tickets.find((ticket) => ticket.id === "VET-1565") ?? null;
  const modelTechniqueIntake = loadModelTechniqueIntake();
  const source = requireModelTechniqueSource(
    modelTechniqueIntake.intake,
    "syndicalt-tugboat"
  );

  return {
    ticket: "VET-1565",
    mode: "review-only-governance-plan",
    generatedAt: process.env.VET1565_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
    source: {
      id: source.id,
      url: source.url,
      type: source.type,
      validatedAsOf: source.validatedAsOf,
      verdict: source.summary,
    },
    transferableTechniques: source.transferableTechniques,
    nonTransferableClaims: source.nonTransferableClaims,
    adoptionPlan: [
      {
        phase: "policy-snapshot",
        action:
          "Inventory AGENTS.md, RULES.md, AutoScientists runbooks, local.config.json, skills, eval definitions, and recurring handoff requirements.",
        verifier:
          "Instruction inventory artifact records file hashes, precedence, owners, and protected sections before any proposal.",
      },
      {
        phase: "trace-ingestion",
        action:
          "Convert recent PawVital ticket trajectories into redacted local trace bundles for instruction-behavior audits.",
        verifier:
          "Trace bundle contains no secrets, owner PHI, provider keys, or raw production payloads.",
      },
      {
        phase: "proposal-loop",
        action:
          "Run a proposal-only audit/propose/eval loop for instruction gaps, stale commands, conflicts, and repeated handoff misses.",
        verifier:
          "Each candidate patch has base hash, rationale, evidence refs, risk class, eval result, and rollback note.",
      },
      {
        phase: "governed-apply",
        action:
          "Apply only review-approved instruction patches through VCS mechanics after deterministic policy and held-out regression checks.",
        verifier:
          "No auto-apply for model routing, protected clinical instructions, deployment, secrets, approval policy, or sidecar authority.",
      },
    ],
    pawvitalBoundaries: [
      "proposal-only by default",
      "local-first artifacts only unless explicit owner approval enables provider-backed evaluation",
      "no live Azure work-item creation",
      "no NIM endpoint calls",
      "no model-router, provider env, protected clinical file, deployment, approval-policy, or secret-handling mutation",
      "instruction changes must be evidence-backed, scoped, reversible, and reviewed",
    ],
    projectManagerTicket: {
      id: tugboatTicket?.id ?? "VET-1565",
      title: tugboatTicket?.title ?? "Tugboat governance adoption plan",
      dependencies: tugboatTicket?.dependencies ?? [],
      acceptanceCriteria: tugboatTicket?.acceptanceCriteria ?? [],
      verifier: tugboatTicket?.verifier ?? null,
      presentInProjectManagerPayload: Boolean(tugboatTicket),
    },
    artifacts: {
      projectManagerPayload: {
        path: "plans/VET-1560-project-manager-tickets.json",
        exists: Boolean(ticketsText),
        sha256: ticketsText ? sha256(ticketsText) : null,
      },
      localConfig: {
        path: modelTechniqueIntake.source.path,
        type: modelTechniqueIntake.source.type,
        sourceRegistered: true,
        fallbackPath: modelTechniqueIntake.source.fallbackPath ?? null,
        liveConfigPath: modelTechniqueIntake.source.liveConfigPath ?? null,
        liveConfigExists: modelTechniqueIntake.source.liveConfigExists ?? true,
      },
    },
    readiness: {
      readyForLiveTugboatInstall: false,
      blockedReasons: [
        ...(tugboatTicket ? [] : ["VET-1565 ticket is missing from project-manager payload."]),
        "Tugboat is not installed or initialized in this repo.",
        "No approved PawVital instruction trace bundle has been selected.",
        "No policy file, eval suite, or reviewer approval exists for applying generated instruction patches.",
      ],
    },
  };
}

const shouldWrite = process.argv.includes("--write");
const plan = buildPlan();

if (shouldWrite) {
  writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(plan, null, 2));
}
