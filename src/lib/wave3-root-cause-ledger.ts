import * as fs from "node:fs";
import * as path from "node:path";
import type { LiveEvalFailure, LiveEvalScorecard } from "./benchmark-live-eval";
import type { Wave3CanonicalCase, Wave3CanonicalManifest } from "./wave3-suite-manifest";

export type Wave3RootCauseBucket =
  | "complaint normalization miss"
  | "deterministic emergency composite not triggered"
  | "question orchestration overriding emergency"
  | "report readiness contract mismatch"
  | "harness expectation / route contract mismatch"
  | "missing red flag linkage"
  | "missing symptom synonym / owner-language mapping";

export interface Wave3FailureLedgerEntry {
  caseId: string; severity: LiveEvalFailure["severity"]; expected: string; actual: string;
  complaintFamilies: string[]; riskTier: string | null; actualResponseType: string;
  rootCauseBucket: Wave3RootCauseBucket; ownerMessage: string; description: string;
}
export interface Wave3SeverityCounts { CRITICAL: number; HIGH: number; MEDIUM: number; }
export interface Wave3RootCauseSummaryRow {
  rootCauseBucket: Wave3RootCauseBucket; totalFailures: number;
  severityCounts: Wave3SeverityCounts; caseIds: string[];
}
export interface Wave3RootCauseDeltaRow {
  rootCauseBucket: Wave3RootCauseBucket; status: "improved" | "regressed" | "unchanged";
  previousTotalFailures: number; currentTotalFailures: number; deltaFailures: number;
  previousSeverityCounts: Wave3SeverityCounts; currentSeverityCounts: Wave3SeverityCounts;
  severityDelta: Wave3SeverityCounts; newCaseIds: string[]; resolvedCaseIds: string[];
  compositionChanged: boolean;
}
export interface Wave3FailureLedgerDelta {
  comparedToGeneratedAt: string | null; previousTotalFailures: number | null;
  totalFailureDelta: number | null;
  countsByStatus: Record<Wave3RootCauseDeltaRow["status"], number>;
  rootCauseChanges: Wave3RootCauseDeltaRow[];
}
export interface Wave3FailureLedger {
  generatedAt: string; suiteId: string; manifestHash: string; totalFailures: number;
  hasScorecard: boolean;
  entries: Wave3FailureLedgerEntry[]; byComplaintFamily: Record<string, number>;
  byRiskTier: Record<string, number>; byActualResponseType: Record<string, number>;
  byRootCauseBucket: Record<string, number>; rootCauseSummary: Wave3RootCauseSummaryRow[];
  delta: Wave3FailureLedgerDelta;
}
export interface Wave3ResidualBlocker {
  caseId: string; severity: LiveEvalFailure["severity"]; frequency: number;
  rootCauseBucket: Wave3RootCauseBucket; summary: string; recommendedNextTicket: string;
}
export interface Wave3ResidualBlockerBand {
  total: number; caseIds: string[]; byRootCauseBucket: Record<string, number>;
}
export interface Wave3ResidualBlockerSeverityBands {
  criticalReleaseBlockers: Wave3ResidualBlockerBand;
  highNonBlockingFailures: Wave3ResidualBlockerBand;
  mediumFollowupReadinessFailures: Wave3ResidualBlockerBand;
}
export interface Wave3ResidualBlockerSummary {
  totalBlockers: number; bySeverity: Wave3SeverityCounts; byRootCauseBucket: Record<string, number>;
  severityBands: Wave3ResidualBlockerSeverityBands;
}
export interface Wave3ResidualBlockerBandDelta {
  previousTotal: number | null; currentTotal: number; delta: number | null;
}
export interface Wave3ResidualBlockerBandDeltas {
  criticalReleaseBlockers: Wave3ResidualBlockerBandDelta;
  highNonBlockingFailures: Wave3ResidualBlockerBandDelta;
  mediumFollowupReadinessFailures: Wave3ResidualBlockerBandDelta;
}
export type Wave3ResidualBlockerDeltaStatus = "new" | "resolved" | "improved" | "regressed" | "unchanged";
export interface Wave3ResidualBlockerChange {
  caseId: string; severity: LiveEvalFailure["severity"]; status: Wave3ResidualBlockerDeltaStatus;
  frequencyDelta: number; rootCauseChanged: boolean; summaryChanged: boolean;
  previousSeverity: LiveEvalFailure["severity"] | null; currentSeverity: LiveEvalFailure["severity"] | null;
  previousFrequency: number | null; currentFrequency: number | null;
  previousRootCauseBucket: Wave3RootCauseBucket | null; currentRootCauseBucket: Wave3RootCauseBucket | null;
  previousSummary: string | null; currentSummary: string | null;
}
export interface Wave3ResidualBlockerDelta {
  comparedToGeneratedAt: string | null; previousTotalBlockers: number | null;
  blockerDelta: number | null; countsByStatus: Record<Wave3ResidualBlockerDeltaStatus, number>;
  bandDeltas: Wave3ResidualBlockerBandDeltas; changes: Wave3ResidualBlockerChange[];
}
export interface Wave3ResidualBlockerList {
  generatedAt: string; suiteId: string; manifestHash: string; summary: Wave3ResidualBlockerSummary;
  delta: Wave3ResidualBlockerDelta; blockers: Wave3ResidualBlocker[];
}

function createSeverityCounts(): Wave3SeverityCounts { return { CRITICAL: 0, HIGH: 0, MEDIUM: 0 }; }
function createRootCauseDeltaCounts(): Record<Wave3RootCauseDeltaRow["status"], number> { return { improved: 0, regressed: 0, unchanged: 0 }; }
function createResidualDeltaCounts(): Record<Wave3ResidualBlockerDeltaStatus, number> {
  return { new: 0, resolved: 0, improved: 0, regressed: 0, unchanged: 0 };
}
function incrementCount(counts: Record<string, number>, key: string | undefined | null): void { if (key) counts[key] = (counts[key] ?? 0) + 1; }
function incrementSeverityCount(counts: Wave3SeverityCounts, severity: LiveEvalFailure["severity"]): void { counts[severity] += 1; }
function severitySortKey(severity: LiveEvalFailure["severity"]): number { return { CRITICAL: 0, HIGH: 1, MEDIUM: 2 }[severity]; }
function compareSeverityCounts(left: Wave3SeverityCounts, right: Wave3SeverityCounts): number {
  if (left.CRITICAL !== right.CRITICAL) return right.CRITICAL - left.CRITICAL;
  if (left.HIGH !== right.HIGH) return right.HIGH - left.HIGH;
  if (left.MEDIUM !== right.MEDIUM) return right.MEDIUM - left.MEDIUM;
  return 0;
}
function compareSeverityDeltas(
  previousCounts: Wave3SeverityCounts,
  currentCounts: Wave3SeverityCounts
): number {
  if (currentCounts.CRITICAL !== previousCounts.CRITICAL) {
    return currentCounts.CRITICAL - previousCounts.CRITICAL;
  }
  if (currentCounts.HIGH !== previousCounts.HIGH) {
    return currentCounts.HIGH - previousCounts.HIGH;
  }
  if (currentCounts.MEDIUM !== previousCounts.MEDIUM) {
    return currentCounts.MEDIUM - previousCounts.MEDIUM;
  }
  return 0;
}
function diffSeverityCounts(current: Wave3SeverityCounts, previous: Wave3SeverityCounts): Wave3SeverityCounts {
  return {
    CRITICAL: current.CRITICAL - previous.CRITICAL,
    HIGH: current.HIGH - previous.HIGH,
    MEDIUM: current.MEDIUM - previous.MEDIUM,
  };
}
function sortCountRecord(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
function escapeTableCell(value: string): string { return value.replace(/\|/g, "\\|"); }
function formatSignedDelta(value: number | null): string { return value === null ? "n/a" : value === 0 ? "0" : value > 0 ? `+${value}` : String(value); }
function uniqueSorted(values: string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}
function resolveDefaultArtifactPath(fileName: string): string {
  return path.join(process.cwd(), "data", "benchmarks", "dog-triage", fileName);
}
function resolveBaselineArtifactPath(
  previousPath: string | null | undefined,
  defaultFileName: string
): string | null {
  if (previousPath === null) return null;
  return path.resolve(previousPath ?? resolveDefaultArtifactPath(defaultFileName));
}
function createResidualBlockerBand(): Wave3ResidualBlockerBand {
  return { total: 0, caseIds: [], byRootCauseBucket: {} };
}
function addBlockerToBand(
  band: Wave3ResidualBlockerBand,
  blocker: Wave3ResidualBlocker
): void {
  band.total += 1;
  band.caseIds.push(blocker.caseId);
  incrementCount(band.byRootCauseBucket, blocker.rootCauseBucket);
}
function finalizeResidualBlockerBand(band: Wave3ResidualBlockerBand): Wave3ResidualBlockerBand {
  return {
    total: band.total,
    caseIds: uniqueSorted(band.caseIds),
    byRootCauseBucket: sortCountRecord(band.byRootCauseBucket),
  };
}
function isMediumFollowupReadinessBlocker(blocker: Wave3ResidualBlocker): boolean {
  return (
    blocker.severity === "MEDIUM" &&
    (
      blocker.caseId.startsWith("followup-") ||
      blocker.rootCauseBucket === "report readiness contract mismatch"
    )
  );
}
function buildResidualSeverityBands(blockers: Wave3ResidualBlocker[]): Wave3ResidualBlockerSeverityBands {
  const criticalReleaseBlockers = createResidualBlockerBand();
  const highNonBlockingFailures = createResidualBlockerBand();
  const mediumFollowupReadinessFailures = createResidualBlockerBand();

  for (const blocker of blockers) {
    if (blocker.severity === "CRITICAL") {
      addBlockerToBand(criticalReleaseBlockers, blocker);
      continue;
    }
    if (blocker.severity === "HIGH") {
      addBlockerToBand(highNonBlockingFailures, blocker);
      continue;
    }
    if (isMediumFollowupReadinessBlocker(blocker)) {
      addBlockerToBand(mediumFollowupReadinessFailures, blocker);
    }
  }

  return {
    criticalReleaseBlockers: finalizeResidualBlockerBand(criticalReleaseBlockers),
    highNonBlockingFailures: finalizeResidualBlockerBand(highNonBlockingFailures),
    mediumFollowupReadinessFailures: finalizeResidualBlockerBand(mediumFollowupReadinessFailures),
  };
}
function buildResidualBandDelta(currentTotal: number, previousTotal: number | null): Wave3ResidualBlockerBandDelta {
  return {
    previousTotal,
    currentTotal,
    delta: previousTotal === null ? null : currentTotal - previousTotal,
  };
}

function getOwnerMessage(caseRecord: Wave3CanonicalCase | undefined): string {
  const request = caseRecord?.request && typeof caseRecord.request === "object"
    ? (caseRecord.request as { messages?: unknown })
    : null;
  const messages = Array.isArray(request?.messages)
    ? (request.messages as Array<{ role?: string; content?: string }>)
    : [];
  const ownerMessage = messages.find(
    (message) => message && typeof message === "object" && message.role === "user" && typeof message.content === "string"
  );
  return typeof ownerMessage?.content === "string" ? ownerMessage.content : "";
}

function classifyRootCauseBucket(
  failure: LiveEvalFailure,
  caseRecord: Wave3CanonicalCase | undefined
): Wave3RootCauseBucket {
  const description = failure.description.toLowerCase();
  const ownerMessage = getOwnerMessage(caseRecord).toLowerCase();
  if (failure.category === "suite_alignment") return "harness expectation / route contract mismatch";
  if (description.includes("readyforreport") && !description.includes("responsetype")) return "report readiness contract mismatch";
  if (description.includes("knownsymptomsinclude")) return "complaint normalization miss";
  if (/\b(bee sting|bug bite|hives?|welts?|dragging|back legs|tight and swollen|while lying still|after a big meal|got excited, collapsed)\b/.test(ownerMessage)) {
    return "missing symptom synonym / owner-language mapping";
  }
  if (/\b(blue|pale|collapse|collapsed|paraly[sz]ed|face swelled|swollen belly|tight belly|breathing hard)\b/.test(ownerMessage)) {
    return "missing red flag linkage";
  }
  if (failure.actual === "question" && failure.expected === "emergency") return "question orchestration overriding emergency";
  return "deterministic emergency composite not triggered";
}

function nextTicketForBucket(bucket: Wave3RootCauseBucket): string {
  switch (bucket) {
    case "harness expectation / route contract mismatch": return "Wave 3 canonical contract follow-up";
    case "report readiness contract mismatch": return "Wave 3 report readiness contract follow-up";
    case "missing symptom synonym / owner-language mapping": return "Wave 3 owner-language emergency mapping follow-up";
    case "missing red flag linkage": return "Wave 3 red-flag linkage follow-up";
    case "question orchestration overriding emergency": return "Wave 3 emergency orchestration follow-up";
    case "complaint normalization miss": return "Wave 3 complaint-normalization follow-up";
    default: return "Wave 3 emergency composite follow-up";
  }
}

function compareLedgerEntries(left: Wave3FailureLedgerEntry, right: Wave3FailureLedgerEntry): number {
  const severityDelta = severitySortKey(left.severity) - severitySortKey(right.severity);
  if (severityDelta !== 0) return severityDelta;
  const caseDelta = left.caseId.localeCompare(right.caseId);
  if (caseDelta !== 0) return caseDelta;
  return left.description.localeCompare(right.description);
}

function emptyRootCauseSummaryRow(bucket: Wave3RootCauseBucket): Wave3RootCauseSummaryRow {
  return { rootCauseBucket: bucket, totalFailures: 0, severityCounts: createSeverityCounts(), caseIds: [] };
}

function buildRootCauseSummary(entries: Wave3FailureLedgerEntry[]): Wave3RootCauseSummaryRow[] {
  const grouped = new Map<Wave3RootCauseBucket, { totalFailures: number; severityCounts: Wave3SeverityCounts; caseIds: string[] }>();
  for (const entry of entries) {
    if (!grouped.has(entry.rootCauseBucket)) {
      grouped.set(entry.rootCauseBucket, { totalFailures: 0, severityCounts: createSeverityCounts(), caseIds: [] });
    }
    const bucket = grouped.get(entry.rootCauseBucket);
    if (!bucket) continue;
    bucket.totalFailures += 1;
    incrementSeverityCount(bucket.severityCounts, entry.severity);
    bucket.caseIds.push(entry.caseId);
  }
  return [...grouped.entries()]
    .map(([rootCauseBucket, value]) => ({
      rootCauseBucket,
      totalFailures: value.totalFailures,
      severityCounts: value.severityCounts,
      caseIds: uniqueSorted(value.caseIds),
    }))
    .sort((left, right) => {
      const severityDelta = compareSeverityCounts(left.severityCounts, right.severityCounts);
      if (severityDelta !== 0) return severityDelta;
      if (left.totalFailures !== right.totalFailures) return right.totalFailures - left.totalFailures;
      return left.rootCauseBucket.localeCompare(right.rootCauseBucket);
    });
}

function toRootCauseSummaryMap(summary: Wave3RootCauseSummaryRow[]): Map<Wave3RootCauseBucket, Wave3RootCauseSummaryRow> {
  return new Map(summary.map((row) => [row.rootCauseBucket, row]));
}

function normalizeComparableLedger(
  suiteId: string,
  manifestHash: string,
  previousLedger: Wave3FailureLedger | null
): Wave3FailureLedger | null {
  if (!previousLedger || previousLedger.suiteId !== suiteId || previousLedger.manifestHash !== manifestHash) return null;
  if (!Array.isArray(previousLedger.entries)) return null;
  return previousLedger;
}

function loadPreviousWave3FailureLedger(
  suiteId: string,
  manifestHash: string,
  previousLedgerPath?: string | null
): Wave3FailureLedger | null {
  const baselinePath = resolveBaselineArtifactPath(
    previousLedgerPath,
    "wave3-emergency-root-cause-ledger.json"
  );
  if (!baselinePath) return null;
  return normalizeComparableLedger(
    suiteId,
    manifestHash,
    safeReadJson<Wave3FailureLedger>(baselinePath)
  );
}

function classifyRootCauseDeltaStatus(
  previousCounts: Wave3SeverityCounts,
  currentCounts: Wave3SeverityCounts
): Wave3RootCauseDeltaRow["status"] {
  const severityDelta = compareSeverityDeltas(previousCounts, currentCounts);
  if (severityDelta < 0) return "improved";
  if (severityDelta > 0) return "regressed";
  return "unchanged";
}

function effectiveRootCauseSeverity(change: Wave3RootCauseDeltaRow): Wave3SeverityCounts {
  return change.currentTotalFailures > 0 ? change.currentSeverityCounts : change.previousSeverityCounts;
}

function compareRootCauseDeltaRows(left: Wave3RootCauseDeltaRow, right: Wave3RootCauseDeltaRow): number {
  const severityDelta = compareSeverityCounts(effectiveRootCauseSeverity(left), effectiveRootCauseSeverity(right));
  if (severityDelta !== 0) return severityDelta;
  if (left.currentTotalFailures !== right.currentTotalFailures) return right.currentTotalFailures - left.currentTotalFailures;
  if (left.previousTotalFailures !== right.previousTotalFailures) return right.previousTotalFailures - left.previousTotalFailures;
  return left.rootCauseBucket.localeCompare(right.rootCauseBucket);
}

function buildFailureLedgerDelta(input: {
  totalFailures: number; rootCauseSummary: Wave3RootCauseSummaryRow[]; previousLedger: Wave3FailureLedger | null;
}): Wave3FailureLedgerDelta {
  const countsByStatus = createRootCauseDeltaCounts();
  if (!input.previousLedger) {
    return { comparedToGeneratedAt: null, previousTotalFailures: null, totalFailureDelta: null, countsByStatus, rootCauseChanges: [] };
  }
  const previousSummary = buildRootCauseSummary(input.previousLedger.entries);
  const previousMap = toRootCauseSummaryMap(previousSummary);
  const currentMap = toRootCauseSummaryMap(input.rootCauseSummary);
  const buckets = uniqueSorted([
    ...previousSummary.map((row) => row.rootCauseBucket),
    ...input.rootCauseSummary.map((row) => row.rootCauseBucket),
  ]) as Wave3RootCauseBucket[];
  const rootCauseChanges = buckets.map((bucket) => {
    const previousRow = previousMap.get(bucket) ?? emptyRootCauseSummaryRow(bucket);
    const currentRow = currentMap.get(bucket) ?? emptyRootCauseSummaryRow(bucket);
    const previousCaseIds = previousRow.caseIds;
    const currentCaseIds = currentRow.caseIds;
    const newCaseIds = currentCaseIds.filter((caseId) => !previousCaseIds.includes(caseId));
    const resolvedCaseIds = previousCaseIds.filter((caseId) => !currentCaseIds.includes(caseId));
    const status = classifyRootCauseDeltaStatus(previousRow.severityCounts, currentRow.severityCounts);
    countsByStatus[status] += 1;
    return {
      rootCauseBucket: bucket,
      status,
      previousTotalFailures: previousRow.totalFailures,
      currentTotalFailures: currentRow.totalFailures,
      deltaFailures: currentRow.totalFailures - previousRow.totalFailures,
      previousSeverityCounts: previousRow.severityCounts,
      currentSeverityCounts: currentRow.severityCounts,
      severityDelta: diffSeverityCounts(currentRow.severityCounts, previousRow.severityCounts),
      newCaseIds,
      resolvedCaseIds,
      compositionChanged: newCaseIds.length > 0 || resolvedCaseIds.length > 0,
    } satisfies Wave3RootCauseDeltaRow;
  }).sort(compareRootCauseDeltaRows);
  return {
    comparedToGeneratedAt: input.previousLedger.generatedAt,
    previousTotalFailures: input.previousLedger.totalFailures,
    totalFailureDelta: input.totalFailures - input.previousLedger.totalFailures,
    countsByStatus,
    rootCauseChanges,
  };
}

function compareResidualBlockers(left: Wave3ResidualBlocker, right: Wave3ResidualBlocker): number {
  const severityDelta = severitySortKey(left.severity) - severitySortKey(right.severity);
  if (severityDelta !== 0) return severityDelta;
  if (left.frequency !== right.frequency) return right.frequency - left.frequency;
  return left.caseId.localeCompare(right.caseId);
}

function buildCurrentResidualBlockers(entries: Wave3FailureLedgerEntry[]): Wave3ResidualBlocker[] {
  const grouped = new Map<string, Wave3ResidualBlocker>();
  for (const entry of entries) {
    const existing = grouped.get(entry.caseId);
    if (existing) {
      existing.frequency += 1;
      continue;
    }
    grouped.set(entry.caseId, {
      caseId: entry.caseId,
      severity: entry.severity,
      frequency: 1,
      rootCauseBucket: entry.rootCauseBucket,
      summary: entry.description,
      recommendedNextTicket: nextTicketForBucket(entry.rootCauseBucket),
    });
  }
  return [...grouped.values()].sort(compareResidualBlockers);
}

function buildResidualBlockerSummary(blockers: Wave3ResidualBlocker[]): Wave3ResidualBlockerSummary {
  const bySeverity = createSeverityCounts();
  const byRootCauseBucket: Record<string, number> = {};
  for (const blocker of blockers) {
    incrementSeverityCount(bySeverity, blocker.severity);
    incrementCount(byRootCauseBucket, blocker.rootCauseBucket);
  }
  return {
    totalBlockers: blockers.length,
    bySeverity,
    byRootCauseBucket: sortCountRecord(byRootCauseBucket),
    severityBands: buildResidualSeverityBands(blockers),
  };
}

function normalizeComparableResidualBlockers(
  suiteId: string,
  manifestHash: string,
  previousBlockers: Wave3ResidualBlockerList | null
): Wave3ResidualBlockerList | null {
  if (!previousBlockers || previousBlockers.suiteId !== suiteId || previousBlockers.manifestHash !== manifestHash) return null;
  if (!Array.isArray(previousBlockers.blockers)) return null;
  return previousBlockers;
}

function loadPreviousWave3ResidualBlockers(
  suiteId: string,
  manifestHash: string,
  previousBlockersPath?: string | null
): Wave3ResidualBlockerList | null {
  const baselinePath = resolveBaselineArtifactPath(
    previousBlockersPath,
    "wave3-residual-blockers.json"
  );
  if (!baselinePath) return null;
  return normalizeComparableResidualBlockers(
    suiteId,
    manifestHash,
    safeReadJson<Wave3ResidualBlockerList>(baselinePath)
  );
}

function classifyResidualBlockerDeltaStatus(input: {
  previous: Wave3ResidualBlocker | null; current: Wave3ResidualBlocker | null;
}): Wave3ResidualBlockerDeltaStatus {
  if (!input.previous && input.current) return "new";
  if (input.previous && !input.current) return "resolved";
  if (!input.previous || !input.current) return "unchanged";
  const severityDelta = severitySortKey(input.current.severity) - severitySortKey(input.previous.severity);
  if (severityDelta < 0) return "regressed";
  if (severityDelta > 0) return "improved";
  if (input.current.frequency > input.previous.frequency) return "regressed";
  if (input.current.frequency < input.previous.frequency) return "improved";
  return "unchanged";
}

function effectiveResidualSeverity(change: Wave3ResidualBlockerChange): LiveEvalFailure["severity"] {
  return change.currentSeverity ?? change.previousSeverity ?? "MEDIUM";
}

function compareResidualBlockerChanges(left: Wave3ResidualBlockerChange, right: Wave3ResidualBlockerChange): number {
  const severityDelta = severitySortKey(effectiveResidualSeverity(left)) - severitySortKey(effectiveResidualSeverity(right));
  if (severityDelta !== 0) return severityDelta;
  const statusOrder: Record<Wave3ResidualBlockerDeltaStatus, number> = {
    regressed: 0, new: 1, unchanged: 2, improved: 3, resolved: 4,
  };
  const statusDelta = statusOrder[left.status] - statusOrder[right.status];
  if (statusDelta !== 0) return statusDelta;
  return left.caseId.localeCompare(right.caseId);
}

function buildResidualBlockerDelta(input: {
  blockers: Wave3ResidualBlocker[]; previousBlockers: Wave3ResidualBlockerList | null;
}): Wave3ResidualBlockerDelta {
  const countsByStatus = createResidualDeltaCounts();
  const currentBands = buildResidualSeverityBands(input.blockers);
  if (!input.previousBlockers) {
    return {
      comparedToGeneratedAt: null,
      previousTotalBlockers: null,
      blockerDelta: null,
      countsByStatus,
      bandDeltas: {
        criticalReleaseBlockers: buildResidualBandDelta(
          currentBands.criticalReleaseBlockers.total,
          null
        ),
        highNonBlockingFailures: buildResidualBandDelta(
          currentBands.highNonBlockingFailures.total,
          null
        ),
        mediumFollowupReadinessFailures: buildResidualBandDelta(
          currentBands.mediumFollowupReadinessFailures.total,
          null
        ),
      },
      changes: [],
    };
  }
  const previousBands = buildResidualSeverityBands(input.previousBlockers.blockers);
  const previousMap = new Map(input.previousBlockers.blockers.map((blocker) => [blocker.caseId, blocker]));
  const currentMap = new Map(input.blockers.map((blocker) => [blocker.caseId, blocker]));
  const caseIds = uniqueSorted([
    ...input.previousBlockers.blockers.map((blocker) => blocker.caseId),
    ...input.blockers.map((blocker) => blocker.caseId),
  ]);
  const changes = caseIds.map((caseId) => {
    const previous = previousMap.get(caseId) ?? null;
    const current = currentMap.get(caseId) ?? null;
    const status = classifyResidualBlockerDeltaStatus({ previous, current });
    countsByStatus[status] += 1;
    return {
      caseId,
      severity: current?.severity ?? previous?.severity ?? "MEDIUM",
      status,
      frequencyDelta: (current?.frequency ?? 0) - (previous?.frequency ?? 0),
      rootCauseChanged:
        previous !== null &&
        current !== null &&
        previous.rootCauseBucket !== current.rootCauseBucket,
      summaryChanged:
        previous !== null &&
        current !== null &&
        previous.summary !== current.summary,
      previousSeverity: previous?.severity ?? null,
      currentSeverity: current?.severity ?? null,
      previousFrequency: previous?.frequency ?? null,
      currentFrequency: current?.frequency ?? null,
      previousRootCauseBucket: previous?.rootCauseBucket ?? null,
      currentRootCauseBucket: current?.rootCauseBucket ?? null,
      previousSummary: previous?.summary ?? null,
      currentSummary: current?.summary ?? null,
    } satisfies Wave3ResidualBlockerChange;
  }).sort(compareResidualBlockerChanges);
  return {
    comparedToGeneratedAt: input.previousBlockers.generatedAt,
    previousTotalBlockers: input.previousBlockers.blockers.length,
    blockerDelta: input.blockers.length - input.previousBlockers.blockers.length,
    countsByStatus,
    bandDeltas: {
      criticalReleaseBlockers: buildResidualBandDelta(
        currentBands.criticalReleaseBlockers.total,
        previousBands.criticalReleaseBlockers.total
      ),
      highNonBlockingFailures: buildResidualBandDelta(
        currentBands.highNonBlockingFailures.total,
        previousBands.highNonBlockingFailures.total
      ),
      mediumFollowupReadinessFailures: buildResidualBandDelta(
        currentBands.mediumFollowupReadinessFailures.total,
        previousBands.mediumFollowupReadinessFailures.total
      ),
    },
    changes,
  };
}

export function buildWave3FailureLedger(input: {
  manifest: Wave3CanonicalManifest; cases: Wave3CanonicalCase[]; scorecard: LiveEvalScorecard | null;
  previousLedger?: Wave3FailureLedger | null;
  previousLedgerPath?: string | null;
}): Wave3FailureLedger {
  const caseMap = new Map(input.cases.map((caseRecord) => [caseRecord.id, caseRecord]));
  const failures = input.scorecard?.failures ?? [];
  const entries = failures.map((failure) => {
    const caseRecord = caseMap.get(failure.caseId);
    return {
      caseId: failure.caseId,
      severity: failure.severity,
      expected: failure.expected,
      actual: failure.actual,
      complaintFamilies: caseRecord?.complaint_family_tags ?? [],
      riskTier: caseRecord?.risk_tier ?? null,
      actualResponseType: failure.actual,
      rootCauseBucket: classifyRootCauseBucket(failure, caseRecord),
      ownerMessage: getOwnerMessage(caseRecord),
      description: failure.description,
    } satisfies Wave3FailureLedgerEntry;
  }).sort(compareLedgerEntries);
  const byComplaintFamily: Record<string, number> = {};
  const byRiskTier: Record<string, number> = {};
  const byActualResponseType: Record<string, number> = {};
  const byRootCauseBucket: Record<string, number> = {};
  for (const entry of entries) {
    incrementCount(byRiskTier, entry.riskTier);
    incrementCount(byActualResponseType, entry.actualResponseType);
    incrementCount(byRootCauseBucket, entry.rootCauseBucket);
    for (const family of entry.complaintFamilies) incrementCount(byComplaintFamily, family);
  }
  const rootCauseSummary = buildRootCauseSummary(entries);
  const generatedAt = new Date().toISOString();
  const previousLedger = input.scorecard === null
    ? null
    : input.previousLedger === undefined
      ? loadPreviousWave3FailureLedger(
          input.manifest.suiteId,
          input.manifest.manifestHash,
          input.previousLedgerPath
        )
      : normalizeComparableLedger(input.manifest.suiteId, input.manifest.manifestHash, input.previousLedger);
  return {
    generatedAt,
    suiteId: input.manifest.suiteId,
    manifestHash: input.manifest.manifestHash,
    totalFailures: entries.length,
    hasScorecard: input.scorecard !== null,
    entries,
    byComplaintFamily: sortCountRecord(byComplaintFamily),
    byRiskTier: sortCountRecord(byRiskTier),
    byActualResponseType: sortCountRecord(byActualResponseType),
    byRootCauseBucket: sortCountRecord(byRootCauseBucket),
    rootCauseSummary,
    delta: buildFailureLedgerDelta({ totalFailures: entries.length, rootCauseSummary, previousLedger }),
  };
}

export function buildWave3ResidualBlockers(
  ledger: Wave3FailureLedger,
  previousBlockers?: Wave3ResidualBlockerList | null,
  options?: { previousBlockersPath?: string | null }
): Wave3ResidualBlockerList {
  const blockers = buildCurrentResidualBlockers(ledger.entries);
  const comparablePrevious = !ledger.hasScorecard
    ? null
    : previousBlockers === undefined
      ? loadPreviousWave3ResidualBlockers(
          ledger.suiteId,
          ledger.manifestHash,
          options?.previousBlockersPath
        )
      : normalizeComparableResidualBlockers(ledger.suiteId, ledger.manifestHash, previousBlockers);
  return {
    generatedAt: ledger.generatedAt,
    suiteId: ledger.suiteId,
    manifestHash: ledger.manifestHash,
    summary: buildResidualBlockerSummary(blockers),
    delta: buildResidualBlockerDelta({ blockers, previousBlockers: comparablePrevious }),
    blockers,
  };
}

function renderCountTable(heading: string, counts: Record<string, number>): string {
  const rows = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `| ${key} | ${count} |`);
  if (rows.length === 0) return `## ${heading}\n\n_None_\n`;
  return [`## ${heading}`, "", "| Bucket | Failures |", "| --- | ---: |", ...rows, ""].join("\n");
}

function renderRootCauseSummaryTable(summary: Wave3RootCauseSummaryRow[]): string {
  if (summary.length === 0) return "## Current Root Cause Summary\n\n_None_\n";
  const rows = summary.map(
    (row) => `| ${escapeTableCell(row.rootCauseBucket)} | ${row.totalFailures} | ${row.severityCounts.CRITICAL} | ${row.severityCounts.HIGH} | ${row.severityCounts.MEDIUM} |`
  );
  return [
    "## Current Root Cause Summary",
    "",
    "| Root cause bucket | Total | Critical | High | Medium |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}

function renderRootCauseDeltaTable(delta: Wave3FailureLedgerDelta): string {
  if (delta.rootCauseChanges.length === 0) return "## Root Cause Delta\n\n_No prior comparable ledger artifact was available._\n";
  const rows = delta.rootCauseChanges.map(
    (change) => `| ${escapeTableCell(change.rootCauseBucket)} | ${change.status} | ${change.previousTotalFailures} | ${change.currentTotalFailures} | ${formatSignedDelta(change.deltaFailures)} | ${formatSignedDelta(change.severityDelta.CRITICAL)} | ${formatSignedDelta(change.severityDelta.HIGH)} | ${formatSignedDelta(change.severityDelta.MEDIUM)} | ${change.newCaseIds.join(", ") || "none"} | ${change.resolvedCaseIds.join(", ") || "none"} |`
  );
  return [
    "## Root Cause Delta",
    "",
    "| Root cause bucket | Status | Prev | Curr | Delta | Critical | High | Medium | New cases | Resolved cases |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderResidualDeltaTable(delta: Wave3ResidualBlockerDelta): string {
  if (delta.changes.length === 0) return "## Residual Blocker Delta\n\n_No prior comparable blocker artifact was available._\n";
  const rows = delta.changes.map((change) => {
    const previousBucket = change.previousRootCauseBucket ?? "none";
    const currentBucket = change.currentRootCauseBucket ?? "resolved";
    const notes = [change.rootCauseChanged ? "rebucketed" : null, change.summaryChanged ? "summary changed" : null]
      .filter(Boolean)
      .join(", ");
    return `| ${change.caseId} | ${change.status} | ${change.severity} | ${formatSignedDelta(change.frequencyDelta)} | ${escapeTableCell(previousBucket)} | ${escapeTableCell(currentBucket)} | ${notes || "none"} |`;
  });
  return [
    "## Residual Blocker Delta",
    "",
    "| Case ID | Status | Severity | Freq delta | Previous bucket | Current bucket | Notes |",
    "| --- | --- | --- | ---: | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderResidualBandTable(
  heading: string,
  blockers: Wave3ResidualBlocker[],
  bandDelta: Wave3ResidualBlockerBandDelta
): string {
  const countLine = `- Count: ${blockers.length} (${formatSignedDelta(bandDelta.delta)})`;
  const baselineLine = `- Previous baseline: ${bandDelta.previousTotal ?? "n/a"}`;
  if (blockers.length === 0) {
    return [`## ${heading}`, "", countLine, baselineLine, "", "_None_", ""].join("\n");
  }
  const rows = blockers.map(
    (blocker) => `| ${blocker.caseId} | ${blocker.severity} | ${escapeTableCell(blocker.rootCauseBucket)} | ${escapeTableCell(blocker.summary)} |`
  );
  return [
    `## ${heading}`,
    "",
    countLine,
    baselineLine,
    "",
    "| Case ID | Severity | Root cause bucket | Summary |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderResidualSeverityBandSections(residualBlockers: Wave3ResidualBlockerList): string {
  const criticalReleaseBlockers = residualBlockers.blockers.filter(
    (blocker) => blocker.severity === "CRITICAL"
  );
  const highNonBlockingFailures = residualBlockers.blockers.filter(
    (blocker) => blocker.severity === "HIGH"
  );
  const mediumFollowupReadinessFailures = residualBlockers.blockers.filter(
    isMediumFollowupReadinessBlocker
  );
  return [
    renderResidualBandTable(
      "Critical Release Blockers",
      criticalReleaseBlockers,
      residualBlockers.delta.bandDeltas.criticalReleaseBlockers
    ),
    renderResidualBandTable(
      "High Non-Blocking Failures",
      highNonBlockingFailures,
      residualBlockers.delta.bandDeltas.highNonBlockingFailures
    ),
    renderResidualBandTable(
      "Medium Follow-Up and Readiness Failures",
      mediumFollowupReadinessFailures,
      residualBlockers.delta.bandDeltas.mediumFollowupReadinessFailures
    ),
  ].join("\n");
}

function renderBurnDownSnapshot(ledger: Wave3FailureLedger, residualBlockers: Wave3ResidualBlockerList): string {
  const comparedTo = residualBlockers.delta.comparedToGeneratedAt ?? ledger.delta.comparedToGeneratedAt ?? "no prior comparable run";
  return [
    "## Burn-Down Snapshot",
    "",
    `- Compared against: ${comparedTo}`,
    `- Total failures: ${ledger.totalFailures} (${formatSignedDelta(ledger.delta.totalFailureDelta)})`,
    `- Residual blockers: ${residualBlockers.summary.totalBlockers} (${formatSignedDelta(residualBlockers.delta.blockerDelta)})`,
    `- Critical release blockers: ${residualBlockers.summary.severityBands.criticalReleaseBlockers.total} (${formatSignedDelta(residualBlockers.delta.bandDeltas.criticalReleaseBlockers.delta)})`,
    `- High non-blocking failures: ${residualBlockers.summary.severityBands.highNonBlockingFailures.total} (${formatSignedDelta(residualBlockers.delta.bandDeltas.highNonBlockingFailures.delta)})`,
    `- Medium follow-up/readiness failures: ${residualBlockers.summary.severityBands.mediumFollowupReadinessFailures.total} (${formatSignedDelta(residualBlockers.delta.bandDeltas.mediumFollowupReadinessFailures.delta)})`,
    `- Residual blocker changes: new ${residualBlockers.delta.countsByStatus.new}, resolved ${residualBlockers.delta.countsByStatus.resolved}, regressed ${residualBlockers.delta.countsByStatus.regressed}, improved ${residualBlockers.delta.countsByStatus.improved}, unchanged ${residualBlockers.delta.countsByStatus.unchanged}`,
    `- Root-cause bucket changes: regressed ${ledger.delta.countsByStatus.regressed}, improved ${ledger.delta.countsByStatus.improved}, unchanged ${ledger.delta.countsByStatus.unchanged}`,
    "",
  ].join("\n");
}

export function renderWave3FailureLedgerMarkdown(
  ledger: Wave3FailureLedger,
  residualBlockers: Wave3ResidualBlockerList = buildWave3ResidualBlockers(ledger)
): string {
  const topEntries = ledger.entries.length > 0
    ? ledger.entries.slice().sort(compareLedgerEntries).slice(0, 20).map(
        (entry) => `- ${entry.caseId}: ${entry.severity} ${entry.actualResponseType} -> ${entry.rootCauseBucket} (${entry.description})`
      )
    : ["- none"];
  return [
    "# Wave 3 Emergency Baseline Debug",
    "",
    `- Generated at: ${ledger.generatedAt}`,
    `- Suite ID: ${ledger.suiteId}`,
    `- Manifest hash: ${ledger.manifestHash}`,
    `- Total failures: ${ledger.totalFailures}`,
    "",
    renderBurnDownSnapshot(ledger, residualBlockers),
    renderRootCauseDeltaTable(ledger.delta),
    renderResidualDeltaTable(residualBlockers.delta),
    renderResidualSeverityBandSections(residualBlockers),
    "## Top Failure Entries",
    "",
    ...topEntries,
    "",
    renderRootCauseSummaryTable(ledger.rootCauseSummary),
    renderCountTable("Root Cause Bucket Counts", ledger.byRootCauseBucket),
    renderCountTable("By Complaint Family", ledger.byComplaintFamily),
    renderCountTable("By Risk Tier", ledger.byRiskTier),
    renderCountTable("By Actual Response Type", ledger.byActualResponseType),
  ].join("\n");
}
