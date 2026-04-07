import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { FullReport } from "@/components/symptom-report";
import type { SymptomReport } from "@/components/symptom-report/types";

type SharedRpcRow = {
  check_id: string;
  ai_response: string | null;
  expires_at: string;
};

function parseAiResponse(raw: string | null): SymptomReport | null {
  if (raw == null || raw === "") return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== "object" || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.title !== "string" ||
      typeof o.severity !== "string" ||
      typeof o.recommendation !== "string" ||
      typeof o.explanation !== "string"
    ) {
      return null;
    }
    const actions = Array.isArray(o.actions)
      ? (o.actions as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const warningSigns = Array.isArray(o.warning_signs)
      ? (o.warning_signs as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    return {
      ...(o as unknown as SymptomReport),
      actions,
      warning_signs: warningSigns,
    };
  } catch {
    return null;
  }
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.startsWith("http") || !anon) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <p className="text-gray-600 text-center">
          Shared reports are not available in demo mode.
        </p>
      </div>
    );
  }

  const supabase = createClient(url, anon);
  const { data, error } = await supabase.rpc("get_shared_report", {
    p_token: token,
  });

  if (error) {
    console.error("[shared report] RPC error:", error);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-gray-800 font-medium">This link is invalid or has expired.</p>
        <Link href="/" className="text-emerald-700 underline text-sm">
          Back to PawVital
        </Link>
      </div>
    );
  }

  const rows = (data ?? []) as SharedRpcRow[];
  const row = rows[0];

  if (!row) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-gray-800 font-medium">This link is invalid or has expired.</p>
        <Link href="/" className="text-emerald-700 underline text-sm">
          Back to PawVital
        </Link>
      </div>
    );
  }

  const report = parseAiResponse(row.ai_response);
  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-gray-800 font-medium">This report could not be loaded.</p>
        <Link href="/" className="text-emerald-700 underline text-sm">
          Back to PawVital
        </Link>
      </div>
    );
  }

  const expiresAt = new Date(row.expires_at);
  const expiresLabel = expiresAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">This report was shared by a PawVital user</p>
          <p className="mt-1 text-emerald-800">
            Read-only view for your veterinarian. Link expires on {expiresLabel}.
          </p>
        </div>
        <FullReport report={report} readOnlyShared />
        <p className="text-center text-xs text-gray-500 pb-8">
          <Link href="/" className="text-emerald-700 hover:underline">
            PawVital AI
          </Link>
          — not a substitute for professional veterinary care.
        </p>
      </div>
    </div>
  );
}
