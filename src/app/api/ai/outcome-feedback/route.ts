import { NextResponse } from "next/server";
import { z } from "zod";
import { saveOutcomeFeedbackToDB } from "@/lib/report-storage";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
  type RateLimitResult,
} from "@/lib/rate-limit";
import {
  listTesterFeedbackCases,
  saveTesterFeedbackToDB,
} from "@/lib/tester-feedback-storage";
import {
  TESTER_FEEDBACK_CONFUSING_AREA_VALUES,
  TESTER_FEEDBACK_HELPFULNESS_VALUES,
  TESTER_FEEDBACK_SURFACE_VALUES,
  TESTER_FEEDBACK_TRUST_VALUES,
} from "@/lib/tester-feedback";

const TesterFeedbackRequestBodySchema = z.object({
  symptomCheckId: z.string().uuid(),
  helpfulness: z.enum(TESTER_FEEDBACK_HELPFULNESS_VALUES),
  confusingAreas: z
    .array(z.enum(TESTER_FEEDBACK_CONFUSING_AREA_VALUES))
    .max(6)
    .default([]),
  trustLevel: z.enum(TESTER_FEEDBACK_TRUST_VALUES),
  notes: z.string().trim().max(1200).optional(),
  surface: z.enum(TESTER_FEEDBACK_SURFACE_VALUES).optional(),
});

const OutcomeFeedbackRequestBodySchema = z.object({
  symptomCheckId: z.string().uuid(),
  matchedExpectation: z.enum(["yes", "partly", "no"]),
  confirmedDiagnosis: z.string().trim().max(2000).optional(),
  vetOutcome: z.string().trim().max(2000).optional(),
  ownerNotes: z.string().trim().max(4000).optional(),
});

type TesterFeedbackRequestBody = z.infer<typeof TesterFeedbackRequestBodySchema>;
type OutcomeFeedbackRequestBody = z.infer<
  typeof OutcomeFeedbackRequestBodySchema
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOutcomeFeedbackPayload(
  value: unknown
): value is Record<string, unknown> {
  return isRecord(value) && "matchedExpectation" in value;
}

function buildRateLimitResponse(rateLimitResult: RateLimitResult) {
  if (rateLimitResult.success) {
    return null;
  }

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

async function requireUser() {
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

  return { supabase, user };
}

function saveOutcomeFeedback(
  body: OutcomeFeedbackRequestBody,
  userId: string
) {
  return saveOutcomeFeedbackToDB({
    symptomCheckId: body.symptomCheckId,
    matchedExpectation: body.matchedExpectation,
    confirmedDiagnosis: body.confirmedDiagnosis,
    requestingUserId: userId,
    vetOutcome: body.vetOutcome,
    ownerNotes: body.ownerNotes,
  });
}

function saveTesterFeedback(body: TesterFeedbackRequestBody, userId: string) {
  return saveTesterFeedbackToDB({
    userId,
    feedback: {
      symptomCheckId: body.symptomCheckId,
      helpfulness: body.helpfulness,
      confusingAreas: body.confusingAreas,
      trustLevel: body.trustLevel,
      notes: body.notes ?? null,
      surface: body.surface ?? "result_page",
    },
  });
}

export async function POST(request: Request) {
  const rateLimitBlock = buildRateLimitResponse(
    await checkRateLimit(generalApiLimiter, getRateLimitId(request))
  );
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  const auth = await requireUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (isOutcomeFeedbackPayload(requestBody)) {
    const parsedBody = OutcomeFeedbackRequestBodySchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const saved = await saveOutcomeFeedback(parsedBody.data, auth.user.id);
    const saveOk = typeof saved === "boolean" ? saved : saved.ok;

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

  const parsedTesterFeedback =
    TesterFeedbackRequestBodySchema.safeParse(requestBody);
  if (!parsedTesterFeedback.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const saved = await saveTesterFeedback(parsedTesterFeedback.data, auth.user.id);

  if (!saved.ok || !saved.caseSummary) {
    const status =
      saved.warnings.some((warning) => warning.toLowerCase().includes("not found"))
        ? 404
        : 503;
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to save outcome feedback",
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    case: saved.caseSummary,
    warnings: saved.warnings,
  });
}

export async function GET(request: Request) {
  const rateLimitBlock = buildRateLimitResponse(
    await checkRateLimit(generalApiLimiter, getRateLimitId(request))
  );
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  const auth = await requireUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const url = new URL(request.url);
  const flaggedOnly = url.searchParams.get("flaggedOnly") === "true";
  const symptomCheckId = url.searchParams.get("symptomCheckId") ?? undefined;

  const listed = await listTesterFeedbackCases({
    userId: auth.user.id,
    flaggedOnly,
    symptomCheckId,
  });

  if (!listed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: listed.warnings[0] ?? "Unable to load outcome feedback cases",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    cases: listed.cases,
    warnings: listed.warnings,
  });
}
