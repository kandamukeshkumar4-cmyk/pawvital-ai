import { NextResponse } from "next/server";
import { z } from "zod";
import { saveOutcomeFeedbackToDB } from "@/lib/report-storage";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

const OutcomeFeedbackRequestBodySchema = z.object({
  symptomCheckId: z.string().uuid(),
  matchedExpectation: z.enum(["yes", "partly", "no"]),
  confirmedDiagnosis: z.string().trim().max(2000).optional(),
  vetOutcome: z.string().trim().max(2000).optional(),
  ownerNotes: z.string().trim().max(4000).optional(),
});

type OutcomeFeedbackRequestBody = z.infer<
  typeof OutcomeFeedbackRequestBodySchema
>;

export async function POST(request: Request) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        {
          error: "Outcome feedback requires a configured account backend",
          code: "DEMO_MODE",
        },
        { status: 503 }
      );
    }

    console.error("[outcome-feedback] Failed to create Supabase client:", error);
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = OutcomeFeedbackRequestBodySchema.safeParse(requestBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const body: OutcomeFeedbackRequestBody = parsedBody.data;

  const saved = await saveOutcomeFeedbackToDB({
    symptomCheckId: body.symptomCheckId,
    matchedExpectation: body.matchedExpectation,
    confirmedDiagnosis: body.confirmedDiagnosis,
    requestingUserId: user.id,
    vetOutcome: body.vetOutcome,
    ownerNotes: body.ownerNotes,
  });

  const saveOk =
    typeof saved === "boolean" ? saved : saved.ok;

  if (!saveOk) {
    const status =
      typeof saved === "boolean"
        ? 503
        : saved.errorCode === "forbidden"
          ? 403
          : saved.errorCode === "not_found"
            ? 404
            : 503;
    return NextResponse.json(
      { ok: false, error: "Unable to save outcome feedback" },
      { status }
    );
  }

  if (typeof saved === "boolean") {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({
    ok: true,
    proposalCreated: saved.proposalCreated,
    structuredStored: saved.structuredStored,
    warnings: saved.warnings,
  });
}
