import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildThresholdProposalPullRequestDraft,
  buildDemoThresholdProposalDashboardData,
  normalizeThresholdProposalRows,
} from "@/lib/admin-threshold-proposals";
import { getServiceSupabase } from "@/lib/supabase-admin";

interface DraftRequestBody {
  proposalIds?: string[];
}

function parseRepoInfo() {
  const rawRepo = process.env.GITHUB_REPO || "kandamukeshkumar4-cmyk/pawvital-ai";
  const [owner, repo] = rawRepo.split("/");
  return { owner, repo };
}

export async function POST(request: Request) {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let body: DraftRequestBody;
    try {
      body = (await request.json()) as DraftRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const requestedProposalIds = Array.isArray(body.proposalIds)
      ? body.proposalIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    let proposals = buildDemoThresholdProposalDashboardData().proposals;
    const serviceSupabase = getServiceSupabase();
    if (!adminContext.isDemo && serviceSupabase) {
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
          `
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (requestedProposalIds.length > 0) {
        query = query.in("id", requestedProposalIds);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Threshold proposal PR draft query failed:", error);
        return NextResponse.json(
          { error: "Failed to load approved threshold proposals" },
          { status: 500 }
        );
      }

      proposals = normalizeThresholdProposalRows(data || []);
    } else if (requestedProposalIds.length > 0) {
      proposals = proposals.filter((proposal) =>
        requestedProposalIds.includes(proposal.id)
      );
    }

    const approvedProposals = proposals.filter(
      (proposal) => proposal.status === "approved"
    );
    if (approvedProposals.length === 0) {
      return NextResponse.json(
        { error: "Select at least one approved threshold proposal" },
        { status: 400 }
      );
    }

    const generatedAt = new Date().toISOString();
    const draft = buildThresholdProposalPullRequestDraft({
      generatedAt,
      generatedBy: adminContext.email || "admin-review-dashboard",
      proposals: approvedProposals,
    });

    const githubToken = process.env.GITHUB_TOKEN;
    if (adminContext.isDemo || !githubToken) {
      return NextResponse.json({
        ok: true,
        mode: "preview",
        draft,
      });
    }

    const { owner, repo } = parseRepoInfo();
    const octokit = new Octokit({ auth: githubToken });
    const repoDetails = await octokit.rest.repos.get({ owner, repo });
    const baseBranch =
      process.env.GITHUB_BASE_BRANCH || repoDetails.data.default_branch;
    const baseRef = await octokit.rest.git.getRef({
      owner,
      ref: `heads/${baseBranch}`,
      repo,
    });
    const baseCommit = await octokit.rest.git.getCommit({
      commit_sha: baseRef.data.object.sha,
      owner,
      repo,
    });
    const createdTree = await octokit.rest.git.createTree({
      base_tree: baseCommit.data.tree.sha,
      owner,
      repo,
      tree: [
        {
          content: draft.fileContent,
          mode: "100644",
          path: draft.filePath,
          type: "blob",
        },
      ],
    });
    const createdCommit = await octokit.rest.git.createCommit({
      message: draft.commitMessage,
      owner,
      parents: [baseRef.data.object.sha],
      repo,
      tree: createdTree.data.sha,
    });

    await octokit.rest.git.createRef({
      owner,
      ref: `refs/heads/${draft.branchName}`,
      repo,
      sha: createdCommit.data.sha,
    });

    const pullRequest = await octokit.rest.pulls.create({
      base: baseBranch,
      body: draft.body,
      draft: true,
      head: draft.branchName,
      owner,
      repo,
      title: draft.title,
    });

    try {
      await octokit.rest.issues.addLabels({
        issue_number: pullRequest.data.number,
        labels: ["clinical-review-required"],
        owner,
        repo,
      });
    } catch (labelError) {
      console.warn("Unable to label threshold proposal draft PR:", labelError);
    }

    return NextResponse.json({
      ok: true,
      mode: "github",
      draft,
      url: pullRequest.data.html_url,
    });
  } catch (error) {
    console.error("Threshold proposal PR draft route error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
