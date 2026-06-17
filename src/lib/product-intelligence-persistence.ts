import type { DailyReadinessSnapshot } from "@/lib/readiness-snapshot";
import type { RecoveryCheckpoint } from "@/lib/recovery-checkpoint";

export interface ReadinessSnapshotRow {
  user_id: string;
  pet_id: string;
  snapshot_date: string;
  readiness_state: DailyReadinessSnapshot["product"]["state"];
  confidence: DailyReadinessSnapshot["product"]["confidence"];
  display_score: number | null;
  evidence_coverage: number;
  source_check_ids: string[];
  generated_by: string;
  payload: DailyReadinessSnapshot;
}

export interface RecoveryCheckpointRow {
  user_id: string;
  pet_id: string;
  report_source_id: string;
  checkpoint_date: string;
  recovery_status: RecoveryCheckpoint["status"];
  source_check_ids: string[];
  generated_by: string;
  payload: RecoveryCheckpoint;
}

export interface MapReadinessSnapshotInput {
  userId: string;
  snapshot: DailyReadinessSnapshot;
  generatedBy: string;
}

export interface MapRecoveryCheckpointInput {
  userId: string;
  checkpoint: RecoveryCheckpoint;
  generatedBy: string;
}

export function mapReadinessSnapshotToRow({
  userId,
  snapshot,
  generatedBy,
}: MapReadinessSnapshotInput): ReadinessSnapshotRow {
  if (!snapshot.persistenceAllowed) {
    throw new Error("Daily readiness snapshot is not persistable");
  }

  return {
    user_id: userId,
    pet_id: snapshot.petId,
    snapshot_date: snapshot.snapshotDate,
    readiness_state: snapshot.product.state,
    confidence: snapshot.product.confidence,
    display_score: snapshot.product.displayScore,
    evidence_coverage: snapshot.product.evidenceCoverage,
    source_check_ids: snapshot.sourceCheckIds,
    generated_by: generatedBy,
    payload: snapshot,
  };
}

export function mapRecoveryCheckpointToRow({
  userId,
  checkpoint,
  generatedBy,
}: MapRecoveryCheckpointInput): RecoveryCheckpointRow {
  if (!checkpoint.persistenceAllowed) {
    throw new Error("Recovery checkpoint is not persistable");
  }

  return {
    user_id: userId,
    pet_id: checkpoint.petId,
    report_source_id: checkpoint.reportSourceId,
    checkpoint_date: checkpoint.checkpointDate,
    recovery_status: checkpoint.status,
    source_check_ids: checkpoint.sourceCheckIds,
    generated_by: generatedBy,
    payload: checkpoint,
  };
}
