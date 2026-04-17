import { NextResponse } from "next/server";
import {
  evaluateSymptomCheckUsageGate,
  getPlanFromSubscription,
  type SymptomCheckUsageGateResult,
} from "@/lib/subscription-state";
import { isProductionEnvironment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sanitizeSessionForClient } from "@/lib/symptom-chat/context-helpers";
import type { TriageSession } from "@/lib/triage-engine";
import type { SubscriptionRow } from "@/types";

export type SymptomChatAction = "chat" | "generate_report";

export interface SymptomChatMessage {
  role: "user" | "assistant";
  content: string;
}

const USAGE_LIMIT_BYPASS_PATTERNS = [
  /\b(can(?:not|'?t)\s+breathe|difficulty breathing|struggling to breathe|not breathing)\b/i,
  /\b(vomit(?:ing|ed)? blood|blood in vomit|coughing blood|bloody diarrhea)\b/i,
  /\b(seizure|collapsed?|collapse|unresponsive)\b/i,
  /\b(hit by a car|car accident|distended abdomen|bloated abdomen|bloat)\b/i,
];

export function hasConversationStarted(
  session: TriageSession | null | undefined
) {
  if (!session) {
    return false;
  }

  return (
    session.known_symptoms.length > 0 ||
    session.answered_questions.length > 0 ||
    Object.keys(session.extracted_answers ?? {}).length > 0 ||
    Boolean(session.last_question_asked) ||
    (session.case_memory?.turn_count ?? 0) > 0
  );
}

export function hasEmergencyUsageGateBypassSignal(
  session: TriageSession,
  messages: SymptomChatMessage[]
) {
  if ((session.red_flags_triggered?.length ?? 0) > 0) {
    return true;
  }

  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";

  return USAGE_LIMIT_BYPASS_PATTERNS.some((pattern) =>
    pattern.test(latestUserMessage)
  );
}

async function loadLatestSubscriptionForUser(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`SUBSCRIPTION_LOOKUP_FAILED:${error.message}`);
  }

  return (data ?? null) as SubscriptionRow | null;
}

async function countMonthlySymptomChecksForUser(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
) {
  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id")
    .eq("user_id", userId);

  if (petsError) {
    throw new Error(`PET_LOOKUP_FAILED:${petsError.message}`);
  }

  const petIds = (pets ?? [])
    .map((pet) => String((pet as { id?: string }).id ?? "").trim())
    .filter(Boolean);
  if (petIds.length === 0) {
    return 0;
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error: checksError } = await supabase
    .from("symptom_checks")
    .select("*", { count: "exact", head: true })
    .in("pet_id", petIds)
    .gte("created_at", monthStart.toISOString());

  if (checksError) {
    throw new Error(`USAGE_COUNT_FAILED:${checksError.message}`);
  }

  return count ?? 0;
}

function buildUsageLimitResponse(
  session: TriageSession,
  sessionHandle: string | null | undefined,
  usageGate: Pick<
    SymptomCheckUsageGateResult,
    "limit" | "reason" | "remaining" | "requiresUpgrade"
  >
) {
  return NextResponse.json(
    {
      type: "usage_limit",
      code: "FREE_TIER_LIMIT_REACHED",
      error: "Monthly free-tier limit reached",
      message: `You've reached the free limit of ${usageGate.limit} new symptom checks this month. Upgrade to keep starting new checks, or continue any symptom conversation already in progress.`,
      requires_upgrade: usageGate.requiresUpgrade,
      usage_gate: {
        limit: usageGate.limit,
        reason: usageGate.reason,
        remaining: usageGate.remaining,
      },
      ready_for_report: false,
      conversationState: "idle",
      session: sanitizeSessionForClient(session),
      ...(sessionHandle ? { sessionHandle } : {}),
    },
    { status: 402 }
  );
}

function buildBillingUnavailableResponse(
  session: TriageSession,
  sessionHandle: string | null | undefined
) {
  return NextResponse.json(
    {
      type: "billing_unavailable",
      code: "BILLING_UNAVAILABLE",
      error: "Billing checks are temporarily unavailable",
      message:
        "We couldn't verify plan limits right now. Please try again in a moment.",
      ready_for_report: false,
      conversationState: "idle",
      session: sanitizeSessionForClient(session),
      ...(sessionHandle ? { sessionHandle } : {}),
    },
    { status: 503 }
  );
}

export async function maybeBuildUsageLimitResponse(input: {
  action: SymptomChatAction;
  messages: SymptomChatMessage[];
  session: TriageSession;
  sessionHandle?: string | null;
}) {
  if (input.action !== "chat") {
    return null;
  }

  if (
    hasConversationStarted(input.session) ||
    hasEmergencyUsageGateBypassSignal(input.session, input.messages)
  ) {
    return null;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const [latestSubscription, completedChecksThisMonth] = await Promise.all([
      loadLatestSubscriptionForUser(supabase, user.id),
      countMonthlySymptomChecksForUser(supabase, user.id),
    ]);
    const usageGate = evaluateSymptomCheckUsageGate({
      completedChecksThisMonth,
      conversationStarted: false,
      isEmergency: false,
      plan: getPlanFromSubscription(latestSubscription),
    });

    return usageGate.allowed
      ? null
      : buildUsageLimitResponse(
          input.session,
          input.sessionHandle,
          usageGate
        );
  } catch (error) {
    console.error("[Billing] Usage gate failed open:", error);
    return isProductionEnvironment()
      ? buildBillingUnavailableResponse(input.session, input.sessionHandle)
      : null;
  }
}
