import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildAdminShadowRolloutDashboardData,
  updateAdminShadowRolloutControl,
} from "@/lib/admin-shadow-rollout";
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  jsonError,
} from "@/lib/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBodySchema = z.object({
  liveSplitPct: z.number().min(0).max(100),
  service: z.string().trim().min(1).max(100),
});

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const dashboard = await buildAdminShadowRolloutDashboardData();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Admin shadow rollout GET failed:", error);
    return NextResponse.json(
      { error: "Failed to load shadow rollout dashboard" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const trustedOriginError = enforceTrustedOrigin(request);
  if (trustedOriginError) {
    return trustedOriginError;
  }

  const rateLimitError = await enforceRateLimit(request);
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400, "INVALID_JSON");
    }

    const body =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : null;
    if (!body) {
      return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
    }

    if (body.service === undefined || body.liveSplitPct === undefined) {
      return jsonError(
        "service and liveSplitPct are required",
        400,
        "VALIDATION_ERROR"
      );
    }

    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message?.trim();
      return jsonError(
        firstIssue
          ? `Invalid request body: ${firstIssue}`
          : "Invalid request body",
        400,
        "VALIDATION_ERROR"
      );
    }

    const result = await updateAdminShadowRolloutControl({
      liveSplitPct: parsed.data.liveSplitPct,
      service: parsed.data.service,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin shadow rollout PATCH failed:", error);
    return NextResponse.json(
      { error: "Failed to update shadow rollout control" },
      { status: 500 }
    );
  }
}
