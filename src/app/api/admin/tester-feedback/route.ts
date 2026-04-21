import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildAdminFeedbackLedgerDashboardData,
  buildDemoAdminFeedbackLedgerDashboardData,
} from "@/lib/admin-feedback-ledger";
import { getServiceSupabase } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const serviceSupabase = getServiceSupabase();
    if (adminContext.isDemo || !serviceSupabase) {
      return NextResponse.json(buildDemoAdminFeedbackLedgerDashboardData());
    }

    const { data, error } = await serviceSupabase
      .from("symptom_checks")
      .select(
        "id, pet_id, symptoms, ai_response, severity, recommendation, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      console.error("Admin tester feedback GET failed:", error);
      return NextResponse.json(
        { error: "Failed to load tester feedback ledger" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      buildAdminFeedbackLedgerDashboardData((data ?? []) as Array<{
        id: string;
        pet_id: string | null;
        symptoms: string;
        ai_response: string | Record<string, unknown> | null;
        severity: string | null;
        recommendation: string | null;
        created_at: string;
      }>)
    );
  } catch (error) {
    console.error("Admin tester feedback route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
