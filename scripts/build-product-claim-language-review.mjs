#!/usr/bin/env node
/**
 * Build the VET-1564C owner-facing claim-language review artifact.
 *
 * This is a deterministic review of product-intelligence copy. It checks that
 * owner-visible readiness, trend, recovery, and evidence-coach language keeps
 * diagnosis/prognosis/treatment/emergency-clearance claims out of the product
 * surface. It does not call models, providers, or mutate clinical logic.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(
  process.cwd(),
  "plans/VET-1564C-claim-language-review.json"
);

const reviewedFiles = [
  "src/lib/product-intelligence.ts",
  "src/lib/recovery-checkpoint.ts",
  "src/lib/product-intelligence-owner-workflow.ts",
  "src/components/analytics/product-intelligence-panel.tsx",
  "src/app/(dashboard)/analytics/page.tsx",
  "plans/VET-1564-longitudinal-readiness-contract.json",
  "plans/VET-1564-product-intelligence-roadmap.json",
];

const blockedClaims = [
  {
    id: "diagnosis-certainty",
    pattern: /\b(diagnosed|diagnosis certainty|definitely has|confirmed disease)\b/i,
    allowedContext: /\bnot a diagnosis|without creating unsupported diagnosis|diagnosis certainty\b/i,
  },
  {
    id: "treatment-recommendation",
    pattern: /\b(treat with|give your dog|start medication|dosage|treatment recommendation)\b/i,
    allowedContext: /\bnot a treatment plan|treatment recommendation\b/i,
  },
  {
    id: "prognosis-promise",
    pattern: /\b(will recover|guaranteed recovery|prognosis promise|will be fine)\b/i,
    allowedContext: /\bnot a prognosis|prognosis promise\b/i,
  },
  {
    id: "emergency-clearance",
    pattern: /\b(no emergency|safe to wait|emergency clearance|ignore emergency)\b/i,
    allowedContext: /\bnot .*emergency clearance|emergency-clearance claims|emergency clearance\b/i,
  },
  {
    id: "clinical-clearance",
    pattern: /\b(cleared|clearance language|clinically clear)\b/i,
    allowedContext: /\bmustNotShow|clinical clearance language|emergency clearance\b/i,
  },
];

const requiredGuardPhrases = [
  "not a diagnosis",
  "not a diagnosis, prognosis, treatment plan, or emergency clearance",
  "not a diagnosis or clearance",
  "not disease progression certainty",
  "not a vet discharge decision",
  "do not delay urgent care",
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

function extractQuotedStrings(source) {
  const strings = [];
  const matcher = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const value = match[2].replace(/\\n/g, "\n").trim();
    if (value.length < 8) continue;
    if (/^[A-Z0-9_./:-]+$/.test(value)) continue;
    strings.push(value);
  }
  return strings;
}

function reviewedStrings() {
  const strings = [];
  for (const relativePath of reviewedFiles) {
    const absolutePath = resolve(process.cwd(), relativePath);
    if (!existsSync(absolutePath)) continue;
    const source = readFileSync(absolutePath, "utf8");
    for (const text of extractQuotedStrings(source)) {
      strings.push({ path: relativePath, text });
    }
  }
  return strings;
}

function classifyFindings(strings) {
  const findings = [];
  for (const item of strings) {
    for (const claim of blockedClaims) {
      if (claim.pattern.test(item.text) && !claim.allowedContext.test(item.text)) {
        findings.push({
          claimId: claim.id,
          path: item.path,
          text: item.text,
          severity: "blocking",
        });
      }
    }
  }
  return findings;
}

function guardCoverage(strings) {
  const haystack = strings.map((item) => item.text.toLowerCase()).join("\n");
  return requiredGuardPhrases.map((phrase) => ({
    phrase,
    present: haystack.includes(phrase.toLowerCase()),
  }));
}

function buildReview() {
  const strings = reviewedStrings();
  const findings = classifyFindings(strings);
  const guards = guardCoverage(strings);
  const missingGuards = guards.filter((guard) => !guard.present);
  const reviewedArtifacts = reviewedFiles.map(artifact);
  const missingArtifacts = reviewedArtifacts
    .filter((item) => !item.exists)
    .map((item) => item.path);

  return {
    ticket: "VET-1564C",
    generatedAt:
      process.env.PRODUCT_CLAIM_LANGUAGE_REVIEW_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    mode: "review-only",
    note:
      "Deterministic claim-language review only. It does not call providers, generate model copy, or mutate clinical logic.",
    reviewedArtifacts,
    missingArtifacts,
    reviewedStringCount: strings.length,
    blockedClaimPolicy: blockedClaims.map((claim) => claim.id),
    guardCoverage: guards,
    findings,
    verdict:
      findings.length === 0 && missingGuards.length === 0 && missingArtifacts.length === 0
        ? "pass"
        : "blocked",
    blockedReason:
      findings.length === 0 && missingGuards.length === 0 && missingArtifacts.length === 0
        ? null
        : [
            missingArtifacts.length > 0
              ? `missing review inputs: ${missingArtifacts.join(", ")}`
              : null,
            findings.length > 0 ? "blocked claim language found" : null,
            missingGuards.length > 0
              ? `missing guard phrases: ${missingGuards.map((guard) => guard.phrase).join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join("; "),
    reopenConditions: [
      "Any new owner-visible readiness, trend, recovery, evidence-coach, or model-summary copy is added.",
      "Any model-generated copy is promoted to an owner-visible surface.",
      "Any clinical deterministic escalation copy changes.",
      "Any runtime NIM or adapter route starts influencing readiness copy.",
    ],
  };
}

const review = buildReview();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(review, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(review, null, 2));
}
