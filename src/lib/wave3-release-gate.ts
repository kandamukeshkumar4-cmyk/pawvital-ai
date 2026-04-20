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

export interface Wave3CoverageSummary {
  totalCases: number;
  complaintFamilyCounts: Record<string, number>;
  riskTierCounts: Record<string, number>;
  modalityCounts: Record<string, number>;
}

export interface Wave3CanonicalSuiteSummary {
  suiteId: string;
  suiteVersion: string;
  generatedAt: string;
  manifestHash: string;
  totalCases: number;
  caseIds: string[];
}

export interface Wave3ReleaseGateResult {
  pass: boolean;
  failures: string[];
  warnings: string[];
  canonicalSuite: Wave3CanonicalSuiteSummary;
  coverage: Wave3CoverageSummary;
  blockingHighRiskFailures: LiveEvalFailure[];
  missingHighStakesRuleIds: string[];
  expiredTierABEntries: ProvenanceEntry[];
  scorecard: LiveEvalScorecard | null;
}

function incrementCount(
  counts: Record<string, number>,
  key: string | undefined
): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
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
    complaintFamilyCounts,
    riskTierCounts,
    modalityCounts,
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

export function evaluateWave3ReleaseGate(input: {
  cases: Wave3CaseRecord[];
  modalities?: Wave3ModalitySummary[];
  scorecard: LiveEvalScorecard | null;
  canonicalSuite: Wave3CanonicalSuiteSummary;
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
  const highRiskCaseIds = toHighRiskCaseIdSet(input.cases);
  const blockingHighRiskFailures = scorecard
    ? scorecard.failures.filter((failure) => highRiskCaseIds.has(failure.caseId))
    : [];

  if (!scorecard) {
    failures.push("Missing live scorecard for Wave 3 release gate.");
  } else {
    const extraCaseIds = scorecard.extraCaseIds ?? [];
    const missingCaseIds = scorecard.missingCaseIds ?? [];

    if (scorecard.suiteId !== input.canonicalSuite.suiteId) {
      failures.push(
        `Live scorecard suite identity (${scorecard.suiteId}) does not match canonical suite identity (${input.canonicalSuite.suiteId}).`
      );
    }
    if (scorecard.manifestHash !== input.canonicalSuite.manifestHash) {
      failures.push(
        `Live scorecard manifest hash (${scorecard.manifestHash || "missing"}) does not match canonical manifest hash (${input.canonicalSuite.manifestHash}).`
      );
    }
    if (
      typeof scorecard.suiteTotalCases === "number" &&
      scorecard.suiteTotalCases !== input.canonicalSuite.totalCases
    ) {
      failures.push(
        `Live scorecard canonical suite case count (${scorecard.suiteTotalCases}) does not match Wave 3 freeze (${input.canonicalSuite.totalCases}).`
      );
    }
    if (scorecard.totalCases !== input.cases.length) {
      failures.push(
        `Live scorecard case count (${scorecard.totalCases}) does not match Wave 3 freeze (${input.cases.length}).`
      );
    }
    if (extraCaseIds.length > 0) {
      failures.push(
        `Live scorecard includes extra case IDs outside the canonical manifest: ${extraCaseIds.join(", ")}.`
      );
    }
    if (missingCaseIds.length > 0) {
      failures.push(
        `Live scorecard is missing canonical case IDs: ${missingCaseIds.join(", ")}.`
      );
    }
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
    canonicalSuite: input.canonicalSuite,
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
  const scorecardExtraCaseIds = result.scorecard?.extraCaseIds ?? [];
  const scorecardMissingCaseIds = result.scorecard?.missingCaseIds ?? [];
  const header = [
    "# Wave 3 Release Gate Report",
    "",
    `- Result: ${result.pass ? "PASS" : "FAIL"}`,
    `- Suite ID: ${result.canonicalSuite.suiteId}`,
    `- Suite version: ${result.canonicalSuite.suiteVersion}`,
    `- Manifest hash: ${result.canonicalSuite.manifestHash}`,
    `- Canonical manifest generated at: ${result.canonicalSuite.generatedAt}`,
    `- Total frozen cases: ${result.canonicalSuite.totalCases}`,
    result.scorecard
      ? `- Scorecard case count: ${result.scorecard.totalCases}`
      : "- Scorecard case count: unavailable",
    result.scorecard
      ? `- Emergency recall: ${(result.scorecard.emergencyRecall * 100).toFixed(1)}%`
      : "- Emergency recall: unavailable",
    result.scorecard
      ? `- Unsafe downgrade rate: ${(result.scorecard.unsafeDowngradeRate * 100).toFixed(2)}%`
      : "- Unsafe downgrade rate: unavailable",
    result.scorecard
      ? `- Extra case IDs: ${scorecardExtraCaseIds.length > 0 ? scorecardExtraCaseIds.join(", ") : "none"}`
      : "- Extra case IDs: unavailable",
    result.scorecard
      ? `- Missing case IDs: ${scorecardMissingCaseIds.length > 0 ? scorecardMissingCaseIds.join(", ") : "none"}`
      : "- Missing case IDs: unavailable",
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
