import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { HealthLog } from "@/lib/health-log/types";
import { detectDogBrainSignals } from "./signals";
import { planFollowupsForSignals, type FollowupPlan } from "./followup-planner";
import { isMissingTable } from "@/lib/api/table-missing";

export interface RunBrainLoopResult {
  state: string;
  signals: Array<{ signal_type: string; severity: string }>;
  createdFollowups: Array<{ id: string; signal_key: string }>;
  dedupedFollowups: Array<{ signal_key: string }>;
  errors: Array<{ message: string }>;
}

interface FollowupRow {
  id: string;
  signal_key: string;
  prompt: string;
  due_at: string | null;
  status: string;
}

const RECENT_LOG_LIMIT = 30;

/**
 * Load recent daily logs for signal detection (owner-scoped).
 */
async function loadRecentLogs(
  supabase: unknown,
  userId: string,
  petId: string,
): Promise<HealthLog[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from("daily_health_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("pet_id", petId)
    .order("log_date", { ascending: false })
    .limit(RECENT_LOG_LIMIT);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as HealthLog[];
}

/**
 * Idempotent persist of a follow-up plan. Returns {created, deduped}.
 * Treats pre-existing pending + Postgres 23505 as deduped.
 */
async function persistPlan(
  supabase: unknown,
  userId: string,
  petId: string,
  plan: FollowupPlan,
): Promise<{ created?: FollowupRow; deduped: boolean; error?: unknown }> {
  try {
    // Pre-check for existing pending (same as followups route)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb2 = supabase as any;
    const { data: existing, error: existErr } = await sb2
      .from("dog_brain_followups")
      .select("id, signal_key, prompt, due_at, status")
      .eq("user_id", userId)
      .eq("pet_id", petId)
      .eq("signal_key", plan.signal_key)
      .eq("status", "pending")
      .maybeSingle();

    if (existErr) {
      // PROOF #11: a missing table (or permission error) on the dedupe pre-check
      // is a persistence failure — report it honestly as an error, never as a
      // successful dedupe. The caller collects this as a nonfatal error.
      return { deduped: false, error: existErr };
    }
    if (existing) {
      return { deduped: true };
    }

    const { data, error } = await sb2
      .from("dog_brain_followups")
      .insert({
        user_id: userId,
        pet_id: petId,
        signal_key: plan.signal_key,
        prompt: plan.prompt,
        due_at: plan.due_at,
        status: "pending",
      })
      .select("id, signal_key, prompt, due_at, status")
      .maybeSingle();

    if (error) {
      // 23505 is the only true dedupe: a concurrent insert won the race after
      // our pre-check. Everything else (missing table, permission, schema) is
      // an honest persistence failure.
      if (error.code === "23505") {
        return { deduped: true };
      }
      return { deduped: false, error };
    }
    return { created: data as FollowupRow, deduped: false };
  } catch (e) {
    return { deduped: false, error: e };
  }
}

/**
 * Core loop: load recent logs, detect signals, plan follow-ups for watch/alert,
 * persist with dedupe (existing pending or 23505), return structured result.
 * Never throws to caller — errors collected.
 */
export async function runDogBrainLoopAfterHealthLog(
  userId: string,
  petId: string,
): Promise<RunBrainLoopResult> {
  const result: RunBrainLoopResult = {
    state: "stable",
    signals: [],
    createdFollowups: [],
    dedupedFollowups: [],
    errors: [],
  };

  try {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // Verify ownership lightly (RLS will protect, but early exit for bad ids)
    const { data: pet } = await sb
      .from("pets")
      .select("id")
      .eq("id", petId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!pet) {
      return result;
    }

    const logs = await loadRecentLogs(sb, userId, petId);
    const detection = detectDogBrainSignals(logs);
    result.state = detection.state;
    result.signals = detection.signals.map((s) => ({
      signal_type: s.signal_type,
      severity: s.severity,
    }));

    const plans = planFollowupsForSignals({
      userId,
      petId,
      signals: detection.signals,
      now: new Date(),
    });

    for (const plan of plans) {
      const p = await persistPlan(sb, userId, petId, plan);
      if (p.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = p.error as any;
        result.errors.push({ message: String(err?.message ?? p.error) });
      } else if (p.created) {
        result.createdFollowups.push({
          id: p.created.id,
          signal_key: p.created.signal_key,
        });
      } else if (p.deduped) {
        result.dedupedFollowups.push({ signal_key: plan.signal_key });
      }
    }
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    result.errors.push({ message: msg });
  }

  return result;
}
