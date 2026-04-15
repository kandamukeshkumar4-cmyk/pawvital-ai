import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildAdminShadowRolloutDashboardData,
  updateAdminShadowRolloutControl,
} from "@/lib/admin-shadow-rollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  liveSplitPct?: number;
  service?: string;
}

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
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.service || typeof body.liveSplitPct !== "number") {
      return NextResponse.json(
        { error: "service and liveSplitPct are required" },
        { status: 400 }
      );
    }

    const result = await updateAdminShadowRolloutControl({
      liveSplitPct: body.liveSplitPct,
      service: body.service,
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
