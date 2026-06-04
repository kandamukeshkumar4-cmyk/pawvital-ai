#!/usr/bin/env node
/**
 * Build a review-only rollback plan for a future model route promotion.
 *
 * This creates the rollback evidence required before a separate promotion
 * ticket may change runtime routing. It does not change routing or env values.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const role = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.slice("--role=".length) ?? "extraction";

const experimentPath = resolve(
  process.cwd(),
  "plans/VET-1562-offline-experiment-package.json"
);
const routingMatrixPath = resolve(
  process.cwd(),
  "plans/VET-1563-model-routing-matrix.json"
);
const outPath = resolve(
  process.cwd(),
  `plans/VET-1563-${role}-model-rollback-plan.json`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path) {
  return {
    path,
    exists: existsSync(path),
    sha256: existsSync(path) ? sha256(path) : null,
  };
}

function findRoleRoute(routingMatrix) {
  return (routingMatrix.routes ?? routingMatrix.modelRoutes ?? []).find(
    (route) => route.role === role
  );
}

function buildPlan() {
  const experiment = readJson(experimentPath);
  const routingMatrix = readJson(routingMatrixPath);
  const route = findRoleRoute(routingMatrix);
  const baseline = experiment.baselineRoute ?? {};
  const currentRuntimeSurface =
    baseline.currentRuntimeSurface ?? route?.runtimeSurface ?? "src/lib/model-router.ts";
  const currentPrimaryModel =
    baseline.primaryModel ?? route?.primaryModel ?? route?.primary ?? null;
  const currentFallbackModel =
    baseline.fallbackModel ?? route?.fallbackModel ?? route?.fallback ?? null;

  const missing = [];
  if (!currentRuntimeSurface) missing.push("current runtime surface");
  if (!currentPrimaryModel) missing.push("current primary model");
  if (!currentFallbackModel) missing.push("current fallback model");

  return {
    ticket: "VET-1563",
    role,
    mode: "review-only-rollback-plan",
    generatedAt:
      process.env.MODEL_ROLLBACK_PLAN_GENERATED_AT ?? "2026-05-31T00:00:00.000Z",
    status: missing.length === 0 ? "ready" : "blocked",
    inputArtifacts: {
      experimentPackage: artifact(experimentPath),
      routingMatrix: artifact(routingMatrixPath),
    },
    currentRuntimeSurface,
    currentPrimaryModel,
    currentFallbackModel,
    previousRouteOrConfigValue: {
      role,
      primaryModel: currentPrimaryModel,
      fallbackModel: currentFallbackModel,
      runtimeSurface: currentRuntimeSurface,
    },
    rollbackCommand:
      "git revert <promotion-commit> && npm run models:promotion-preflight && npm test -- --runTestsByPath tests/model-promotion-readiness-preflight.test.ts",
    productionSmokePlan: [
      "Run the separate promotion ticket's model route smoke against validation cases.",
      "Confirm deterministic emergency and clinical state fields still come from protected clinical logic.",
      "Regenerate VET-1563 promotion preflight and verify the route is back on the previous primary/fallback values.",
    ],
    missing,
    blocker:
      missing.length === 0
        ? null
        : `Rollback plan missing: ${missing.join(", ")}`,
    guardrails: [
      "This rollback plan does not authorize promotion.",
      "Promotion must happen in a separate ticket after scorecard, output hashes, owner approval, and clinical proof are complete.",
      "Rollback must restore previous route or config values before investigating candidate failures.",
    ],
  };
}

const plan = buildPlan();

if (process.argv.includes("--write")) {
  writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(JSON.stringify(plan, null, 2));
}
