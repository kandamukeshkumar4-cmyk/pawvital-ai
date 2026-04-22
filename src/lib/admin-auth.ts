import { createServerSupabaseClient } from "./supabase-server";

export interface AdminRequestContext {
  email: string | null;
  isDemo: boolean;
  userId: string | null;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isTruthyEnvFlag(value: string | undefined) {
  return value === "true" || value === "1";
}

function isTruthyAdminFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isAdminRole(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "admin";
}

function hasAdminRole(value: unknown): boolean {
  if (isAdminRole(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => isAdminRole(entry));
  }

  return false;
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

function getAdminEmailAllowlist() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminViaAuthMetadata(user: {
  app_metadata?: unknown;
  role?: unknown;
  user_metadata?: unknown;
}) {
  const userMetadata = asObject(user.user_metadata);
  const appMetadata = asObject(user.app_metadata);
  const appClaims = asObject(appMetadata?.claims);

  return (
    isAdminRole(user.role) ||
    hasAdminRole(userMetadata?.role) ||
    hasAdminRole(userMetadata?.roles) ||
    isTruthyAdminFlag(userMetadata?.is_admin) ||
    hasAdminRole(appMetadata?.role) ||
    hasAdminRole(appMetadata?.roles) ||
    isTruthyAdminFlag(appMetadata?.is_admin) ||
    hasAdminRole(appClaims?.role) ||
    hasAdminRole(appClaims?.roles) ||
    isTruthyAdminFlag(appClaims?.is_admin)
  );
}

function isAdminFromRoleRow(value: unknown) {
  const row = asObject(value);

  return hasAdminRole(row?.role) || isTruthyAdminFlag(row?.is_admin);
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

    const email = typeof user.email === "string" ? user.email.toLowerCase() : null;
    if (isAdminViaAuthMetadata(user)) {
      return { email, isDemo: false, userId: user.id };
    }

    if (email && getAdminEmailAllowlist().includes(email)) {
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
