import type { ClinicalCaseState, RedFlagEntry } from "./case-state";
import { isEmergencyRedFlagId } from "./emergency-red-flags";

export function getRedFlagStatus(
  state: ClinicalCaseState,
  redFlagId: string
): RedFlagEntry | undefined {
  return state.redFlagStatus[redFlagId];
}

export function isRedFlagPositive(
  state: ClinicalCaseState,
  redFlagId: string
): boolean {
  return state.redFlagStatus[redFlagId]?.status === "positive";
}

export function isRedFlagNegative(
  state: ClinicalCaseState,
  redFlagId: string
): boolean {
  return state.redFlagStatus[redFlagId]?.status === "negative";
}

export function isRedFlagUnknown(
  state: ClinicalCaseState,
  redFlagId: string
): boolean {
  const entry = state.redFlagStatus[redFlagId];
  return !entry || entry.status === "unknown";
}

export function getPositiveRedFlags(state: ClinicalCaseState): string[] {
  return Object.entries(state.redFlagStatus)
    .filter(([, entry]) => entry.status === "positive")
    .map(([id]) => id);
}

export function getUnknownRedFlags(state: ClinicalCaseState): string[] {
  return Object.entries(state.redFlagStatus)
    .filter(([, entry]) => entry.status === "unknown")
    .map(([id]) => id);
}

export function hasAnyPositiveEmergencyRedFlags(
  state: ClinicalCaseState
): boolean {
  return getPositiveRedFlags(state).some((id) => isEmergencyRedFlagId(id));
}

export function resolveUnknownRedFlags(
  state: ClinicalCaseState,
  redFlagIds: string[],
  status: "negative" | "not_sure",
  turn: number
): ClinicalCaseState {
  const newState = { ...state, redFlagStatus: { ...state.redFlagStatus } };

  for (const id of redFlagIds) {
    const existing = newState.redFlagStatus[id];
    if (!existing || existing.status === "unknown") {
      newState.redFlagStatus[id] = {
        status,
        source: "explicit_answer",
        updatedAtTurn: turn,
        evidenceText: existing?.evidenceText,
      };
    }
  }

  return newState;
}

export function computeRedFlagSummary(
  state: ClinicalCaseState
): {
  total: number;
  positive: number;
  negative: number;
  unknown: number;
  notSure: number;
} {
  const counts = { total: 0, positive: 0, negative: 0, unknown: 0, notSure: 0 };

  for (const entry of Object.values(state.redFlagStatus)) {
    counts.total += 1;
    switch (entry.status) {
      case "positive":
        counts.positive += 1;
        break;
      case "negative":
        counts.negative += 1;
        break;
      case "unknown":
        counts.unknown += 1;
        break;
      case "not_sure":
        counts.notSure += 1;
        break;
    }
  }

  return counts;
}
