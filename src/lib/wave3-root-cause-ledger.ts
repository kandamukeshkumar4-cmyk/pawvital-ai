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
  caseId: string;
  severity: LiveEvalFailure["severity"];
  expected: string;
  actual: string;
  complaintFamilies: string[];
  riskTier: string | null;
  actualResponseType: string;
  rootCauseBucket: Wave3RootCauseBucket;
  ownerMessage: string;
  description: string;
}

export interface Wave3FailureLedger {
  generatedAt: string;
  suiteId: string;
  manifestHash: string;
  totalFailures: number;
  entries: Wave3FailureLedgerEntry[];
  byComplaintFamily: Record<string, number>;
  byRiskTier: Record<string, number>;
  byActualResponseType: Record<string, number>;
  byRootCauseBucket: Record<string, number>;
}

export interface Wave3ResidualBlocker {
  caseId: string;
  severity: LiveEvalFailure["severity"];
  frequency: number;
  rootCauseBucket: Wave3RootCauseBucket;
  summary: string;
  recommendedNextTicket: string;
}

export interface Wave3ResidualBlockerList {
  generatedAt: string;
  suiteId: string;
  manifestHash: string;
  blockers: Wave3ResidualBlocker[];
}

function incrementCount(
  counts: Record<string, number>,
  key: string | undefined | null
): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function getOwnerMessage(caseRecord: Wave3CanonicalCase | undefined): string {
  const request =
    caseRecord?.request && typeof caseRecord.request === "object"
      ? (caseRecord.request as { messages?: unknown })
      : null;
  const messages = Array.isArray(request?.messages)
    ? (request.messages as Array<{ role?: string; content?: string }>)
    : [];
  const ownerMessage = messages.find(
    (message) =>
      message &&
      typeof message === "object" &&
      message.role === "user" &&
      typeof message.content === "string"
  );

  return typeof ownerMessage?.content === "string" ? ownerMessage.content : "";
}

function classifyRootCauseBucket(
  failure: LiveEvalFailure,
  caseRecord: Wave3CanonicalCase | undefined
): Wave3RootCauseBucket {
  const description = failure.description.toLowerCase();
  const ownerMessage = getOwnerMessage(caseRecord).toLowerCase();

  if (failure.category === "suite_alignment") {
    return "harness expectation / route contract mismatch";
  }

  if (
    description.includes("readyforreport") &&
    !description.includes("responsetype")
  ) {
    return "report readiness contract mismatch";
  }

  if (description.includes("knownsymptomsinclude")) {
    return "complaint normalization miss";
  }

  if (
    /\b(bee sting|bug bite|hives?|welts?|dragging|back legs|tight and swollen|while lying still|after a big meal|got excited, collapsed)\b/.test(
      ownerMessage
    )
  ) {
    return "missing symptom synonym / owner-language mapping";
  }

  if (
    /\b(blue|pale|collapse|collapsed|paraly[sz]ed|face swelled|swollen belly|tight belly|breathing hard)\b/.test(
      ownerMessage
    )
  ) {
    return "missing red flag linkage";
  }

  if (failure.actual === "question" && failure.expected === "emergency") {
    return "question orchestration overriding emergency";
  }

  return "deterministic emergency composite not triggered";
}

function nextTicketForBucket(bucket: Wave3RootCauseBucket): string {
  switch (bucket) {
    case "harness expectation / route contract mismatch":
      return "Wave 3 canonical contract follow-up";
    case "report readiness contract mismatch":
      return "Wave 3 report readiness contract follow-up";
    case "missing symptom synonym / owner-language mapping":
      return "Wave 3 owner-language emergency mapping follow-up";
    case "missing red flag linkage":
      return "Wave 3 red-flag linkage follow-up";
    case "question orchestration overriding emergency":
      return "Wave 3 emergency orchestration follow-up";
    case "complaint normalization miss":
      return "Wave 3 complaint-normalization follow-up";
    default:
      return "Wave 3 emergency composite follow-up";
  }
}

function severitySortKey(severity: LiveEvalFailure["severity"]): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2 }[severity];
}

export function buildWave3FailureLedger(input: {
  manifest: Wave3CanonicalManifest;
  cases: Wave3CanonicalCase[];
  scorecard: LiveEvalScorecard | null;
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
  });

  const byComplaintFamily: Record<string, number> = {};
  const byRiskTier: Record<string, number> = {};
  const byActualResponseType: Record<string, number> = {};
  const byRootCauseBucket: Record<string, number> = {};

  for (const entry of entries) {
    incrementCount(byRiskTier, entry.riskTier);
    incrementCount(byActualResponseType, entry.actualResponseType);
    incrementCount(byRootCauseBucket, entry.rootCauseBucket);
    for (const family of entry.complaintFamilies) {
      incrementCount(byComplaintFamily, family);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    suiteId: input.manifest.suiteId,
    manifestHash: input.manifest.manifestHash,
    totalFailures: entries.length,
    entries,
    byComplaintFamily,
    byRiskTier,
    byActualResponseType,
    byRootCauseBucket,
  };
}

export function buildWave3ResidualBlockers(
  ledger: Wave3FailureLedger
): Wave3ResidualBlockerList {
  const grouped = new Map<string, Wave3ResidualBlocker>();

  for (const entry of ledger.entries) {
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

  const blockers = [...grouped.values()].sort((left, right) => {
    const severityDelta =
      severitySortKey(left.severity) - severitySortKey(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    if (left.frequency !== right.frequency) {
      return right.frequency - left.frequency;
    }
    return left.caseId.localeCompare(right.caseId);
  });

  return {
    generatedAt: new Date().toISOString(),
    suiteId: ledger.suiteId,
    manifestHash: ledger.manifestHash,
    blockers,
  };
}

function renderCountTable(
  heading: string,
  counts: Record<string, number>
): string {
  const rows = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `| ${key} | ${count} |`);

  if (rows.length === 0) {
    return `## ${heading}\n\n_None_\n`;
  }

  return [
    `## ${heading}`,
    "",
    "| Bucket | Failures |",
    "| --- | ---: |",
    ...rows,
    "",
  ].join("\n");
}

export function renderWave3FailureLedgerMarkdown(
  ledger: Wave3FailureLedger
): string {
  const topEntries =
    ledger.entries.length > 0
      ? ledger.entries
          .slice()
          .sort((left, right) => {
            const severityDelta =
              severitySortKey(left.severity) - severitySortKey(right.severity);
            if (severityDelta !== 0) {
              return severityDelta;
            }
            return left.caseId.localeCompare(right.caseId);
          })
          .slice(0, 20)
          .map(
            (entry) =>
              `- ${entry.caseId}: ${entry.severity} ${entry.actualResponseType} -> ${entry.rootCauseBucket} (${entry.description})`
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
    "## Top Failure Entries",
    "",
    ...topEntries,
    "",
    renderCountTable("By Root Cause Bucket", ledger.byRootCauseBucket),
    renderCountTable("By Complaint Family", ledger.byComplaintFamily),
    renderCountTable("By Risk Tier", ledger.byRiskTier),
    renderCountTable("By Actual Response Type", ledger.byActualResponseType),
  ].join("\n");
}
