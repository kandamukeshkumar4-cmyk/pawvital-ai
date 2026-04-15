import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { loadAdminTelemetryDashboardData } from "@/lib/admin-telemetry";

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
