import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildDemoThresholdProposalDashboardData,
  buildThresholdProposalReviewCycleDraft,
  isReviewedThresholdProposal,
  normalizeThresholdProposalRows,
} from "@/lib/admin-threshold-proposals";
import { getServiceSupabase } from "@/lib/supabase-admin";

interface ReviewCycleRequestBody {
  cycleSlug?: string;
  proposalIds?: string[];
}

function normalizeRequestedProposalIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );
}

async function loadThresholdProposals(proposalIds: string[]) {
  const serviceSupabase = getServiceSupabase();
  if (!serviceSupabase) {
    return buildDemoThresholdProposalDashboardData().proposals;
  }

  let query = serviceSupabase
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
    .order("created_at", { ascending: false });

  if (proposalIds.length > 0) {
    query = query.in("id", proposalIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return normalizeThresholdProposalRows(data || []);
}

export async function POST(request: Request) {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let body: ReviewCycleRequestBody;
    try {
      body = (await request.json()) as ReviewCycleRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const requestedProposalIds = normalizeRequestedProposalIds(
      body.proposalIds,
    );
    const allProposals =
      adminContext.isDemo || !getServiceSupabase()
        ? buildDemoThresholdProposalDashboardData().proposals
        : await loadThresholdProposals(requestedProposalIds);
    const reviewedProposals = allProposals.filter(isReviewedThresholdProposal);

    if (reviewedProposals.length === 0) {
      return NextResponse.json(
        {
          error:
            "Review at least one proposal before generating the cycle record",
        },
        { status: 400 },
      );
    }

    const reviewCycle = buildThresholdProposalReviewCycleDraft({
      cycleSlug: body.cycleSlug,
      generatedAt: new Date().toISOString(),
      generatedBy: adminContext.email || "admin-review-dashboard",
      proposals:
        requestedProposalIds.length > 0
          ? reviewedProposals.filter((proposal) =>
              requestedProposalIds.includes(proposal.id),
            )
          : reviewedProposals,
    });

    return NextResponse.json({
      ok: true,
      reviewCycle,
    });
  } catch (error) {
    console.error("Threshold proposal review cycle route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
