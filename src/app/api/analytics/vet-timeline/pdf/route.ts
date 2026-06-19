import { createElement } from "react";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generalApiLimiter, checkRateLimit, getRateLimitId } from "@/lib/rate-limit";
import { loadVetTimelineForPet } from "@/lib/analytics/vet-timeline-server";

/**
 * GET /api/analytics/vet-timeline/pdf?pet_id=...
 *
 * Owner-scoped, downloadable Vet-Ready Timeline PDF — the shareable artifact the
 * "Vet packet" points to. Auth + pet-ownership enforced; demo-safe.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeFileStem(name: string): string {
  return (
    name.replace(/[^\w\s-]/g, "").trim().slice(0, 40).replace(/\s+/g, "-").toLowerCase() ||
    "pet"
  );
}

export async function GET(request: Request) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const petId = new URL(request.url).searchParams.get("pet_id");
  if (!petId || !UUID_RE.test(petId)) {
    return NextResponse.json({ error: "pet_id required" }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await loadVetTimelineForPet(supabase, user.id, petId);
    if (!result) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { VetTimelineDocument } = await import("@/lib/pdf/vet-timeline-document");

    const generatedAt = new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const buffer = await renderToBuffer(
      createElement(VetTimelineDocument, {
        data: result.timeline,
        petName: result.petName,
        generatedAt,
      }) as Parameters<typeof renderToBuffer>[0],
    );

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pawvital-vet-summary-${safeFileStem(result.petName)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "PDF export requires a configured account", code: "DEMO_MODE" },
        { status: 503 },
      );
    }
    console.error("[VetTimeline PDF] failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
