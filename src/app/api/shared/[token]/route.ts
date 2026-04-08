import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

type SharedReportRow = {
  check_id: string;
  ai_response: string | null;
  expires_at: string;
};

const SharedTokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(256),
});

function parseSharedReport(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
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

  const parsedParams = SharedTokenParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid shared token" },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Shared reports are not available in demo mode" },
        { status: 503 }
      );
    }

    console.error("[shared] Failed to create Supabase client:", error);
    return NextResponse.json(
      { error: "Shared reports are temporarily unavailable" },
      { status: 503 }
    );
  }

  const { data: sharedRow, error: sharedError } = await supabase
    .from("shared_reports")
    .select("check_id, ai_response, expires_at")
    .eq("share_token", parsedParams.data.token)
    .maybeSingle();

  if (sharedError) {
    console.error("[shared] Failed to verify shared report token:", sharedError);
    return NextResponse.json(
      { error: "Shared reports are temporarily unavailable" },
      { status: 503 }
    );
  }

  if (!sharedRow) {
    return NextResponse.json({ error: "Shared report not found" }, { status: 404 });
  }

  const row = sharedRow as SharedReportRow;
  const expiresAt = new Date(row.expires_at);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Shared report has expired" },
      { status: 410 }
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_shared_report", {
    p_token: parsedParams.data.token,
  });

  if (rpcError) {
    console.error("[shared] Failed to fetch shared report:", rpcError);
    return NextResponse.json(
      { error: "Shared reports are temporarily unavailable" },
      { status: 503 }
    );
  }

  // The RPC is the authoritative access-control gate. If it returns empty,
  // treat that as a hard denial — do not fall back to the direct-select row.
  // This prevents a scenario where RLS or function drift causes the RPC to
  // return nothing while the direct select succeeded.
  const rows = Array.isArray(rpcData) ? (rpcData as SharedReportRow[]) : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Shared report not found" }, { status: 404 });
  }
  const reportRow = rows[0];

  // Re-validate expiry against the RPC row — not just the direct-select row —
  // so that a divergence between the two (e.g. after a schema migration or
  // function drift) cannot serve an expired report.
  const reportExpiresAt = new Date(reportRow.expires_at);
  if (!Number.isFinite(reportExpiresAt.getTime()) || reportExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Shared report has expired" },
      { status: 410 }
    );
  }

  const report = parseSharedReport(reportRow.ai_response);

  if (!report) {
    return NextResponse.json(
      { error: "Shared report could not be loaded" },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      token: parsedParams.data.token,
      expires_at: reportRow.expires_at,
      report,
    },
    { status: 200 }
  );
}