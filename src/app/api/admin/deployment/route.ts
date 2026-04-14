import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";

export const revalidate = 60; // Cached 60s via next

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const vercelToken = process.env.VERCEL_TOKEN;
    if (adminContext.isDemo || !vercelToken) {
      // Return demo status if no token
      return NextResponse.json({
        state: "READY",
        created_at: new Date().toISOString(),
        url: "https://demo.pawvital.com",
        commit_sha: "badc0ffee"
      });
    }

    const res = await fetch("https://api.vercel.com/v6/deployments?limit=1", {
      headers: {
        Authorization: `Bearer ${vercelToken}`
      }
    });

    if (!res.ok) {
       console.error("Vercel API error:", await res.text());
       return NextResponse.json(
         { error: "Failed to fetch deployment" },
         { status: res.status }
       );
    }

    const data = await res.json();
    const deployment = data.deployments?.[0];

    if (!deployment) {
      return NextResponse.json({ error: "No deployments found" }, { status: 404 });
    }

    return NextResponse.json({
      state: deployment.state,
      created_at: new Date(deployment.created).toISOString(),
      url: `https://${deployment.url}`,
      commit_sha: deployment.meta?.githubCommitSha || "unknown"
    });
  } catch (error) {
    console.error("Deployment API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
