type EnvLike = Record<string, string | undefined>;

export interface AdminIdentityUser {
  app_metadata?: unknown;
  email?: unknown;
  role?: unknown;
  user_metadata?: unknown;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

export function normalizeAdminEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() || null : null;
}

export function getAdminEmailAllowlist(env: EnvLike = process.env) {
  return (env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmailAllowlisted(
  email: string | null | undefined,
  env: EnvLike = process.env
) {
  return Boolean(email && getAdminEmailAllowlist(env).includes(email));
}

export function isAdminViaAuthMetadata(user: {
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

export function isAdminIdentityUser(
  user: AdminIdentityUser | null | undefined,
  env: EnvLike = process.env
) {
  if (!user) {
    return false;
  }

  return (
    isAdminViaAuthMetadata(user) ||
    isAdminEmailAllowlisted(normalizeAdminEmail(user.email), env)
  );
}

export function isAdminFromRoleRow(value: unknown) {
  const row = asObject(value);

  return hasAdminRole(row?.role) || isTruthyAdminFlag(row?.is_admin);
}
