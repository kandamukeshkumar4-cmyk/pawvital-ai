import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import { isMissingTable } from "@/lib/api/table-missing";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";
import {
  recordDogBrainEvent,
  dogBrainFollowupOutcomeRecordedEvent,
  toOutcomeBucket,
} from "@/lib/dog-brain/analytics";

const ParamsSchema = z.object({ id: z.string().uuid() });
const PatchSchema = z.object({
  status: z.enum(["better", "worse", "same", "dismissed"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsedParams = ParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid id", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid status", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Follow-ups require a configured account backend",
  });
  if ("response" in auth) return auth.response;

  try {
    // RLS already scopes to the owner; the user_id filter is defence in depth.
    const { data, error } = await auth.supabase
      .from("dog_brain_followups")
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq("id", parsedParams.data.id)
      .eq("user_id", auth.user.id)
      .select()
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ code: "TABLE_MISSING" }, { status: 503 });
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Privacy-safe outcome bucket only (better/same/worse/unknown) — no notes.
    void recordDogBrainEvent(
      dogBrainFollowupOutcomeRecordedEvent({
        outcome: toOutcomeBucket(parsed.data.status),
      }),
    );
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[DogBrainFollowups] PATCH failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
