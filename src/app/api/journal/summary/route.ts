import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateNvidiaJson,
  isNvidiaGenerationConfigured,
} from "@/lib/nvidia-generation";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import type { JournalSummary } from "@/types/journal";

const EntryBriefSchema = z.object({
  entry_date: z.string().min(1),
  mood: z.string().nullable().optional(),
  energy_level: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const BodySchema = z.object({
  entries: z.array(EntryBriefSchema).length(7),
});

const DEMO_SUMMARY: JournalSummary = {
  summary:
    "Over the past week, entries suggest generally stable day-to-day wellbeing. Connect NVIDIA NIM for a personalized veterinary-style summary from your notes.",
  trend: "stable",
  flags: [],
  recommendation:
    "Keep logging mood and energy; contact your veterinarian if you notice sudden behavior or appetite changes.",
};

function normalizeSummary(raw: Record<string, unknown>): JournalSummary {
  const summary =
    typeof raw.summary === "string" ? raw.summary : String(raw.summary ?? "");
  const trend =
    typeof raw.trend === "string" ? raw.trend : "mixed";
  const flags = Array.isArray(raw.flags)
    ? raw.flags.map((f) => (typeof f === "string" ? f : String(f)))
    : [];
  const recommendation =
    typeof raw.recommendation === "string"
      ? raw.recommendation
      : String(raw.recommendation ?? "");

  return { summary, trend, flags, recommendation };
}

export async function POST(request: Request) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Journal AI summary requires a configured account backend",
  });
  if ("response" in auth) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Provide exactly 7 journal entries",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  if (!isNvidiaGenerationConfigured("phrasing_verifier")) {
    return NextResponse.json(DEMO_SUMMARY);
  }

  const lines = parsed.data.entries.map((e, i) => {
    const parts = [
      `Day ${i + 1} (${e.entry_date}):`,
      e.mood ? `mood=${e.mood}` : null,
      e.energy_level != null ? `energy=${e.energy_level}/10` : null,
      e.notes ? `notes=${e.notes}` : null,
    ].filter(Boolean);
    return parts.join(" ");
  });

  // This prompt is strictly wellness/lifestyle summarization — mood trends, energy
  // patterns, and owner-logged notes. It does NOT perform clinical triage, urgency
  // scoring, or diagnosis. All medical decisions remain in clinical-matrix.ts.
  const prompt = `You are a pet wellness journaling assistant. Summarize the owner's observations for their pet over the last 7 days (oldest to newest).

IMPORTANT: This is a wellness journal summary only. Do NOT diagnose diseases, assess urgency, or make clinical recommendations. This output is NOT a substitute for veterinary care.

Entries (owner-reported mood, energy, and notes):
${lines.join("\n")}

Respond ONLY with valid JSON (no markdown) in this exact shape:
{
  "summary": "2-4 sentences describing what the owner observed this week (mood and energy trends only)",
  "trend": "one of: improving | stable | declining | mixed",
  "flags": ["notable owner observations worth mentioning at next vet visit, else empty array"],
  "recommendation": "one practical reminder (e.g. keep logging, schedule routine checkup); never replace vet advice"
}

Never diagnose. Never assess urgency. If data is sparse, say so briefly.`;

  try {
    const result = await generateNvidiaJson<Record<string, unknown>>({
      role: "phrasing_verifier",
      prompt,
      maxTokens: 768,
      temperature: 0.25,
      contextLabel: "journal weekly summary",
    });
    return NextResponse.json(normalizeSummary(result));
  } catch (err) {
    console.error("[Journal Summary] Generation failed:", err);
    return NextResponse.json({
      summary:
        "We could not generate an AI summary right now. Your entries are still saved.",
      trend: "mixed",
      flags: [],
      recommendation:
        "Try again later, and speak with your veterinarian about any worrisome changes.",
    } satisfies JournalSummary);
  }
}
