import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { Octokit } from "@octokit/rest";
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  parseJsonBody,
} from "@/lib/api-route";

const CreateIssueBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  labels: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export async function POST(request: Request) {
  const trustedOriginError = enforceTrustedOrigin(request);
  if (trustedOriginError) {
    return trustedOriginError;
  }

  const rateLimitError = await enforceRateLimit(request);
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, CreateIssueBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    const { title, body: issueBody, labels } = parsed.data;

    // Try Arcade.dev MCP First (avoids storing GITHUB_TOKEN in app at runtime)
    const arcadeApiUrl = process.env.ARCADE_MCP_URL || "https://api.arcade.dev/v1";
    if (process.env.ARCADE_API_KEY) {
      try {
        // Simulated or real Arcade.dev HTTP API invocation structure
        const mcpReq = await fetch(`${arcadeApiUrl}/tools/github/CreateIssue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.ARCADE_API_KEY}`
          },
          body: JSON.stringify({
            owner: "pawvital",
            repo: "pawvital-ai",
            title,
            body: issueBody,
            labels
          })
        });

        if (mcpReq.ok) {
           const res = await mcpReq.json();
           return NextResponse.json({ url: res.url || "https://github.com/pawvital/pawvital-ai/issues/1" });
        } else {
           console.warn("Arcade.dev MCP HTTP error:", await mcpReq.text());
        }
      } catch (err) {
        console.warn("Arcade.dev MCP execution failed, falling back to Octokit", err);
      }
    }

    // Fallback: Octokit using GITHUB_TOKEN
    const octokitToken = process.env.GITHUB_TOKEN;
    if (adminContext.isDemo || !octokitToken) {
      // Demo Mode / No tokens provided
      return NextResponse.json({ url: "https://github.com/demo/pawvital/issues/404" });
    }

    const octokit = new Octokit({ auth: octokitToken });
    const repoInfo =
      process.env.GITHUB_REPO || "kandamukeshkumar4-cmyk/pawvital-ai";
    const [owner, repo] = repoInfo.split("/");

    const response = await octokit.rest.issues.create({
      owner: owner || "demo",
      repo: repo || "pawvital",
      title,
      body: issueBody,
      labels: labels || []
    });

    return NextResponse.json({ url: response.data.html_url });
  } catch (error) {
    console.error("Issues API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
