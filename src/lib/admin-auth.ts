import { createServerSupabaseClient } from "./supabase-server";

export interface AdminRequestContext {
  email: string | null;
  isDemo: boolean;
  userId: string | null;
}

function isTruthyEnvFlag(value: string | undefined) {
  return value === "true" || value === "1";
}

function getAdminEmailAllowlist() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdminViaUsersTable(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
) {
  try {
    const { data } = await supabase
      .from("users")
      .select("role, is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (!data || typeof data !== "object") {
      return false;
    }

    const row = data as Record<string, unknown>;
    return row.role === "admin" || row.is_admin === true;
  } catch {
    return false;
  }
}

export async function getAdminRequestContext(): Promise<AdminRequestContext | null> {
  if (
    process.env.NODE_ENV !== "production" &&
    isTruthyEnvFlag(process.env.ADMIN_OVERRIDE)
  ) {
    return {
      email: process.env.ADMIN_OVERRIDE_EMAIL || "admin-override@pawvital.local",
      isDemo: false,
      userId: "admin-override",
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const email = typeof user.email === "string" ? user.email.toLowerCase() : null;
    if (user.user_metadata?.role === "admin" || user.role === "admin") {
      return { email, isDemo: false, userId: user.id };
    }

    if (email && getAdminEmailAllowlist().includes(email)) {
      return { email, isDemo: false, userId: user.id };
    }

    if (await isAdminViaUsersTable(supabase, user.id)) {
      return { email, isDemo: false, userId: user.id };
    }
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return {
        email: "demo-admin@pawvital.local",
        isDemo: true,
        userId: "demo-admin",
      };
    }
    throw error;
  }

  return null;
}
