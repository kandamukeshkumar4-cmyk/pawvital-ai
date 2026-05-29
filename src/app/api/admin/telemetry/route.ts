import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { loadAdminTelemetryDashboardData } from "@/lib/admin-telemetry";
import {
  trackException,
  trackRouteTelemetry,
} from "@/lib/azure/telemetry";

export const dynamic = "force-dynamic";
const ROUTE_NAME = "api.admin.telemetry";

export async function GET() {
  const startedAtMs = Date.now();
  let statusCode = 200;
  let errorCode: string | undefined;

  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      statusCode = 401;
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const telemetry = await loadAdminTelemetryDashboardData(adminContext);
    return NextResponse.json(telemetry);
  } catch (error) {
    statusCode = 500;
    errorCode = "admin_telemetry_unhandled";
    console.error("Admin telemetry GET route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  } finally {
    void trackRouteTelemetry({
      routeName: ROUTE_NAME,
      statusCode,
      startedAtMs,
      errorCode,
    });
    if (errorCode) {
      void trackException(errorCode, { routeName: ROUTE_NAME });
    }
  }
}
