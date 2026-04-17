import { NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  getCanonicalAppUrl,
  isProductionEnvironment,
  isSupabaseConfigured,
} from "@/lib/env";

export const revalidate = 60; // Cached 60s via next

function buildDemoDeploymentStatus() {
  return {
    state: "READY",
    created_at: new Date().toISOString(),
    url: getCanonicalAppUrl() || "https://demo.pawvital.com",
    commit_sha: "badc0ffee",
  };
}

export async function GET() {
  try {
    const adminContext = await getAdminRequestContext();
    if (!adminContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const vercelToken = process.env.VERCEL_TOKEN;
    if (adminContext.isDemo || !vercelToken) {
      if (!adminContext.isDemo && !vercelToken && isProductionEnvironment()) {
        return NextResponse.json(
          { error: "Deployment status requires VERCEL_TOKEN" },
          { status: 503 }
        );
      }

      // Return demo status if no token
      return NextResponse.json(buildDemoDeploymentStatus());
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
    if (
      error instanceof Error &&
      error.message === "DEMO_MODE" &&
      !isSupabaseConfigured()
    ) {
      return NextResponse.json(buildDemoDeploymentStatus());
    }
    console.error("Deployment API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
