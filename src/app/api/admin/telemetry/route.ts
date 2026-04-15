import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { loadAdminTelemetryDashboardData } from "@/lib/admin-telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const telemetry = await loadAdminTelemetryDashboardData(adminContext);
    return NextResponse.json(telemetry);
  } catch (error) {
    console.error("Admin telemetry GET route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
