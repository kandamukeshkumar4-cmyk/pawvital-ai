import { NextResponse } from "next/server";
import { saveOutcomeFeedbackToDB } from "@/lib/report-storage";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

interface OutcomeFeedbackRequestBody {
  symptomCheckId?: string;
  matchedExpectation?: "yes" | "partly" | "no";
  confirmedDiagnosis?: string;
  vetOutcome?: string;
  ownerNotes?: string;
}

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

  let body: OutcomeFeedbackRequestBody;
  try {
    body = (await request.json()) as OutcomeFeedbackRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.symptomCheckId || !body.matchedExpectation) {
    return NextResponse.json(
      { error: "symptomCheckId and matchedExpectation are required" },
      { status: 400 }
    );
  }

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
