#!/usr/bin/env node
/**
 * Regenerate all local VET-1560 review-only artifacts in dependency order.
 *
 * This is intentionally local-only: it does not call Azure DevOps live sync,
 * providers, NIM endpoints, training jobs, or mutate runtime model routing.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(process.cwd(), "plans/VET-1560-regeneration-summary.json");
const markdownOutPath = resolve(process.cwd(), "plans/VET-1560-regeneration-summary.md");
const stableGeneratedAt =
  process.env.VET1560_REGENERATION_GENERATED_AT ?? "2026-05-31T00:00:00.000Z";
const useRealtimeTimestamps = process.env.VET1560_REGENERATION_REALTIME === "1";

function timestamp() {
  return useRealtimeTimestamps ? new Date().toISOString() : stableGeneratedAt;
}

const commands = [
  {
    id: "dataset-manifest",
    args: ["scripts/build-model-dataset-manifest.mjs", "--write"],
    artifacts: ["plans/VET-1561-model-dataset-manifest.json"],
  },
  {
    id: "model-routing-readout",
    args: ["scripts/model-routing-readout.mjs", "--write"],
    artifacts: [
      "plans/VET-1563-model-routing-matrix.json",
      "plans/VET-1563-model-routing-evaluation-matrix.md",
    ],
  },
  {
    id: "model-routing-eval-plan",
    args: ["scripts/build-model-routing-evaluation-plan.mjs", "--write"],
    artifacts: ["plans/VET-1563-model-routing-evaluation-plan.json"],
  },
  {
    id: "shadow-eval-scaffold",
    args: ["scripts/build-model-shadow-eval-scaffold.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-shadow-eval-scaffold.json"],
  },
  {
    id: "offline-experiment-package",
    args: ["scripts/build-model-experiment-package.mjs", "--write"],
    artifacts: ["plans/VET-1562-offline-experiment-package.json"],
  },
  {
    id: "candidate-selection-packet",
    args: ["scripts/build-model-candidate-selection-packet.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-candidate-selection-packet.json"],
  },
  {
    id: "output-capture-plan",
    args: ["scripts/build-model-output-capture-plan.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-frozen-output-capture-plan.json"],
  },
  {
    id: "frozen-output-templates",
    args: ["scripts/build-model-frozen-output-templates.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-frozen-output-templates.json"],
  },
  {
    id: "frozen-output-status",
    args: ["scripts/build-model-frozen-output-status.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-frozen-output-status.json"],
  },
  {
    id: "shadow-eval-score",
    args: ["scripts/score-model-shadow-eval.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-shadow-eval-scorecard.json"],
  },
  {
    id: "output-capture-runbook",
    args: ["scripts/build-model-output-capture-runbook.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-output-capture-runbook.json"],
  },
  {
    id: "scorecard-review-packet",
    args: ["scripts/build-model-scorecard-review-packet.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-scorecard-review-packet.json"],
  },
  {
    id: "rollback-plan",
    args: ["scripts/build-model-rollback-plan.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-model-rollback-plan.json"],
  },
  {
    id: "protected-clinical-diff-proof",
    args: ["scripts/build-protected-clinical-diff-proof.mjs", "--write"],
    artifacts: ["plans/VET-1563-protected-clinical-diff-proof.json"],
  },
  {
    id: "model-promotion-smoke-runbook",
    args: ["scripts/build-model-promotion-smoke-runbook.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-promotion-smoke-runbook.json"],
  },
  {
    id: "promotion-ticket",
    args: ["scripts/build-model-promotion-ticket.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-runtime-promotion-ticket.json"],
  },
  {
    id: "promotion-checklist",
    args: ["scripts/build-model-promotion-checklist.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-promotion-checklist.json"],
  },
  {
    id: "promotion-preflight",
    args: ["scripts/model-promotion-readiness-preflight.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-promotion-readiness-preflight.json"],
  },
  {
    id: "promotion-evidence-packet",
    args: ["scripts/build-model-promotion-evidence-packet.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-promotion-evidence-packet.json"],
  },
  {
    id: "owner-approval-request",
    args: ["scripts/build-model-owner-approval-request.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-owner-approval-request.json"],
  },
  {
    id: "promotion-evidence-packet-with-owner-request",
    args: ["scripts/build-model-promotion-evidence-packet.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-promotion-evidence-packet.json"],
  },
  {
    id: "output-capture-authorization",
    args: ["scripts/build-model-output-capture-authorization.mjs", "--role=extraction", "--write"],
    artifacts: ["plans/VET-1563-extraction-output-capture-authorization.json"],
  },
  {
    id: "product-roadmap",
    args: ["scripts/build-product-intelligence-roadmap.mjs", "--write"],
    artifacts: ["plans/VET-1564-product-intelligence-roadmap.json"],
  },
  {
    id: "product-persistence-schema",
    args: ["scripts/verify-product-intelligence-schema.mjs", "--write"],
    artifacts: ["plans/VET-1564-product-persistence-schema-readiness.json"],
  },
  {
    id: "product-readiness-contract",
    args: ["scripts/build-product-longitudinal-readiness-contract.mjs", "--write"],
    artifacts: ["plans/VET-1564-longitudinal-readiness-contract.json"],
  },
  {
    id: "claim-language-review",
    args: ["scripts/build-product-claim-language-review.mjs", "--write"],
    artifacts: ["plans/VET-1564C-claim-language-review.json"],
  },
  {
    id: "product-production-readiness",
    args: ["scripts/build-product-production-readiness.mjs", "--write"],
    artifacts: ["plans/VET-1564-production-readiness.json"],
  },
  {
    id: "product-production-smoke-runbook",
    args: ["scripts/build-product-production-smoke-runbook.mjs", "--write"],
    artifacts: ["plans/VET-1564-production-smoke-runbook.json"],
  },
  {
    id: "tugboat-governance-plan",
    args: ["scripts/build-tugboat-governance-plan.mjs", "--write"],
    artifacts: ["plans/VET-1565-tugboat-governance-plan.json"],
  },
  {
    id: "azure-sync-preflight",
    args: ["scripts/devops/vet1560-azure-sync-preflight.mjs", "--write"],
    artifacts: [
      "plans/VET-1560-azure-sync-preflight.json",
      "plans/VET-1560-azure-sync-preflight.md",
    ],
    blankAzureEnv: true,
  },
  {
    id: "azure-live-sync-runbook",
    args: ["scripts/devops/vet1560-azure-live-sync-runbook.mjs", "--write"],
    artifacts: ["plans/VET-1560-azure-live-sync-runbook.json"],
    blankAzureEnv: true,
  },
  {
    id: "project-manager-sync-readiness",
    args: ["scripts/devops/vet1560-sync-readiness.mjs", "--write"],
    artifacts: ["plans/VET-1560-project-manager-sync-readiness.json"],
    blankAzureEnv: true,
  },
  {
    id: "project-manager-local-sync",
    args: [
      "scripts/devops/create-vet1560-work-items.mjs",
      "--from",
      "plans/VET-1560-project-manager-tickets.json",
      "--write",
    ],
    artifacts: [
      "plans/VET-1560-project-manager-local-sync.json",
      "plans/VET-1560-project-manager-local-sync.md",
    ],
    blankAzureEnv: true,
  },
  {
    id: "project-manager-sync-readiness-final",
    args: ["scripts/devops/vet1560-sync-readiness.mjs", "--write"],
    artifacts: ["plans/VET-1560-project-manager-sync-readiness.json"],
    blankAzureEnv: true,
  },
  {
    id: "readiness-dashboard",
    args: ["scripts/build-vet1560-readiness-dashboard.mjs", "--write"],
    artifacts: [
      "plans/VET-1560-readiness-dashboard.json",
      "plans/VET-1560-readiness-dashboard.md",
    ],
  },
  {
    id: "completion-audit",
    args: ["scripts/build-vet1560-completion-audit.mjs", "--write"],
    artifacts: [
      "plans/VET-1560-completion-audit.json",
      "plans/VET-1560-completion-audit.md",
    ],
  },
];

const forbiddenLiveCommands = [
  "scripts/devops/create-vet1560-work-items.mjs",
  "scripts/runpod-health-and-wire.mjs",
  "scripts/runpod-provision-narrow.mjs",
  "scripts/embed-corpus.mjs",
  "scripts/apply-rag-schema.mjs",
  "scripts/sync-sidecar-vercel-envs.mjs",
];

function sha256(relativePath) {
  return createHash("sha256")
    .update(readFileSync(resolve(process.cwd(), relativePath)))
    .digest("hex");
}

function artifact(relativePath) {
  const exists = existsSync(resolve(process.cwd(), relativePath));
  return {
    path: relativePath,
    exists,
    sha256: exists ? sha256(relativePath) : null,
  };
}

function verifyReviewOnlyPlan() {
  const violations = commands.filter((command) =>
    forbiddenLiveCommands.some((forbidden) => {
      if (!command.args.join(" ").includes(forbidden)) {
        return false;
      }
      return command.id !== "project-manager-local-sync";
    })
  );
  if (violations.length > 0) {
    throw new Error(
      `Regeneration plan includes forbidden live command(s): ${violations
        .map((command) => command.args.join(" "))
        .join(", ")}`
    );
  }
}

function runCommand(command) {
  const env = {
    ...process.env,
    VET1560_LOCAL_SYNC_GENERATED_AT:
      process.env.VET1560_LOCAL_SYNC_GENERATED_AT ?? stableGeneratedAt,
    ...(command.blankAzureEnv
      ? {
          AZURE_DEVOPS_ORG: "",
          AZURE_DEVOPS_PROJECT: "",
          AZURE_DEVOPS_PAT: "",
        }
      : {}),
  };
  const startedAt = timestamp();
  const result = spawnSync(process.execPath, command.args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  const status = result.status === 0 ? "success" : "failed";
  return {
    id: command.id,
    command: ["node", ...command.args],
    status,
    exitCode: result.status,
    startedAt,
    finishedAt: timestamp(),
    stdout: result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(-8),
    stderr: result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-8),
    artifacts: command.artifacts.map(artifact),
  };
}

function renderMarkdown(summary) {
  const rows = summary.commands
    .map(
      (command) =>
        `| ${command.id} | ${command.status.toUpperCase()} | ${command.command.join(" ")} | ${command.artifacts.map((item) => item.path).join(", ")} |`
    )
    .join("\n");
  const guardrails = summary.guardrails.map((guardrail) => `- ${guardrail}`).join("\n");

  return `# VET-1560 Regeneration Summary

Generated: ${summary.generatedAt}
Mode: ${summary.mode}
Overall status: ${summary.overallStatus.toUpperCase()}

Review-only: ${summary.reviewOnly}

## Commands

| Step | Status | Command | Artifacts |
|---|---|---|---|
${rows}

## Guardrails

${guardrails}
`;
}

function buildSummary(results, overallStatus) {
  const failed = results.filter((result) => result.status !== "success");
  return {
    ticket: "VET-1560",
    mode: "review-only-regeneration",
    generatedAt: timestamp(),
    reviewOnly: true,
    overallStatus,
    commandCount: commands.length,
    executedCommandCount: results.length,
    failedCommandIds: failed.map((result) => result.id),
    commands: results,
    guardrails: [
      "Does not run live Azure Boards creation.",
      "Does not call provider, NIM, RunPod, embedding, or training endpoints.",
      "Does not install Tugboat, run llmff, or auto-apply instruction patches.",
      "Does not mutate runtime model routing, provider env, or protected clinical files.",
      "Leaves project-manager live sync blocked until Azure env vars are explicitly provided.",
    ],
  };
}

function writeSummary(summary) {
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown(summary));
}

verifyReviewOnlyPlan();

const results = [];
for (const command of commands) {
  if (
    process.argv.includes("--write") &&
    (command.id === "readiness-dashboard" || command.id === "completion-audit")
  ) {
    writeSummary(buildSummary(results, "in-progress"));
  }
  const result = runCommand(command);
  results.push(result);
  if (result.status !== "success") {
    break;
  }
}

const failed = results.filter((result) => result.status !== "success");
const summary = buildSummary(results, failed.length === 0 ? "success" : "failed");

if (process.argv.includes("--write")) {
  writeSummary(summary);
  if (failed.length === 0) {
    const auditCommand = commands.find((command) => command.id === "completion-audit");
    const refreshedAudit = runCommand(auditCommand);
    const auditIndex = results.findIndex((result) => result.id === "completion-audit");
    if (auditIndex >= 0) {
      results[auditIndex] = refreshedAudit;
    }
    writeSummary(buildSummary(results, refreshedAudit.status === "success" ? "success" : "failed"));
  }
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownOutPath}`);
}

console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
