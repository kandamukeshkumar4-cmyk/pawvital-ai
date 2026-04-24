import { createServerSupabaseClient } from "./supabase-server";
import {
  isAdminEmailAllowlisted,
  isAdminFromRoleRow,
  isAdminViaAuthMetadata,
  normalizeAdminEmail,
} from "./admin-identity";

export interface AdminRequestContext {
  email: string | null;
  isDemo: boolean;
  userId: string | null;
}

function isTruthyEnvFlag(value: string | undefined) {
  return value === "true" || value === "1";
}

function isProductionAdminRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function getAdminOverrideEmail() {
  const overrideEmail = process.env.ADMIN_OVERRIDE_EMAIL?.trim().toLowerCase();
  return overrideEmail || "admin-override@pawvital.local";
}

async function isAdminViaRoleTable(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: "profiles" | "users",
  userId: string
) {
  try {
    const { data } = await supabase
      .from(table)
      .select("role, is_admin")
      .eq("id", userId)
      .maybeSingle();

    return isAdminFromRoleRow(data);
  } catch {
    return false;
  }
}

export async function getAdminRequestContext(): Promise<AdminRequestContext | null> {
  if (!isProductionAdminRuntime() && isTruthyEnvFlag(process.env.ADMIN_OVERRIDE)) {
    return {
      email: getAdminOverrideEmail(),
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

    const email = normalizeAdminEmail(user.email);
    if (isAdminViaAuthMetadata(user)) {
      return { email, isDemo: false, userId: user.id };
    }

    if (isAdminEmailAllowlisted(email)) {
      return { email, isDemo: false, userId: user.id };
    }

    if (await isAdminViaRoleTable(supabase, "users", user.id)) {
      return { email, isDemo: false, userId: user.id };
    }

    if (await isAdminViaRoleTable(supabase, "profiles", user.id)) {
      return { email, isDemo: false, userId: user.id };
    }
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      if (isProductionAdminRuntime()) {
        return null;
      }

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
