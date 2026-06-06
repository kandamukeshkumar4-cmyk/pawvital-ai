import type { SymptomCheckEntry } from "@/components/timeline/types";
import {
  buildRecoveryCheckpoint,
  type RecoveryCheckpoint,
} from "@/lib/recovery-checkpoint";

export interface ProductIntelligenceHistory {
  readiness: unknown[];
  recovery: unknown[];
}

export interface ReadinessSaveRequest {
  generatedAt?: string;
  healthScore?: number | null;
  sourceCheckIds?: string[];
}

export interface RecoverySaveRequest {
  reportSourceId: string;
  generatedAt?: string;
  sourceCheckIds?: string[];
}

export interface SaveProductIntelligenceSnapshotInput {
  petId: string;
  readiness?: ReadinessSaveRequest;
  recovery?: RecoverySaveRequest;
}

type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

function historyFromPayload(payload: unknown): ProductIntelligenceHistory {
  const data =
    typeof payload === "object" && payload !== null && "data" in payload
      ? (payload as { data?: unknown }).data
      : null;
  const record = typeof data === "object" && data !== null ? data : {};
  const readiness = "readiness" in record ? (record as { readiness?: unknown }).readiness : [];
  const recovery = "recovery" in record ? (record as { recovery?: unknown }).recovery : [];

  return {
    readiness: Array.isArray(readiness) ? readiness : [],
    recovery: Array.isArray(recovery) ? recovery : [],
  };
}

async function throwIfNotOk(response: { ok: boolean; json: () => Promise<unknown> }) {
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  const error =
    typeof payload === "object" && payload !== null && "error" in payload
      ? String((payload as { error?: unknown }).error)
      : "Product intelligence request failed";
  throw new Error(error);
}

export function formatSavedReadinessCount(count: number): string {
  return `${count} saved readiness record${count === 1 ? "" : "s"}`;
}

export function selectRecoveryReportSourceId(
  entries: SymptomCheckEntry[]
): string | null {
  const sorted = entries.toSorted(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    sorted.find((entry) => Boolean(entry.report_summary?.trim()))?.id ??
    sorted[0]?.id ??
    null
  );
}

export function buildOwnerRecoveryCheckpoint(input: {
  petId: string | null;
  entries: SymptomCheckEntry[];
  generatedAt: string;
}): RecoveryCheckpoint | null {
  if (!input.petId) return null;
  const reportSourceId = selectRecoveryReportSourceId(input.entries);
  if (!reportSourceId) return null;

  return buildRecoveryCheckpoint({
    petId: input.petId,
    reportSourceId,
    entries: input.entries,
    generatedAt: input.generatedAt,
  });
}

export async function loadProductIntelligenceHistory(
  petId: string,
  fetchImpl: FetchLike = fetch
): Promise<ProductIntelligenceHistory> {
  const response = await fetchImpl(
    `/api/product-intelligence/snapshots?pet_id=${encodeURIComponent(petId)}`,
    { credentials: "include" }
  );

  await throwIfNotOk(response);
  return historyFromPayload(await response.json());
}

export async function saveProductIntelligenceSnapshot(
  input: SaveProductIntelligenceSnapshotInput,
  fetchImpl: FetchLike = fetch
): Promise<unknown> {
  const response = await fetchImpl("/api/product-intelligence/snapshots", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pet_id: input.petId,
      readiness: input.readiness
        ? {
            generated_at: input.readiness.generatedAt,
            health_score: input.readiness.healthScore,
            source_check_ids: input.readiness.sourceCheckIds,
          }
        : undefined,
      recovery: input.recovery
        ? {
            report_source_id: input.recovery.reportSourceId,
            generated_at: input.recovery.generatedAt,
            source_check_ids: input.recovery.sourceCheckIds,
          }
        : undefined,
    }),
  });

  await throwIfNotOk(response);
  return response.json();
}
