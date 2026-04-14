import { headers, cookies } from "next/headers";
import AdminDashboardClient from "./AdminDashboardClient";
import { buildDemoThresholdProposalDashboardData } from "@/lib/admin-threshold-proposals";
import { isNvidiaConfigured } from "@/lib/nvidia-models";

export default async function AdminDashboardPage() {
  const isDemo = !isNvidiaConfigured() || !process.env.NEXT_PUBLIC_SUPABASE_URL;

  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const cookieHeader = (await cookies()).toString();

  let stats = null;
  let deployment = null;
  let thresholdProposals = null;

  try {
    const [statsRes, deploymentRes, thresholdProposalRes] = await Promise.all([
      fetch(`${baseUrl}/api/admin/stats`, { headers: { cookie: cookieHeader } }),
      fetch(`${baseUrl}/api/admin/deployment`, { headers: { cookie: cookieHeader } }),
      fetch(`${baseUrl}/api/admin/threshold-proposals`, {
        headers: { cookie: cookieHeader },
      }),
    ]);

    if (statsRes.ok) stats = await statsRes.json();
    if (deploymentRes.ok) deployment = await deploymentRes.json();
    if (thresholdProposalRes.ok) {
      thresholdProposals = await thresholdProposalRes.json();
    }
  } catch (error) {
    console.error("Failed to fetch admin data:", error);
  }

  // Demo fallback
  if (isDemo || (!stats && !deployment)) {
    stats = {
      checks_24h: 142,
      checks_7d: 890,
      checks_30d: 3450,
      outcomes_confirmed: 215,
      knowledge_chunks: 14502,
      audio_assets: 312,
    };
    deployment = {
      state: "READY",
      created_at: new Date().toISOString(),
      url: "https://demo.pawvital.com",
      commit_sha: "abcd123",
    };
    thresholdProposals = buildDemoThresholdProposalDashboardData();
  } else if (!thresholdProposals) {
    thresholdProposals = buildDemoThresholdProposalDashboardData();
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      {isDemo && (
         <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6">
           <p className="font-bold">Demo Mode</p>
           <p>Showing plausible fallback data because Nvidia/Supabase is not configured or auth is missing.</p>
         </div>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Admin Ops Dashboard</h1>
      <AdminDashboardClient
        initialDeployment={deployment}
        initialStats={stats}
        initialThresholdProposals={thresholdProposals}
      />
    </div>
  );
}
