import { createElement } from "react";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { SymptomReport } from "@/components/symptom-report/types";

const DifferentialSchema = z.object({
  condition: z.string(),
  likelihood: z.enum(["high", "moderate", "low"]),
  description: z.string(),
});

const EvidenceChainItemSchema = z.object({
  source: z.string(),
  finding: z.string(),
  supporting: z.array(z.string()),
  contradicting: z.array(z.string()),
  confidence: z.number(),
});

const ConfidenceAdjustmentSchema = z.object({
  factor: z.string(),
  delta: z.number(),
  direction: z.enum(["increase", "decrease", "neutral"]),
  reason: z.string(),
});

const ConfidenceCalibrationSchema = z.object({
  final_confidence: z.number(),
  base_confidence: z.number(),
  adjustments: z.array(ConfidenceAdjustmentSchema),
  confidence_level: z.enum(["very_low", "low", "moderate", "high", "very_high"]),
  recommendation: z.string(),
});

const HomeCareSchema = z.object({
  instruction: z.string(),
  duration: z.string(),
  details: z.string(),
});

const SymptomReportSchema = z.object({
  severity: z.enum(["low", "medium", "high", "emergency"]),
  recommendation: z.enum(["monitor", "vet_48h", "vet_24h", "emergency_vet"]),
  title: z.string(),
  explanation: z.string(),
  differential_diagnoses: z.array(DifferentialSchema).optional(),
  clinical_notes: z.string().optional(),
  home_care: z.array(HomeCareSchema).optional(),
  actions: z.array(z.string()),
  warning_signs: z.array(z.string()),
  vet_questions: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  confidence_calibration: ConfidenceCalibrationSchema.optional(),
  evidenceChain: z.array(EvidenceChainItemSchema).optional(),
  vet_handoff_summary: z.string().optional(),
  share_url: z.string().url().optional(),
});

export async function POST(request: Request) {
  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "PDF export requires a configured account", code: "DEMO_MODE" },
        { status: 503 }
      );
    }
    console.error("[reports/pdf] Supabase client error:", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = z
    .object({
      report: SymptomReportSchema,
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid report payload", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { share_url, ...reportFields } = parsed.data.report;
  const report = reportFields as SymptomReport;

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ReportPdfDocument } = await import("@/lib/pdf/report-document");

  const generatedAt = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const buffer = await renderToBuffer(
    createElement(ReportPdfDocument, {
      report,
      generatedAt,
      shareUrl: share_url,
    }) as Parameters<typeof renderToBuffer>[0]
  );

  const safeTitle = report.title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .slice(0, 60)
    .replace(/\s+/g, "-")
    .toLowerCase() || "pawvital-report";

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pawvital-${safeTitle}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
