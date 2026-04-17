import crypto from "node:crypto";

import type {
  LiveEvalFailure,
  LiveEvalScorecard,
} from "./benchmark-live-eval";
import type { ProvenanceEntry } from "./provenance-registry";

export interface Wave3CaseRecord {
  id: string;
  complaint_family_tags?: string[];
  risk_tier?: string;
  wave3_strata?: string[];
  must_not_miss_marker?: boolean;
}

export interface Wave3ModalitySummary {
  modality: string;
  caseCount: number;
}

export interface Wave3CanonicalManifest {
  suiteId: string;
  suiteVersion: string;
  generatedAt: string;
  manifestHash: string;
  caseIds: string[];
  shardPaths: string[];
  totalCases: number;
  complaintFamilyCounts: Record<string, number>;
  riskTierCounts: Record<string, number>;
  modalityCounts: Record<string, number>;
}

export interface Wave3LegacyFreezeManifest {
  version: string;
  generatedAt: string;
  uniqueCaseCount: number;
  strata: Array<{
    fileName: string;
  }>;
  multimodalSlices?: Array<{
    fileName: string;
    modality: string;
    caseCount: number;
  }>;
}

export interface Wave3SuiteIdentityCheck {
  aligned: boolean;
  extraCaseIds: string[];
  missingCaseIds: string[];
  duplicateCaseIds: string[];
  failures: string[];
  observedSuiteId: string | null;
  observedManifestHash: string | null;
  observedTotalCases: number | null;
}

export interface Wave3LiveScorecard extends LiveEvalScorecard {
  manifestHash?: string;
  extraCaseIds?: string[];
  missingCaseIds?: string[];
  duplicateCaseIds?: string[];
  suiteIdentityFailures?: string[];
  suiteIdentityAligned?: boolean;
  observedSuiteId?: string | null;
  observedManifestHash?: string | null;
}

export interface Wave3CoverageSummary {
  totalCases: number;
  complaintFamilyCounts: Record<string, number>;
  riskTierCounts: Record<string, number>;
  modalityCounts: Record<string, number>;
}

export interface Wave3ReleaseGateResult {
  pass: boolean;
  failures: string[];
  warnings: string[];
  suiteId: string;
  manifestHash: string;
  totalCases: number;
  generatedAt: string;
  extraCaseIds: string[];
  missingCaseIds: string[];
  duplicateCaseIds: string[];
  suiteIdentityFailures: string[];
  coverage: Wave3CoverageSummary;
  blockingHighRiskFailures: LiveEvalFailure[];
  missingHighStakesRuleIds: string[];
  expiredTierABEntries: ProvenanceEntry[];
  scorecard: Wave3LiveScorecard | null;
}

function incrementCount(
  counts: Record<string, number>,
  key: string | undefined
): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizeIdList(ids: string[]): string[] {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function findDuplicateIds(ids: string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right));
}

function summarizeIdList(ids: string[]): string {
  if (ids.length === 0) return "none";
  if (ids.length <= 8) return ids.join(", ");
  return `${ids.slice(0, 8).join(", ")} (+${ids.length - 8} more)`;
}

function computeWave3ManifestHash(
  manifest: Omit<Wave3CanonicalManifest, "manifestHash">
): string {
  const payload = JSON.stringify({
    suiteId: manifest.suiteId,
    suiteVersion: manifest.suiteVersion,
    generatedAt: manifest.generatedAt,
    caseIds: manifest.caseIds,
    shardPaths: manifest.shardPaths,
    totalCases: manifest.totalCases,
    complaintFamilyCounts: manifest.complaintFamilyCounts,
    riskTierCounts: manifest.riskTierCounts,
    modalityCounts: manifest.modalityCounts,
  });

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function summarizeWave3Coverage(input: {
  cases: Wave3CaseRecord[];
  modalities?: Wave3ModalitySummary[];
}): Wave3CoverageSummary {
  const complaintFamilyCounts: Record<string, number> = {};
  const riskTierCounts: Record<string, number> = {};
  const modalityCounts: Record<string, number> = {};

  for (const caseRecord of input.cases) {
    incrementCount(riskTierCounts, caseRecord.risk_tier);
    for (const family of caseRecord.complaint_family_tags ?? []) {
      incrementCount(complaintFamilyCounts, family);
    }
  }

  for (const modality of input.modalities ?? []) {
    incrementCount(modalityCounts, modality.modality);
    if (modality.caseCount > 1) {
      modalityCounts[modality.modality] = modality.caseCount;
    }
  }

  return {
    totalCases: input.cases.length,
    complaintFamilyCounts: sortCounts(complaintFamilyCounts),
    riskTierCounts: sortCounts(riskTierCounts),
    modalityCounts: sortCounts(modalityCounts),
  };
}

export function buildWave3CanonicalManifestFromLegacy(input: {
  legacyManifest: Wave3LegacyFreezeManifest;
  cases: Wave3CaseRecord[];
}): Wave3CanonicalManifest {
  const suiteVersion = String(input.legacyManifest.version || "").trim();
  if (!suiteVersion) {
    throw new Error("Wave 3 legacy manifest is missing version.");
  }

  const generatedAt = String(input.legacyManifest.generatedAt || "").trim();
  if (!generatedAt) {
    throw new Error("Wave 3 legacy manifest is missing generatedAt.");
  }

  const caseIds = normalizeIdList(
    Array.from(new Set(input.cases.map((caseRecord) => caseRecord.id)))
  );
  if (caseIds.length !== input.legacyManifest.uniqueCaseCount) {
    throw new Error(
      `Wave 3 legacy manifest expected ${input.legacyManifest.uniqueCaseCount} canonical case IDs but resolved ${caseIds.length}.`
    );
  }

  const coverage = summarizeWave3Coverage({
    cases: input.cases,
    modalities: (input.legacyManifest.multimodalSlices ?? []).map((slice) => ({
      modality: slice.modality,
      caseCount: slice.caseCount,
    })),
  });

  const manifestBase = {
    suiteId: suiteVersion,
    suiteVersion,
    generatedAt,
    caseIds,
    shardPaths: input.legacyManifest.strata.map(
      (stratum) => `wave3-freeze/${stratum.fileName}`
    ),
    totalCases: caseIds.length,
    complaintFamilyCounts: coverage.complaintFamilyCounts,
    riskTierCounts: coverage.riskTierCounts,
    modalityCounts: coverage.modalityCounts,
  };

  return {
    ...manifestBase,
    manifestHash: computeWave3ManifestHash(manifestBase),
  };
}

export function validateWave3CanonicalManifest(
  manifest: Wave3CanonicalManifest
): Wave3CanonicalManifest {
  if (!manifest.suiteId?.trim()) {
    throw new Error("Wave 3 canonical manifest is missing suiteId.");
  }
  if (!manifest.suiteVersion?.trim()) {
    throw new Error("Wave 3 canonical manifest is missing suiteVersion.");
  }
  if (!manifest.generatedAt?.trim()) {
    throw new Error("Wave 3 canonical manifest is missing generatedAt.");
  }

  const caseIds = manifest.caseIds.map((caseId) => String(caseId).trim());
  if (caseIds.some((caseId) => caseId.length === 0)) {
    throw new Error("Wave 3 canonical manifest contains blank caseIds.");
  }

  const duplicateCaseIds = findDuplicateIds(caseIds);
  if (duplicateCaseIds.length > 0) {
    throw new Error(
      `Wave 3 canonical manifest contains duplicate caseIds: ${summarizeIdList(duplicateCaseIds)}.`
    );
  }

  if (manifest.totalCases !== caseIds.length) {
    throw new Error(
      `Wave 3 canonical manifest totalCases (${manifest.totalCases}) does not match caseIds length (${caseIds.length}).`
    );
  }

  const manifestBase = {
    suiteId: manifest.suiteId.trim(),
    suiteVersion: manifest.suiteVersion.trim(),
    generatedAt: manifest.generatedAt.trim(),
    caseIds,
    shardPaths: manifest.shardPaths.map((shardPath) => String(shardPath).trim()),
    totalCases: manifest.totalCases,
    complaintFamilyCounts: sortCounts(manifest.complaintFamilyCounts),
    riskTierCounts: sortCounts(manifest.riskTierCounts),
    modalityCounts: sortCounts(manifest.modalityCounts),
  };
  const recomputedHash = computeWave3ManifestHash(manifestBase);

  if (manifest.manifestHash !== recomputedHash) {
    throw new Error(
      `Wave 3 canonical manifest hash mismatch: expected ${recomputedHash}, found ${manifest.manifestHash}.`
    );
  }

  return {
    ...manifestBase,
    manifestHash: recomputedHash,
  };
}

function toHighRiskCaseIdSet(cases: Wave3CaseRecord[]): Set<string> {
  return new Set(
    cases
      .filter(
        (caseRecord) =>
          caseRecord.must_not_miss_marker === true ||
          caseRecord.risk_tier === "tier_1_emergency" ||
          (caseRecord.wave3_strata ?? []).includes("rare-but-critical")
      )
      .map((caseRecord) => caseRecord.id)
  );
}

export function compareWave3SuiteIdentity(input: {
  manifest: Wave3CanonicalManifest;
  observedSuiteId?: string | null;
  observedManifestHash?: string | null;
  observedCaseIds: string[];
  observedTotalCases?: number | null;
  observedLabel?: string;
}): Wave3SuiteIdentityCheck {
  const label = input.observedLabel ?? "Wave 3 artifact";
  const observedSuiteId =
    typeof input.observedSuiteId === "string" && input.observedSuiteId.trim()
      ? input.observedSuiteId.trim()
      : null;
  const observedManifestHash =
    typeof input.observedManifestHash === "string" &&
    input.observedManifestHash.trim()
      ? input.observedManifestHash.trim()
      : null;
  const observedCaseIds = input.observedCaseIds
    .map((caseId) => String(caseId).trim())
    .filter(Boolean);
  const duplicateCaseIds = findDuplicateIds(observedCaseIds);
  const observedCaseIdSet = new Set(observedCaseIds);
  const extraCaseIds = normalizeIdList(
    [...observedCaseIdSet].filter((caseId) => !input.manifest.caseIds.includes(caseId))
  );
  const missingCaseIds = normalizeIdList(
    input.manifest.caseIds.filter((caseId) => !observedCaseIdSet.has(caseId))
  );
  const observedTotalCases =
    typeof input.observedTotalCases === "number" ? input.observedTotalCases : null;
  const failures: string[] = [];

  if (observedSuiteId !== input.manifest.suiteId) {
    failures.push(
      `${label} suiteId (${observedSuiteId ?? "missing"}) does not match canonical Wave 3 suite (${input.manifest.suiteId}).`
    );
  }
  if (observedManifestHash !== input.manifest.manifestHash) {
    failures.push(
      `${label} manifestHash (${observedManifestHash ?? "missing"}) does not match canonical Wave 3 manifest (${input.manifest.manifestHash}).`
    );
  }
  if (observedTotalCases !== null && observedTotalCases !== input.manifest.totalCases) {
    failures.push(
      `${label} totalCases (${observedTotalCases}) does not match canonical Wave 3 suite (${input.manifest.totalCases}).`
    );
  }
  if (duplicateCaseIds.length > 0) {
    failures.push(
      `${label} contains duplicate case IDs: ${summarizeIdList(duplicateCaseIds)}.`
    );
  }
  if (extraCaseIds.length > 0) {
    failures.push(
      `${label} contains ${extraCaseIds.length} extra case ID(s): ${summarizeIdList(extraCaseIds)}.`
    );
  }
  if (missingCaseIds.length > 0) {
    failures.push(
      `${label} is missing ${missingCaseIds.length} canonical case ID(s): ${summarizeIdList(missingCaseIds)}.`
    );
  }

  return {
    aligned: failures.length === 0,
    extraCaseIds,
    missingCaseIds,
    duplicateCaseIds,
    failures,
    observedSuiteId,
    observedManifestHash,
    observedTotalCases,
  };
}

export function enrichLiveScorecardWithWave3Identity(input: {
  manifest: Wave3CanonicalManifest;
  scorecard: LiveEvalScorecard;
  observedSuiteId?: string | null;
  observedManifestHash?: string | null;
  observedCaseIds: string[];
}): Wave3LiveScorecard {
  const identity = compareWave3SuiteIdentity({
    manifest: input.manifest,
    observedSuiteId: input.observedSuiteId ?? input.scorecard.suiteId,
    observedManifestHash: input.observedManifestHash ?? input.manifest.manifestHash,
    observedCaseIds: input.observedCaseIds,
    observedTotalCases: input.scorecard.totalCases,
    observedLabel: "Live scorecard",
  });

  return {
    ...input.scorecard,
    suiteId: input.manifest.suiteId,
    manifestHash: input.manifest.manifestHash,
    extraCaseIds: identity.extraCaseIds,
    missingCaseIds: identity.missingCaseIds,
    duplicateCaseIds: identity.duplicateCaseIds,
    suiteIdentityFailures: identity.failures,
    suiteIdentityAligned: identity.aligned,
    observedSuiteId: identity.observedSuiteId,
    observedManifestHash: identity.observedManifestHash,
    passFail: identity.aligned ? input.scorecard.passFail : "BLOCKED",
  };
}

function readScorecardIdentity(
  manifest: Wave3CanonicalManifest,
  scorecard: Wave3LiveScorecard
): Wave3SuiteIdentityCheck {
  const extraCaseIds = normalizeIdList(scorecard.extraCaseIds ?? []);
  const missingCaseIds = normalizeIdList(scorecard.missingCaseIds ?? []);
  const duplicateCaseIds = normalizeIdList(scorecard.duplicateCaseIds ?? []);
  const failures = [...(scorecard.suiteIdentityFailures ?? [])];
  const observedSuiteId =
    typeof scorecard.observedSuiteId === "string"
      ? scorecard.observedSuiteId
      : scorecard.suiteId;
  const observedManifestHash =
    typeof scorecard.observedManifestHash === "string"
      ? scorecard.observedManifestHash
      : scorecard.manifestHash ?? null;

  if (scorecard.suiteIdentityAligned === true && failures.length > 0) {
    failures.push(
      "Live scorecard marked suite identity as aligned even though mismatch failures were recorded."
    );
  }
  if (scorecard.suiteIdentityAligned === false && failures.length === 0) {
    failures.push(
      "Live scorecard marked suite identity as not aligned without recording mismatch details."
    );
  }
  if (scorecard.suiteId !== manifest.suiteId) {
    failures.push(
      `Live scorecard suiteId (${scorecard.suiteId}) does not match canonical Wave 3 suite (${manifest.suiteId}).`
    );
  }
  if ((scorecard.manifestHash ?? null) !== manifest.manifestHash) {
    failures.push(
      `Live scorecard manifestHash (${scorecard.manifestHash ?? "missing"}) does not match canonical Wave 3 manifest (${manifest.manifestHash}).`
    );
  }
  if (scorecard.totalCases !== manifest.totalCases) {
    failures.push(
      `Live scorecard totalCases (${scorecard.totalCases}) does not match canonical Wave 3 suite (${manifest.totalCases}).`
    );
  }

  return {
    aligned:
      failures.length === 0 &&
      extraCaseIds.length === 0 &&
      missingCaseIds.length === 0 &&
      duplicateCaseIds.length === 0,
    extraCaseIds,
    missingCaseIds,
    duplicateCaseIds,
    failures,
    observedSuiteId,
    observedManifestHash,
    observedTotalCases: scorecard.totalCases,
  };
}

export function evaluateWave3ReleaseGate(input: {
  manifest: Wave3CanonicalManifest;
  cases: Wave3CaseRecord[];
  modalities?: Wave3ModalitySummary[];
  scorecard: Wave3LiveScorecard | null;
  requiredHighStakesRuleIds: string[];
  provenanceEntries: ProvenanceEntry[];
  referenceDate?: Date;
}): Wave3ReleaseGateResult {
  const coverage = summarizeWave3Coverage({
    cases: input.cases,
    modalities: input.modalities,
  });
  const failures: string[] = [];
  const warnings: string[] = [];
  const generatedAt = new Date().toISOString();

  const availableRuleIds = new Set(
    input.provenanceEntries.map((entry) => entry.rule_id)
  );
  const missingHighStakesRuleIds = input.requiredHighStakesRuleIds.filter(
    (ruleId) => !availableRuleIds.has(ruleId)
  );
  const referenceDate = input.referenceDate ?? new Date();
  const expiredTierABEntries = input.provenanceEntries.filter((entry) => {
    if (!entry.high_stakes) return false;
    if (entry.evidence_tier !== "A" && entry.evidence_tier !== "B") {
      return false;
    }
    const nextReview = new Date(`${entry.next_review}T00:00:00Z`);
    return Number.isFinite(nextReview.valueOf()) && nextReview < referenceDate;
  });

  const scorecard = input.scorecard;
  const suiteIdentity = scorecard
    ? readScorecardIdentity(input.manifest, scorecard)
    : {
        aligned: false,
        extraCaseIds: [] as string[],
        missingCaseIds: [] as string[],
        duplicateCaseIds: [] as string[],
        failures: [
          "Live scorecard is missing, so Wave 3 suite identity cannot be verified.",
        ],
        observedSuiteId: null,
        observedManifestHash: null,
        observedTotalCases: null,
      };
  const highRiskCaseIds = toHighRiskCaseIdSet(input.cases);
  const blockingHighRiskFailures = scorecard
    ? scorecard.failures.filter((failure) => highRiskCaseIds.has(failure.caseId))
    : [];

  if (!scorecard) {
    failures.push("Missing live scorecard for Wave 3 release gate.");
  } else {
    failures.push(...suiteIdentity.failures);
    if (scorecard.emergencyRecall < 0.98) {
      failures.push(
        `Emergency recall ${(scorecard.emergencyRecall * 100).toFixed(1)}% is below the 98.0% gate.`
      );
    }
    if (scorecard.unsafeDowngradeRate >= 0.01) {
      failures.push(
        `Unsafe downgrade rate ${(scorecard.unsafeDowngradeRate * 100).toFixed(2)}% exceeds the 1.00% gate.`
      );
    }
    if (blockingHighRiskFailures.length > 0) {
      failures.push(
        `${blockingHighRiskFailures.length} blocking failure(s) still hit rare-but-critical or must-not-miss cases.`
      );
    }
    if (scorecard.passFail === "BLOCKED") {
      failures.push("Live scorecard is blocked and cannot clear the Wave 3 release gate.");
    }
  }

  if (missingHighStakesRuleIds.length > 0) {
    failures.push(
      `${missingHighStakesRuleIds.length} required high-stakes provenance rule(s) are missing.`
    );
  }

  if (expiredTierABEntries.length > 0) {
    failures.push(
      `${expiredTierABEntries.length} high-stakes Tier A/B provenance entry or entries are expired.`
    );
  }

  if (Object.keys(coverage.modalityCounts).length === 0) {
    warnings.push("No multimodal slice coverage was found in the Wave 3 manifest.");
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    suiteId: input.manifest.suiteId,
    manifestHash: input.manifest.manifestHash,
    totalCases: input.manifest.totalCases,
    generatedAt,
    extraCaseIds: suiteIdentity.extraCaseIds,
    missingCaseIds: suiteIdentity.missingCaseIds,
    duplicateCaseIds: suiteIdentity.duplicateCaseIds,
    suiteIdentityFailures: suiteIdentity.failures,
    coverage,
    blockingHighRiskFailures,
    missingHighStakesRuleIds,
    expiredTierABEntries,
    scorecard,
  };
}

function renderCountsTable(
  heading: string,
  counts: Record<string, number>
): string {
  const entries = Object.entries(counts).sort((left, right) =>
    left[0].localeCompare(right[0])
  );
  if (entries.length === 0) {
    return `## ${heading}\n\n_No data_\n`;
  }

  const rows = entries
    .map(([key, count]) => `| ${key} | ${count} |`)
    .join("\n");
  return `## ${heading}\n\n| Bucket | Cases |\n| --- | ---: |\n${rows}\n`;
}

export function renderWave3ReleaseGateMarkdown(
  result: Wave3ReleaseGateResult
): string {
  const header = [
    "# Wave 3 Release Gate Report",
    "",
    `- Generated at: ${result.generatedAt}`,
    `- Result: ${result.pass ? "PASS" : "FAIL"}`,
    `- Suite ID: ${result.suiteId}`,
    `- Manifest hash: ${result.manifestHash}`,
    `- Total frozen cases: ${result.totalCases}`,
    result.scorecard
      ? `- Scorecard case count: ${result.scorecard.totalCases}`
      : "- Scorecard case count: unavailable",
    result.scorecard
      ? `- Scorecard generatedAt: ${result.scorecard.generatedAt}`
      : "- Scorecard generatedAt: unavailable",
    result.scorecard
      ? `- Scorecard observed suiteId: ${result.scorecard.observedSuiteId ?? result.scorecard.suiteId}`
      : "- Scorecard observed suiteId: unavailable",
    result.scorecard
      ? `- Emergency recall: ${(result.scorecard.emergencyRecall * 100).toFixed(1)}%`
      : "- Emergency recall: unavailable",
    result.scorecard
      ? `- Unsafe downgrade rate: ${(result.scorecard.unsafeDowngradeRate * 100).toFixed(2)}%`
      : "- Unsafe downgrade rate: unavailable",
    "",
  ].join("\n");

  const suiteIdentity = [
    "## Suite Identity",
    "",
    `- Extra case IDs: ${result.extraCaseIds.length > 0 ? summarizeIdList(result.extraCaseIds) : "none"}`,
    `- Missing case IDs: ${result.missingCaseIds.length > 0 ? summarizeIdList(result.missingCaseIds) : "none"}`,
    `- Duplicate case IDs: ${result.duplicateCaseIds.length > 0 ? summarizeIdList(result.duplicateCaseIds) : "none"}`,
    "",
    result.suiteIdentityFailures.length > 0
      ? result.suiteIdentityFailures.map((failure) => `- ${failure}`).join("\n")
      : "- Suite identity aligned with the canonical Wave 3 manifest.",
    "",
  ].join("\n");

  const failures =
    result.failures.length > 0
      ? `## Failures\n\n${result.failures.map((failure) => `- ${failure}`).join("\n")}\n`
      : "## Failures\n\n_None_\n";

  const warnings =
    result.warnings.length > 0
      ? `## Warnings\n\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}\n`
      : "## Warnings\n\n_None_\n";

  const highRiskFailures =
    result.blockingHighRiskFailures.length > 0
      ? `## Blocking High-Risk Failures\n\n${result.blockingHighRiskFailures
          .slice(0, 20)
          .map(
            (failure) =>
              `- ${failure.caseId}: ${failure.severity} ${failure.category} (${failure.description})`
          )
          .join("\n")}\n`
      : "## Blocking High-Risk Failures\n\n_None_\n";

  const missingRules =
    result.missingHighStakesRuleIds.length > 0
      ? `## Missing High-Stakes Rule IDs\n\n${result.missingHighStakesRuleIds
          .map((ruleId) => `- ${ruleId}`)
          .join("\n")}\n`
      : "## Missing High-Stakes Rule IDs\n\n_None_\n";

  const expiredEntries =
    result.expiredTierABEntries.length > 0
      ? `## Expired Tier A/B Entries\n\n${result.expiredTierABEntries
          .map(
            (entry) =>
              `- ${entry.rule_id} (next review ${entry.next_review}, tier ${entry.evidence_tier})`
          )
          .join("\n")}\n`
      : "## Expired Tier A/B Entries\n\n_None_\n";

  return [
    header,
    suiteIdentity,
    failures,
    warnings,
    highRiskFailures,
    missingRules,
    expiredEntries,
    renderCountsTable(
      "Complaint Family Scorecard",
      result.coverage.complaintFamilyCounts
    ),
    renderCountsTable("Risk Tier Scorecard", result.coverage.riskTierCounts),
    renderCountsTable("Modality Scorecard", result.coverage.modalityCounts),
  ].join("\n");
}
