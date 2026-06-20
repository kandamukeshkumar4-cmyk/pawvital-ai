import { NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import type { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

type RequireOwnedPetResult =
  | {
      response: NextResponse;
      supabase?: never;
      user?: never;
      petId?: never;
    }
  | {
      response?: never;
      supabase: SupabaseServerClient;
      user: User;
      petId: string;
    };

const PetIdSchema = z.string().uuid();

/**
 * Shared route guard for owner-scoped, single-pet GET endpoints (dog-brain
 * signals / follow-ups). Runs the identical front-matter every such route used
 * to inline:
 *
 *   rate-limit → zod uuid(pet_id) → requireAuthenticatedApiUser → pets ownership
 *
 * and returns either a ready-to-send error `response` or the authenticated
 * `{ supabase, user, petId }` context. The HTTP contract is preserved verbatim:
 * 429 (rate limit), 400 VALIDATION_ERROR (bad/absent uuid), the auth response
 * (401 / 503 DEMO_MODE / 500), 404 (pet not owned/found), and 500 (pets lookup
 * failed). The caller keeps ownership of its own table query + TABLE_MISSING
 * handling.
 */
export async function requireOwnedPet(input: {
  request: Request;
  petId: string | null | undefined;
  demoMessage?: string;
}): Promise<RequireOwnedPetResult> {
  const rateLimit = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(input.request),
  );
  if (!rateLimit.success) {
    return {
      response: NextResponse.json(
        { error: "Too many requests" },
        { status: 429 },
      ),
    };
  }

  const parsed = PetIdSchema.safeParse(input.petId);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "Invalid pet_id", code: "VALIDATION_ERROR" },
        { status: 400 },
      ),
    };
  }

  const auth = await requireAuthenticatedApiUser({
    demoMessage: input.demoMessage,
  });
  // Truthy-narrow rather than `"response" in auth`: the success branch types
  // response as `response?: never`, so the `in` check leaves it `| undefined`.
  if (auth.response) return { response: auth.response };

  try {
    const { data: pet, error } = await auth.supabase
      .from("pets")
      .select("id")
      .eq("id", parsed.data)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!pet) {
      return {
        response: NextResponse.json(
          { error: "Pet not found" },
          { status: 404 },
        ),
      };
    }
  } catch (error) {
    console.error("[requireOwnedPet] pet ownership check failed:", error);
    return {
      response: NextResponse.json({ error: "Server error" }, { status: 500 }),
    };
  }

  return { supabase: auth.supabase, user: auth.user, petId: parsed.data };
}
