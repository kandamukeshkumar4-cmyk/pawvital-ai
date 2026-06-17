#!/usr/bin/env node
/**
 * Build a protected clinical diff proof for model-promotion review.
 *
 * This reads the local git diff for protected deterministic clinical files and
 * records whether the current worktree leaves them untouched. It does not edit
 * clinical logic, call providers, or authorize runtime promotion.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(
  process.cwd(),
  "plans/VET-1563-protected-clinical-diff-proof.json"
);

const protectedFiles = [
  "src/lib/triage-engine.ts",
  "src/lib/clinical-matrix.ts",
  "src/app/api/ai/symptom-chat/route.ts",
  "src/lib/symptom-memory.ts",
];

function runGitDiff() {
  const result = spawnSync("git", ["diff", "--", ...protectedFiles], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "git diff failed for protected clinical files");
  }
  return result.stdout;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function buildProof() {
  const diff = runGitDiff();
  return {
    ticket: "VET-1563",
    mode: "review-only-protected-clinical-diff-proof",
    generatedAt:
      process.env.PROTECTED_CLINICAL_DIFF_PROOF_GENERATED_AT ??
      "2026-05-31T00:00:00.000Z",
    protectedFiles,
    command: ["git", "diff", "--", ...protectedFiles],
    status: diff.length === 0 ? "ready" : "blocked",
    diffSha256: sha256(diff),
    diffLineCount: diff.length === 0 ? 0 : diff.split(/\r?\n/).length,
    blocker:
      diff.length === 0
        ? null
        : "Protected deterministic clinical files have local diffs and need an authorizing clinical ticket.",
    proof:
      diff.length === 0
        ? "No local diff in protected deterministic clinical files."
        : "Protected deterministic clinical files have a local diff.",
    guardrails: [
      "This proof does not authorize changing protected clinical files.",
      "If a protected file diff appears, stop promotion work until an explicit clinical ticket authorizes it.",
      "Keep deterministic clinical logic authoritative over model output.",
    ],
  };
}

const proof = buildProof();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(proof, null, 2));
}
