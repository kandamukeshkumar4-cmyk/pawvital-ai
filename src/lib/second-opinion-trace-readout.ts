import type {
  ShadowComparisonRecord,
  SidecarObservation,
} from "./clinical-evidence";

export interface SecondOpinionTraceReadoutAggregate {
  total: number;
  eligibilityReasonCounts: Record<string, number>;
  requestOutcomeCounts: Record<string, number>;
  acceptanceOutcomeCounts: Record<string, number>;
  comparisonAppendOutcomeCounts: Record<string, number>;
  comparisonWriteOutcomeCounts: Record<string, number>;
  extractorReasonCounts: Record<string, number>;
  readoutCountedCount: number;
}

const SECOND_OPINION_TRACE_NOTE_MARKERS = [
  "eligibility_reason",
  "request_outcome",
  "acceptance_outcome",
  "comparison_append_outcome",
  "comparison_write_outcome",
  "extractor_reason",
] as const;

export function createEmptySecondOpinionTraceReadoutAggregate(): SecondOpinionTraceReadoutAggregate {
  return {
    total: 0,
    eligibilityReasonCounts: {},
    requestOutcomeCounts: {},
    acceptanceOutcomeCounts: {},
    comparisonAppendOutcomeCounts: {},
    comparisonWriteOutcomeCounts: {},
    extractorReasonCounts: {},
    readoutCountedCount: 0,
  };
}

function incrementCount(
  counts: Record<string, number>,
  key: string | null
): Record<string, number> {
  if (!key) {
    return counts;
  }

  return {
    ...counts,
    [key]: (counts[key] || 0) + 1,
  };
}

function sanitizeTraceCode(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return /^[a-z0-9_]+$/.test(normalized) ? normalized : "invalid_code";
}

function readTraceNoteValue(
  note: string | undefined,
  key: (typeof SECOND_OPINION_TRACE_NOTE_MARKERS)[number]
): string | null {
  const noteText = typeof note === "string" ? note : "";
  const marker = `${key}=`;
  const part = noteText
    .split(" | ")
    .find((entry) => entry.startsWith(marker));

  return part ? part.slice(marker.length) : null;
}

function hasSecondOpinionTraceNote(observation: SidecarObservation): boolean {
  if (observation.stage === "second_opinion") {
    return true;
  }

  const note = typeof observation.note === "string" ? observation.note : "";
  return SECOND_OPINION_TRACE_NOTE_MARKERS.some((marker) =>
    note.includes(`${marker}=`)
  );
}

export function mergeSecondOpinionTraceReadoutAggregates(
  left: SecondOpinionTraceReadoutAggregate,
  right: SecondOpinionTraceReadoutAggregate
): SecondOpinionTraceReadoutAggregate {
  const mergeCounts = (
    leftCounts: Record<string, number>,
    rightCounts: Record<string, number>
  ) => {
    const merged = { ...leftCounts };
    for (const [key, value] of Object.entries(rightCounts)) {
      merged[key] = (merged[key] || 0) + value;
    }
    return merged;
  };

  return {
    total: left.total + right.total,
    eligibilityReasonCounts: mergeCounts(
      left.eligibilityReasonCounts,
      right.eligibilityReasonCounts
    ),
    requestOutcomeCounts: mergeCounts(
      left.requestOutcomeCounts,
      right.requestOutcomeCounts
    ),
    acceptanceOutcomeCounts: mergeCounts(
      left.acceptanceOutcomeCounts,
      right.acceptanceOutcomeCounts
    ),
    comparisonAppendOutcomeCounts: mergeCounts(
      left.comparisonAppendOutcomeCounts,
      right.comparisonAppendOutcomeCounts
    ),
    comparisonWriteOutcomeCounts: mergeCounts(
      left.comparisonWriteOutcomeCounts,
      right.comparisonWriteOutcomeCounts
    ),
    extractorReasonCounts: mergeCounts(
      left.extractorReasonCounts,
      right.extractorReasonCounts
    ),
    readoutCountedCount:
      left.readoutCountedCount + right.readoutCountedCount,
  };
}

export function buildSecondOpinionTraceReadoutAggregate(
  observations: SidecarObservation[],
  comparisons: ShadowComparisonRecord[] = []
): SecondOpinionTraceReadoutAggregate {
  const aggregate = createEmptySecondOpinionTraceReadoutAggregate();

  for (const observation of observations) {
    if (!hasSecondOpinionTraceNote(observation)) {
      continue;
    }

    aggregate.total += 1;
    aggregate.eligibilityReasonCounts = incrementCount(
      aggregate.eligibilityReasonCounts,
      sanitizeTraceCode(
        readTraceNoteValue(observation.note, "eligibility_reason")
      )
    );
    aggregate.requestOutcomeCounts = incrementCount(
      aggregate.requestOutcomeCounts,
      sanitizeTraceCode(readTraceNoteValue(observation.note, "request_outcome"))
    );
    aggregate.acceptanceOutcomeCounts = incrementCount(
      aggregate.acceptanceOutcomeCounts,
      sanitizeTraceCode(
        readTraceNoteValue(observation.note, "acceptance_outcome")
      )
    );
    aggregate.comparisonAppendOutcomeCounts = incrementCount(
      aggregate.comparisonAppendOutcomeCounts,
      sanitizeTraceCode(
        readTraceNoteValue(observation.note, "comparison_append_outcome")
      )
    );
    aggregate.comparisonWriteOutcomeCounts = incrementCount(
      aggregate.comparisonWriteOutcomeCounts,
      sanitizeTraceCode(
        readTraceNoteValue(observation.note, "comparison_write_outcome")
      )
    );
    aggregate.extractorReasonCounts = incrementCount(
      aggregate.extractorReasonCounts,
      sanitizeTraceCode(readTraceNoteValue(observation.note, "extractor_reason"))
    );
  }

  aggregate.readoutCountedCount = comparisons.filter(
    (comparison) => comparison.shadowStrategy === "second_opinion_extractor"
  ).length;

  return aggregate;
}
