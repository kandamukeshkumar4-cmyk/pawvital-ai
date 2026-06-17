import type { SymptomCheckEntry } from "@/components/timeline/types";

export type RecoveryCheckpointStatus =
  | "ready"
  | "insufficient_evidence"
  | "urgent_override";

export interface RecoveryCheckpoint {
  petId: string;
  reportSourceId: string;
  checkpointDate: string;
  generatedAt: string;
  status: RecoveryCheckpointStatus;
  sourceCheckIds: string[];
  ownerSummary: string;
  claimGuard: string;
  deterministicOverride: string | null;
  nextEvidencePrompt: string | null;
  persistenceAllowed: boolean;
  persistenceBlockedReasons: string[];
}

export interface RecoveryCheckpointInput {
  petId: string;
  reportSourceId: string;
  entries: SymptomCheckEntry[];
  generatedAt: string;
}

const CLAIM_GUARD =
  "Evidence only - not a diagnosis, prognosis, treatment plan, or emergency clearance.";
const URGENT_OVERRIDE = "Emergency symptom check forces urgent state.";

function dateOnly(value: string): string {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function sortNewestFirst(entries: SymptomCheckEntry[]): SymptomCheckEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function hasUrgentOverride(entries: SymptomCheckEntry[]): boolean {
  return entries.some(
    (entry) => entry.urgency === "emergency" || entry.severity === "critical"
  );
}

function hasReportLinkedFollowUp(entries: SymptomCheckEntry[]): boolean {
  return entries.some((entry) => Boolean(entry.report_summary?.trim()));
}

export function buildRecoveryCheckpoint(
  input: RecoveryCheckpointInput
): RecoveryCheckpoint {
  const sortedEntries = sortNewestFirst(input.entries);
  const sourceCheckIds = sortedEntries.map((entry) => entry.id);
  const blockedReasons: string[] = [];
  let status: RecoveryCheckpointStatus = "ready";
  let deterministicOverride: string | null = null;
  let nextEvidencePrompt: string | null = null;

  if (hasUrgentOverride(sortedEntries)) {
    status = "urgent_override";
    deterministicOverride = URGENT_OVERRIDE;
    blockedReasons.push("urgent override active");
  } else if (!hasReportLinkedFollowUp(sortedEntries)) {
    status = "insufficient_evidence";
    nextEvidencePrompt = "Add a report-linked follow-up before saving recovery history.";
    blockedReasons.push("missing report-linked follow-up evidence");
  } else if (sortedEntries.length < 2) {
    status = "insufficient_evidence";
    nextEvidencePrompt = "Add another comparable check before saving recovery history.";
    blockedReasons.push("insufficient recovery comparison evidence");
  }

  return {
    petId: input.petId,
    reportSourceId: input.reportSourceId,
    checkpointDate: dateOnly(input.generatedAt),
    generatedAt: input.generatedAt,
    status,
    sourceCheckIds,
    ownerSummary:
      status === "ready"
        ? "Recovery checkpoint is based on report-linked follow-up evidence and comparable history."
        : "Recovery checkpoint needs more evidence before it can be saved.",
    claimGuard: CLAIM_GUARD,
    deterministicOverride,
    nextEvidencePrompt,
    persistenceAllowed: blockedReasons.length === 0,
    persistenceBlockedReasons: blockedReasons,
  };
}
