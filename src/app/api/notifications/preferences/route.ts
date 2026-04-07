import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

const PreferencesUpdateSchema = z.object({
  email_digest: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
  urgency_alerts: z.boolean().optional(),
  outcome_reminders: z.boolean().optional(),
  digest_frequency: z.enum(["daily", "weekly", "never"]).optional(),
});

async function getClient(request: Request) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );
  if (!rateLimitResult.success) {
    return {
      limitError: NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
            ),
          },
        }
      ),
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    return { supabase };
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return {
        limitError: NextResponse.json(
          { error: "Database access is not configured", code: "DEMO_MODE" },
          { status: 503 }
        ),
      };
    }
    console.error(
      "[NotificationPreferences] Failed to create Supabase client:",
      error
    );
    return {
      limitError: NextResponse.json(
        { error: "Unable to connect to the database" },
        { status: 500 }
      ),
    };
  }
}

export async function GET(request: Request) {
  const { supabase, limitError } = await getClient(request);
  if (limitError) return limitError;

  const {
    data: { user },
    error: authError,
  } = await supabase!.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You must be authenticated to view notification preferences" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase!
    .from("notification_preferences")
    .select(
      "email_digest, push_enabled, urgency_alerts, outcome_reminders, digest_frequency"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(
      "[NotificationPreferences] Failed to fetch preferences:",
      error
    );
    return NextResponse.json(
      { error: "Unable to fetch preferences" },
      { status: 500 }
    );
  }

  // Return defaults when the row doesn't exist yet
  const defaults = {
    email_digest: true,
    push_enabled: false,
    urgency_alerts: true,
    outcome_reminders: true,
    digest_frequency: "daily" as const,
  };

  return NextResponse.json({ data: data ?? defaults });
}

export async function PUT(request: Request) {
  const { supabase, limitError } = await getClient(request);
  if (limitError) return limitError;

  const {
    data: { user },
    error: authError,
  } = await supabase!.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You must be authenticated to update notification preferences" },
      { status: 401 }
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PreferencesUpdateSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase!
    .from("notification_preferences")
    .upsert(
      { user_id: user.id, ...parsed.data },
      { onConflict: "user_id" }
    )
    .select(
      "email_digest, push_enabled, urgency_alerts, outcome_reminders, digest_frequency"
    )
    .maybeSingle();

  if (error) {
    console.error(
      "[NotificationPreferences] Failed to update preferences:",
      error
    );
    return NextResponse.json(
      { error: "Unable to update preferences" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
