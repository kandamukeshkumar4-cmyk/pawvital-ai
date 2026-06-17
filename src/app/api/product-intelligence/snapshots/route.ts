import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  mapReadinessSnapshotToRow,
  mapRecoveryCheckpointToRow,
} from "@/lib/product-intelligence-persistence";
import { buildDailyReadinessSnapshot } from "@/lib/readiness-snapshot";
import { buildRecoveryCheckpoint } from "@/lib/recovery-checkpoint";
import {
  symptomCheckRowToEntry,
  type SymptomCheckDbRow,
} from "@/lib/symptom-check-entry-map";
import type { SymptomCheckEntry } from "@/components/timeline/types";

type QueryResult<T> = Promise<{ data: T; error: unknown }>;

interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: string): QueryBuilder;
  in(column: string, values: string[]): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryResult<unknown[]>;
  maybeSingle(): QueryResult<unknown | null>;
  insert(row: Record<string, unknown>): QueryBuilder;
}

interface SupabaseClientLike {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: string): QueryBuilder;
}

const ReadinessSaveRequestSchema = z
  .object({
    generated_at: z.string().min(1).optional(),
    health_score: z.number().min(0).max(100).nullable().optional(),
    source_check_ids: z.array(z.string().min(1)).optional(),
  })
  .strict();

const RecoverySaveRequestSchema = z
  .object({
    report_source_id: z.string().min(1),
    generated_at: z.string().min(1).optional(),
    source_check_ids: z.array(z.string().min(1)).optional(),
  })
  .strict();

const ProductIntelligencePostSchema = z
  .object({
    pet_id: z.string().min(1),
    generated_by: z.string().trim().min(1).max(120).optional(),
    readiness: ReadinessSaveRequestSchema.optional(),
    recovery: RecoverySaveRequestSchema.optional(),
  })
  .strict()
  .refine((value) => value.readiness || value.recovery, {
    message: "At least one snapshot payload is required",
  });

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    { status }
  );
}

async function rateLimit(request: Request) {
  const result = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (result.success) return null;

  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
      },
    }
  );
}

async function createClient() {
  try {
    return (await createServerSupabaseClient()) as unknown as SupabaseClientLike;
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return "DEMO_MODE" as const;
    }
    throw error;
  }
}

async function authenticatedUser(supabase: SupabaseClientLike) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function verifyPetOwnership(
  supabase: SupabaseClientLike,
  petId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

async function loadOwnedSymptomEntries(
  supabase: SupabaseClientLike,
  petId: string,
  sourceCheckIds?: string[]
): Promise<SymptomCheckEntry[]> {
  const hasExplicitSourceSelection = Array.isArray(sourceCheckIds);
  const requestedIds = uniqueIds(sourceCheckIds);
  if (hasExplicitSourceSelection && requestedIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("symptom_checks")
    .select("id, pet_id, symptoms, ai_response, severity, recommendation, created_at")
    .eq("pet_id", petId);

  if (requestedIds.length > 0) {
    query = query.in("id", requestedIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? (data as SymptomCheckDbRow[]) : [];
  if (hasExplicitSourceSelection && rows.length !== requestedIds.length) {
    throw new ValidationError("One or more source symptom checks were not found for this pet");
  }

  return rows.map((row) => symptomCheckRowToEntry(row, "Dog"));
}

export async function GET(request: Request) {
  const limited = await rateLimit(request);
  if (limited) return limited;

  const petId = new URL(request.url).searchParams.get("pet_id");
  if (!petId) {
    return jsonError("pet_id is required", 400, "VALIDATION_ERROR");
  }

  let supabase: SupabaseClientLike | "DEMO_MODE";
  try {
    supabase = await createClient();
  } catch (error) {
    console.error("[ProductIntelligence] Failed to create Supabase client:", error);
    return jsonError("Unable to connect to the database", 500);
  }

  if (supabase === "DEMO_MODE") {
    return jsonError("Database access is not configured", 503, "DEMO_MODE");
  }

  const user = await authenticatedUser(supabase);
  if (!user) {
    return jsonError("You must be authenticated to read product intelligence history", 401);
  }

  try {
    if (!(await verifyPetOwnership(supabase, petId, user.id))) {
      return jsonError("Pet not found", 404);
    }

    const { data: readiness, error: readinessError } = await supabase
      .from("daily_readiness_snapshots")
      .select("*")
      .eq("user_id", user.id)
      .eq("pet_id", petId)
      .order("created_at", { ascending: false });

    if (readinessError) throw readinessError;

    const { data: recovery, error: recoveryError } = await supabase
      .from("recovery_checkpoints")
      .select("*")
      .eq("user_id", user.id)
      .eq("pet_id", petId)
      .order("created_at", { ascending: false });

    if (recoveryError) throw recoveryError;

    return NextResponse.json({
      data: {
        readiness: Array.isArray(readiness) ? readiness : [],
        recovery: Array.isArray(recovery) ? recovery : [],
      },
    });
  } catch (error) {
    console.error("[ProductIntelligence] Failed to read snapshot history:", error);
    return jsonError("Unable to read product intelligence history", 500);
  }
}

export async function POST(request: Request) {
  const limited = await rateLimit(request);
  if (limited) return limited;

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsedBody = ProductIntelligencePostSchema.safeParse(requestBody);
  if (!parsedBody.success) {
    return jsonError("Invalid request body", 400, "VALIDATION_ERROR");
  }

  let supabase: SupabaseClientLike | "DEMO_MODE";
  try {
    supabase = await createClient();
  } catch (error) {
    console.error("[ProductIntelligence] Failed to create Supabase client:", error);
    return jsonError("Unable to connect to the database", 500);
  }

  if (supabase === "DEMO_MODE") {
    return jsonError("Database access is not configured", 503, "DEMO_MODE");
  }

  const user = await authenticatedUser(supabase);
  if (!user) {
    return jsonError("You must be authenticated to save product intelligence history", 401);
  }

  try {
    if (!(await verifyPetOwnership(supabase, parsedBody.data.pet_id, user.id))) {
      return jsonError("Pet not found", 404);
    }

    const generatedBy = parsedBody.data.generated_by ?? "analytics-evidence-ring";
    const response: Record<string, unknown> = {};

    if (parsedBody.data.readiness) {
      const entries = await loadOwnedSymptomEntries(
        supabase,
        parsedBody.data.pet_id,
        parsedBody.data.readiness.source_check_ids
      );
      const snapshot = buildDailyReadinessSnapshot({
        petId: parsedBody.data.pet_id,
        entries,
        generatedAt: parsedBody.data.readiness.generated_at ?? new Date().toISOString(),
        healthScore: parsedBody.data.readiness.health_score,
      });

      const row = mapReadinessSnapshotToRow({
        userId: user.id,
        snapshot,
        generatedBy,
      });
      const { data, error } = await supabase
        .from("daily_readiness_snapshots")
        .insert(row as unknown as Record<string, unknown>)
        .select("*")
        .maybeSingle();
      if (error || !data) throw error ?? new Error("Missing readiness insert result");
      response.readiness = data;
    }

    if (parsedBody.data.recovery) {
      const recoverySourceIds = uniqueIds([
        ...(parsedBody.data.recovery.source_check_ids ?? []),
        parsedBody.data.recovery.report_source_id,
      ]);
      const entries = await loadOwnedSymptomEntries(
        supabase,
        parsedBody.data.pet_id,
        recoverySourceIds
      );
      if (!entries.some((entry) => entry.id === parsedBody.data.recovery?.report_source_id)) {
        return jsonError("report_source_id was not found for this pet", 400, "VALIDATION_ERROR");
      }
      const checkpoint = buildRecoveryCheckpoint({
        petId: parsedBody.data.pet_id,
        reportSourceId: parsedBody.data.recovery.report_source_id,
        entries,
        generatedAt: parsedBody.data.recovery.generated_at ?? new Date().toISOString(),
      });

      const row = mapRecoveryCheckpointToRow({
        userId: user.id,
        checkpoint,
        generatedBy,
      });
      const { data, error } = await supabase
        .from("recovery_checkpoints")
        .insert(row as unknown as Record<string, unknown>)
        .select("*")
        .maybeSingle();
      if (error || !data) throw error ?? new Error("Missing recovery insert result");
      response.recovery = data;
    }

    return NextResponse.json({ data: response }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonError(error.message, 400, "VALIDATION_ERROR");
    }
    if (error instanceof Error && error.message.includes("not persistable")) {
      return jsonError(error.message, 400);
    }
    console.error("[ProductIntelligence] Failed to save snapshot history:", error);
    return jsonError("Unable to save product intelligence history", 500);
  }
}
