import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  listTesterFeedbackCases,
  saveTesterFeedbackToDB,
} from "@/lib/tester-feedback-storage";
import {
  TESTER_FEEDBACK_CONFUSING_AREA_VALUES,
  TESTER_FEEDBACK_HELPFULNESS_VALUES,
  TESTER_FEEDBACK_SURFACE_VALUES,
  TESTER_FEEDBACK_TRUST_VALUES,
} from "@/lib/tester-feedback-contract";

const TesterFeedbackBodySchema = z.object({
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

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null };
  }

  return { user };
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TesterFeedbackBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  let auth;
  try {
    auth = await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Feedback requires a configured account", code: "DEMO_MODE" },
        { status: 503 }
      );
    }
    console.error("[TesterFeedback] Auth setup failed:", error);
    return NextResponse.json(
      { error: "Unable to validate the current user" },
      { status: 500 }
    );
  }

  if (!auth.user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const saved = await saveTesterFeedbackToDB({
    userId: auth.user.id,
    feedback: {
      symptomCheckId: parsed.data.symptomCheckId,
      helpfulness: parsed.data.helpfulness,
      confusingAreas: parsed.data.confusingAreas,
      trustLevel: parsed.data.trustLevel,
      notes: parsed.data.notes ?? null,
      surface: parsed.data.surface ?? "result_page",
    },
  });

  if (!saved.ok || !saved.caseSummary) {
    const status =
      saved.warnings.some((warning) => warning.includes("not found")) ? 404 : 503;
    return NextResponse.json(
      {
        ok: false,
        error: saved.warnings[0] ?? "Unable to save tester feedback",
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
  let auth;
  try {
    auth = await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Feedback queries require a configured account", code: "DEMO_MODE" },
        { status: 503 }
      );
    }
    console.error("[TesterFeedback] Auth setup failed:", error);
    return NextResponse.json(
      { error: "Unable to validate the current user" },
      { status: 500 }
    );
  }

  if (!auth.user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
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
        error: listed.warnings[0] ?? "Unable to load tester feedback cases",
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
