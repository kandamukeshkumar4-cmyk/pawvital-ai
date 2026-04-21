import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildPrivateTesterDashboardFallback,
  deletePrivateTesterData,
  inspectPrivateTesterData,
  listPrivateTesterSummaries,
  updatePrivateTesterAdminState,
} from "@/lib/private-tester-admin";
import {
  sanitizePrivateTesterDashboardData,
  sanitizePrivateTesterDataSummary,
  sanitizePrivateTesterDeleteResult,
} from "@/lib/private-tester-admin-sanitization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  action?:
    | "inspect"
    | "delete"
    | "disable_access"
    | "restore_access"
    | "mark_deletion"
    | "clear_deletion_mark";
  dryRun?: boolean;
  email?: string | null;
  note?: string | null;
  userId?: string | null;
}

async function requireAdmin() {
  const adminContext = await getAdminRequestContext();
  if (!adminContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return adminContext;
}

export async function GET() {
  try {
    const adminContext = await requireAdmin();
    if (adminContext instanceof NextResponse) {
      return adminContext;
    }

    return NextResponse.json(
      sanitizePrivateTesterDashboardData(await listPrivateTesterSummaries())
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /SUPABASE_SERVICE_ROLE_REQUIRED/.test(error.message)
    ) {
      return NextResponse.json(
        sanitizePrivateTesterDashboardData(
          buildPrivateTesterDashboardFallback(
            "Service-role Supabase access is not configured, so tester data inspection and deletion are unavailable."
          )
        )
      );
    }

    console.error("Private tester config GET failed:", error);
    return NextResponse.json(
      { error: "Failed to load private tester config" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdmin();
    if (adminContext instanceof NextResponse) {
      return adminContext;
    }

    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.email && !body.userId) {
      return NextResponse.json(
        { error: "email or userId is required" },
        { status: 400 }
      );
    }

    if (body.action === "delete") {
      const result = await deletePrivateTesterData({
        actorEmail: adminContext.email,
        dryRun: body.dryRun,
        email: body.email,
        note: body.note,
        userId: body.userId,
      });
      return NextResponse.json(sanitizePrivateTesterDeleteResult(result));
    }

    if (
      body.action === "disable_access" ||
      body.action === "restore_access" ||
      body.action === "mark_deletion" ||
      body.action === "clear_deletion_mark"
    ) {
      const summary = await updatePrivateTesterAdminState({
        action: body.action,
        actorEmail: adminContext.email,
        email: body.email,
        note: body.note,
        userId: body.userId,
      });

      return NextResponse.json({
        action: body.action,
        dryRun: false,
        summary: sanitizePrivateTesterDataSummary(summary),
      });
    }

    const summary = await inspectPrivateTesterData({
      email: body.email,
      userId: body.userId,
    });

    return NextResponse.json({
      dryRun: body.dryRun !== false,
      summary: sanitizePrivateTesterDataSummary(summary),
    });
  } catch (error) {
    console.error("Private tester admin POST failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process tester admin action";
    const status = /TESTER_IDENTITY_REQUIRED/.test(message)
      ? 400
      : /TESTER_NOT_FOUND|PROFILE_LOOKUP_FAILED/.test(message)
        ? 404
        : /SUPABASE_SERVICE_ROLE_REQUIRED/.test(message)
        ? 503
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
