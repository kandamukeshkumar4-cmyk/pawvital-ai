#!/usr/bin/env node
/**
 * Build the VET-1560 launch-readiness gate snapshot.
 *
 * This is review-only evidence plumbing. It records the current launch/public
 * beta blockers in the same local artifact chain as the VET-1560 roadmap, but
 * does not call GitHub, Vercel, Supabase, providers, or runtime model routes.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const generatedAt =
  process.env.VET1560_LAUNCH_READINESS_GENERATED_AT ??
  "2026-06-12T17:30:00.000Z";

const outPath = resolve(
  process.cwd(),
  "plans/VET-1560-launch-readiness-gates.json",
);
const markdownOutPath = resolve(
  process.cwd(),
  "plans/VET-1560-launch-readiness-gates.md",
);

const evidenceSnapshot = {
  capturedAt: "2026-06-12T17:22:00.000Z",
  mode: "manual-read-only-continuation-snapshot",
  productionAlias: {
    host: "pawvital-ai.vercel.app",
    deploymentId: "dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb",
    deploymentCreatedAt: "2026-06-05T09:17:51-04:00",
    status: "ready",
    notes: [
      "Production alias/env/maxDuration proof for PR #601 remains HOLD until the reliability branch is deployed and probed.",
      "Unauthenticated probes only prove auth boundaries for protected routes; they do not prove invited tester completion.",
    ],
  },
  github: {
    issues: [
      {
        number: 339,
        title:
          "VET-1380 - Private Tester Cohort 1 Launch Command Center, Monitoring, Feedback Triage, and Safety Ops",
        state: "open",
        latestEvidence: "VET-1574 readout refresh comment posted 2026-06-12",
      },
      {
        number: 588,
        title:
          "VET-1572C - VET-1563 model-promotion frozen outputs blocked by candidate identity and capture authorization",
        state: "open",
        latestEvidence: "VET-1575 model evidence blocker readout PR #593",
      },
      {
        number: 582,
        title:
          "VET-1569C - Production Supabase REST/Auth and DATABASE_URL point at different projects",
        state: "open",
        latestEvidence: "operational debt remains outside this branch",
      },
    ],
    pullRequests: [
      {
        number: 591,
        title: "docs: add VET-1573C public beta HOLD packet",
        head: "codex/vet-1573c-public-beta-go-hold",
        status: "open-blocked",
        evidenceCommit: "2fa21beae3060b6f8f8fb157f2e2d5af41b49d6d",
      },
      {
        number: 592,
        title: "docs: add VET-1574C Cohort 1 evidence readout",
        head: "codex/vet-1574c-cohort1-evidence-readout",
        status: "open-blocked",
        evidenceCommit: "6db1180dc913ba889cfb226eaf5fbb760d1beed6",
      },
      {
        number: 593,
        title: "docs: add VET-1575C model evidence blocker readout",
        head: "codex/vet-1575c-model-evidence-blocker-readout",
        status: "open-blocked",
        evidenceCommit: "041f7b980b04b7100adbab3c814680e0f86b9f50",
      },
      {
        number: 601,
        title: "VET-1571: harden serverless reliability budgets",
        head: "codex/vet-1571-p0-clean-review",
        status: "open-blocked-review-only-go",
        evidenceCommit: "b72c3620510d14fe5e2669e16adac876dfe112d7",
      },
    ],
  },
};

function gate({
  id,
  label,
  status,
  proofType,
  summary,
  evidence,
  missing,
  nextAction,
}) {
  return {
    id,
    label,
    status,
    proofType,
    summary,
    evidence,
    missing,
    nextAction,
  };
}

function buildGates() {
  const gates = [
    gate({
      id: "admin-authority",
      label: "Cohort 1 admin authority",
      status: "go",
      proofType: "owner-visible-ux",
      summary:
        "Production admin authority was already GO from the same deployment; unauthenticated admin APIs still deny access.",
      evidence: [
        "Starting truth records Cohort 1 admin authority as GO on production.",
        "Read-only probe: /api/admin/private-tester returned 403 unauthenticated.",
        "Read-only probe: /admin/cohort-launch redirected unauthenticated users to login.",
      ],
      missing: [],
      nextAction:
        "Use the production admin cohort-launch command center only for the intended private-tester cohort.",
    }),
    gate({
      id: "cohort1-launch-execution",
      label: "Cohort 1 launch execution",
      status: "hold",
      proofType: "owner-visible-ux",
      summary:
        "Cohort 1 launch execution is not proved complete by this branch; PR #592 carries the latest partial readout.",
      evidence: [
        "PR #592 refresh records Cohort 1 readout as PARTIAL.",
        "Admin positive lane, non-admin denial, and feedback persistence passed earlier on the same deployment.",
      ],
      missing: [
        "intended cohort invitation confirmation",
        "tester access completion count",
        "saved pet profile flow count",
        "symptom-check completion count",
        "final report and History proof count",
        "feedback submission count",
        "failed or stalled flow ledger",
      ],
      nextAction:
        "Execute and measure the intended private-tester cohort from the production command center.",
    }),
    gate({
      id: "monitoring-telemetry",
      label: "Monitoring and telemetry",
      status: "hold",
      proofType: "backend-readout",
      summary:
        "Recent Vercel error probes returned no rows, but current App Insights latency/queryability evidence remains unproven.",
      evidence: [
        "Read-only Vercel production error and status-code 500 log probes returned no JSON rows over the last hour.",
        "PR #592 keeps App Insights current queryability HOLD.",
      ],
      missing: [
        "current App Insights durationMs query",
        "current App Insights extractionMs query",
        "current App Insights secondOpinionMs query",
        "owner-visible telemetry leakage scan tied to the launch cohort",
      ],
      nextAction:
        "Capture App Insights latency readout and owner-visible leakage scan in the Cohort 1 readout artifact.",
    }),
    gate({
      id: "serverless-reliability",
      label: "Symptom-check reliability budget",
      status: "hold",
      proofType: "runtime-branch",
      summary:
        "PR #601 has review-only local implementation evidence, but production alias/env/maxDuration and live synthetic scorecard proof remain HOLD.",
      evidence: [
        "PR #601 is open, non-draft, mergeable, and branch-protection BLOCKED with no status checks reported.",
        "PR #591 and PR #592 were refreshed to include PR #601 reliability context.",
      ],
      missing: [
        "protected CI/checks for PR #601",
        "production deployment of PR #601",
        "production alias/env/maxDuration proof",
        "live synthetic symptom-check latency scorecard",
      ],
      nextAction:
        "Land/deploy the reliability branch only after protected gates pass, then run production synthetic latency proof.",
    }),
    gate({
      id: "product-intelligence",
      label: "Owner-visible product intelligence",
      status: "hold",
      proofType: "owner-visible-ux",
      summary:
        "Whoop-style readiness/product-intelligence work has review-only artifacts and open PRs, but production persistence smoke is not complete.",
      evidence: [
        "VET-1564 artifacts exist and claim-language review passed for reviewed strings.",
        "Product-intelligence production readiness still requires live migration and authenticated owner workflow smoke.",
      ],
      missing: [
        "approved live Supabase migration",
        "authenticated owner save/read history smoke",
        "claim-language refresh after any new owner-visible copy",
      ],
      nextAction:
        "Keep product-intelligence public claims HOLD until persistence, smoke proof, and claim-language review pass together.",
    }),
    gate({
      id: "model-promotion",
      label: "Model/NIM promotion",
      status: "hold",
      proofType: "backend-readout",
      summary:
        "Model/NIM promotion remains evidence-gated; intake packet may proceed review-only, but runtime promotion is HOLD.",
      evidence: [
        "Issue #588 remains open.",
        "PR #593 records candidate identity, frozen outputs, hashes, scorecards, owner approval, and smoke proof as incomplete.",
      ],
      missing: [
        "approved candidate identity/provider/artifact hash",
        "frozen baseline outputs",
        "frozen candidate outputs",
        "populated scorecards",
        "owner approval packet",
        "rollback and smoke runbook execution proof",
      ],
      nextAction:
        "Advance review-only evidence capture without changing model flags, provider calls, or runtime routing.",
    }),
    gate({
      id: "public-beta-decision",
      label: "Public beta decision",
      status: "hold",
      proofType: "release-gate",
      summary:
        "Public beta is HOLD until admin, tester, feedback, symptom-check, History, monitoring, owner copy, privacy/support, and rollback lanes all pass.",
      evidence: [
        "PR #591 is the current public-beta HOLD packet.",
        "PR #592 and PR #593 keep Cohort 1 and model promotion evidence incomplete.",
      ],
      missing: [
        "completed Cohort 1 launch outcome summary",
        "production symptom-check reliability proof",
        "current monitoring/App Insights proof",
        "privacy/terms/support gap closure",
        "rollback readiness proof tied to current deployment",
      ],
      nextAction:
        "Keep public beta HOLD and refresh the GO/HOLD document after the missing production evidence is captured.",
    }),
  ];

  const blockers = gates
    .filter((item) => item.status !== "go")
    .map((item) => `${item.label}: ${item.summary}`);

  return {
    ticket: "VET-1560",
    mode: "review-only-launch-readiness-gates",
    generatedAt,
    reviewOnly: true,
    overallStatus: blockers.length === 0 ? "go" : "hold",
    publicBetaDecision: {
      status: "hold",
      reason:
        "Critical production, Cohort 1, monitoring, product-intelligence, model-promotion, and support/privacy evidence remains incomplete.",
    },
    modelPromotionDecision: {
      status: "hold",
      reason:
        "Candidate identity, frozen outputs, scorecards, hashes, owner approval, and smoke proof are incomplete.",
    },
    ownerVisibleUxProof: {
      status: "partial",
      proved: [
        "admin authority on production",
        "unauthenticated admin denial boundary",
        "feedback persistence passed earlier on the same deployment",
      ],
      notProved: [
        "full intended-cohort invitation and tester-access completion",
        "saved pet profile, symptom-check, final report, History, and feedback counts for Cohort 1",
        "owner-visible product-intelligence persistence smoke",
      ],
    },
    backendSchedulerReadoutProof: {
      status: "hold",
      proved: [
        "Vercel production error and 500 log probes returned no JSON rows in the observed one-hour window",
      ],
      notProved: [
        "current App Insights durationMs, extractionMs, and secondOpinionMs queries",
        "scheduler or shadow readout where relevant to the launch decision",
        "model-promotion frozen output and scorecard chain",
      ],
    },
    evidenceSnapshot,
    gates,
    blockers,
    guardrails: [
      "This artifact is a snapshot; refresh live GitHub, production, and telemetry evidence before any public-beta GO claim.",
      "Do not infer owner-visible UX proof from backend scheduler/readout proof.",
      "Do not infer model-promotion readiness from planning artifacts or review-only packets.",
      "Do not mutate Vercel env, Supabase schema, model flags, provider calls, runtime routing, or protected clinical files from this artifact.",
    ],
  };
}

function renderMarkdown(readout) {
  const rows = readout.gates
    .map(
      (item) =>
        `| ${item.label} | ${item.status.toUpperCase()} | ${item.proofType} | ${item.summary} | ${item.nextAction} |`,
    )
    .join("\n");
  const blockers =
    readout.blockers.length > 0
      ? readout.blockers.map((blocker) => `- ${blocker}`).join("\n")
      : "- None";
  const guardrails = readout.guardrails
    .map((guardrail) => `- ${guardrail}`)
    .join("\n");

  return `# VET-1560 Launch Readiness Gates

Generated: ${readout.generatedAt}
Mode: ${readout.mode}
Overall status: ${readout.overallStatus.toUpperCase()}
Public beta: ${readout.publicBetaDecision.status.toUpperCase()}
Model promotion: ${readout.modelPromotionDecision.status.toUpperCase()}

${readout.publicBetaDecision.reason}

## Gates

| Gate | Status | Proof Type | Summary | Next action |
|---|---|---|---|---|
${rows}

## Owner-Visible UX Proof

Status: ${readout.ownerVisibleUxProof.status.toUpperCase()}

Proved:
${readout.ownerVisibleUxProof.proved.map((item) => `- ${item}`).join("\n")}

Not proved:
${readout.ownerVisibleUxProof.notProved.map((item) => `- ${item}`).join("\n")}

## Backend Scheduler/Readout Proof

Status: ${readout.backendSchedulerReadoutProof.status.toUpperCase()}

Proved:
${readout.backendSchedulerReadoutProof.proved.map((item) => `- ${item}`).join("\n")}

Not proved:
${readout.backendSchedulerReadoutProof.notProved.map((item) => `- ${item}`).join("\n")}

## Blockers

${blockers}

## Guardrails

${guardrails}
`;
}

const readout = buildGates();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(readout, null, 2)}\n`);
  writeFileSync(markdownOutPath, renderMarkdown(readout));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownOutPath}`);
} else {
  console.log(JSON.stringify(readout, null, 2));
}
