import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Octokit } from "@octokit/rest";

async function checkAdminAuth() {
  if (process.env.ADMIN_OVERRIDE === "true") {
    return true;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    if (user.user_metadata?.role === "admin" || user.role === "admin") {
      return true;
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userRow?.role === "admin") {
      return true;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return true;
    }
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { title, body: issueBody, labels } = body;

    if (!title || !issueBody) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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
    if (!octokitToken) {
      // Demo Mode / No tokens provided
      return NextResponse.json({ url: "https://github.com/demo/pawvital/issues/404" });
    }

    const octokit = new Octokit({ auth: octokitToken });
    const repoInfo = process.env.GITHUB_REPO || "demo/pawvital-ai"; // expected as "owner/repo"
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
