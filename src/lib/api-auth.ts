import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";

type AuthenticatedApiContext =
  | {
      response: NextResponse;
      supabase?: never;
      user?: never;
    }
  | {
      response?: never;
      supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
      user: User;
    };

export async function requireAuthenticatedApiUser(input?: {
  demoMessage?: string;
  unauthenticatedMessage?: string;
}): Promise<AuthenticatedApiContext> {
  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return {
        response: NextResponse.json(
          {
            error: input?.demoMessage || "This endpoint requires a configured account backend",
            code: "DEMO_MODE",
          },
          { status: 503 }
        ),
      };
    }

    console.error("[api-auth] Failed to create Supabase client:", error);
    return {
      response: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      response: NextResponse.json(
        { error: input?.unauthenticatedMessage || "Authentication required" },
        { status: 401 }
      ),
    };
  }

  return { supabase, user };
}
