import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildDemoThresholdProposalDashboardData,
  normalizeThresholdProposalRows,
  summarizeThresholdProposals,
} from "@/lib/admin-threshold-proposals";
import { getServiceSupabase } from "@/lib/supabase-admin";

interface PatchBody {
  proposalId?: string;
  reviewerNotes?: string;
  status?: "approved" | "rejected" | "superseded";
}

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const serviceSupabase = getServiceSupabase();
    if (adminContext.isDemo || !serviceSupabase) {
      return NextResponse.json(buildDemoThresholdProposalDashboardData());
    }

    const { data, error } = await serviceSupabase
      .from("threshold_proposals")
      .select(
        `
          id,
          symptom_check_id,
          proposal_type,
          status,
          summary,
          rationale,
          reviewer_notes,
          payload,
          created_at,
          updated_at,
          outcome_feedback_entries (
            id,
            matched_expectation,
            confirmed_diagnosis,
            vet_outcome,
            owner_notes,
            symptom_summary,
            report_title,
            report_severity,
            report_recommendation,
            submitted_at,
            feedback_source
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Threshold proposals GET failed:", error);
      return NextResponse.json(
        { error: "Failed to load threshold proposals" },
        { status: 500 },
      );
    }

    const proposals = normalizeThresholdProposalRows(data || []);
    return NextResponse.json({
      proposals,
      summary: summarizeThresholdProposals(proposals),
    });
  } catch (error) {
    console.error("Threshold proposals GET route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
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

    if (!body.proposalId || !body.status) {
      return NextResponse.json(
        { error: "proposalId and status are required" },
        { status: 400 },
      );
    }

    if (!["approved", "rejected", "superseded"].includes(body.status)) {
      return NextResponse.json(
        { error: "Unsupported proposal status" },
        { status: 400 },
      );
    }

    const reviewerNotes = String(body.reviewerNotes || "").trim();
    const updatedAt = new Date().toISOString();

    if (!reviewerNotes) {
      return NextResponse.json(
        { error: "Reviewer notes are required before recording a decision" },
        { status: 400 },
      );
    }

    const serviceSupabase = getServiceSupabase();
    if (adminContext.isDemo || !serviceSupabase) {
      return NextResponse.json({
        ok: true,
        proposal: {
          id: body.proposalId,
          reviewerNotes,
          status: body.status,
          updatedAt,
        },
      });
    }

    const { error } = await serviceSupabase
      .from("threshold_proposals")
      .update({
        reviewer_notes: reviewerNotes || null,
        status: body.status,
        updated_at: updatedAt,
      })
      .eq("id", body.proposalId);

    if (error) {
      console.error("Threshold proposals PATCH failed:", error);
      return NextResponse.json(
        { error: "Failed to update threshold proposal" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      proposal: {
        id: body.proposalId,
        reviewerNotes,
        status: body.status,
        updatedAt,
      },
    });
  } catch (error) {
    console.error("Threshold proposals PATCH route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
