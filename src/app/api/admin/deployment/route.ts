import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const revalidate = 60; // Cached 60s via next

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

export async function GET() {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
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
