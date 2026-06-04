import type { SymptomCheckEntry } from "@/components/timeline/types";
import {
  buildProductIntelligenceSnapshot,
  type ProductIntelligenceSnapshot,
} from "@/lib/product-intelligence";

export interface DailyReadinessSnapshot {
  petId: string;
  snapshotDate: string;
  generatedAt: string;
  sourceCheckIds: string[];
  product: ProductIntelligenceSnapshot;
  ownerSummary: string;
  claimGuard: string;
  deterministicOverride: string | null;
  nextEvidencePrompt: string | null;
  persistenceAllowed: boolean;
  persistenceBlockedReasons: string[];
}

export interface DailyReadinessSnapshotInput {
  petId: string;
  entries: SymptomCheckEntry[];
  generatedAt: string;
  healthScore?: number | null;
}

function dateOnly(value: string): string {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function newestCheckIds(entries: SymptomCheckEntry[]): string[] {
  return [...entries]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((entry) => entry.id);
}

export function buildDailyReadinessSnapshot(
  input: DailyReadinessSnapshotInput
): DailyReadinessSnapshot {
  const product = buildProductIntelligenceSnapshot({
    entries: input.entries,
    healthScore: input.healthScore,
  });

  return {
    petId: input.petId,
    snapshotDate: dateOnly(input.generatedAt),
    generatedAt: input.generatedAt,
    sourceCheckIds: newestCheckIds(input.entries),
    product,
    ownerSummary: product.ownerSummary,
    claimGuard: product.claimGuard,
    deterministicOverride: product.deterministicOverride,
    nextEvidencePrompt: product.nextEvidencePrompt,
    persistenceAllowed: product.persistenceAllowed,
    persistenceBlockedReasons: product.persistenceBlockedReasons,
  };
}
