export interface PrivateTesterConfigSummary {
  allowedEmailCount: number;
  allowedEmails?: string[];
  blockedEmailCount: number;
  blockedEmails?: string[];
  freeAccess: boolean;
  guestSymptomChecker: boolean;
  inviteOnly: boolean;
  modeEnabled: boolean;
}

export interface PrivateTesterAccessResult {
  allowed: boolean;
  blocked: boolean;
  email: string | null;
  freeAccess: boolean;
  guestSymptomChecker: boolean;
  inviteOnly: boolean;
  modeEnabled: boolean;
  reason:
    | "mode_disabled"
    | "guest_blocked"
    | "guest_symptom_checker"
    | "invite_not_required"
    | "allowlisted_email"
    | "blocked_email"
    | "missing_email"
    | "invite_required";
}

export interface PrivateTesterEnvMutationPlan {
  action: "allow" | "block" | "remove";
  allowedEmails: string[];
  blockedEmails: string[];
}

type EnvLike = Record<string, string | undefined>;

const PRIVATE_TESTER_ROUTE_PREFIX = "/symptom-checker";

function isTruthyEnvFlag(value: string | undefined) {
  return value === "true" || value === "1";
}

function readFlag(
  env: EnvLike,
  keys: string[],
  fallback = false
): boolean {
  for (const key of keys) {
    if (key in env) {
      return isTruthyEnvFlag(env[key]);
    }
  }

  return fallback;
}

function readCsv(env: EnvLike, keys: string[]) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  return [];
}

export function normalizePrivateTesterEmail(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isPrivateTesterModeEnabled(env: EnvLike = process.env) {
  return readFlag(
    env,
    ["NEXT_PUBLIC_PRIVATE_TESTER_MODE", "PRIVATE_TESTER_MODE"],
    false
  );
}

export function isPrivateTesterInviteOnly(env: EnvLike = process.env) {
  if (!isPrivateTesterModeEnabled(env)) {
    return false;
  }

  return readFlag(
    env,
    ["NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY", "PRIVATE_TESTER_INVITE_ONLY"],
    true
  );
}

export function isPrivateTesterFreeAccessEnabled(env: EnvLike = process.env) {
  if (!isPrivateTesterModeEnabled(env)) {
    return false;
  }

  return readFlag(
    env,
    ["NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS", "PRIVATE_TESTER_FREE_ACCESS"],
    true
  );
}

export function isGuestSymptomCheckerEnabled(env: EnvLike = process.env) {
  if (!isPrivateTesterModeEnabled(env)) {
    return false;
  }

  return readFlag(
    env,
    [
      "NEXT_PUBLIC_PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER",
      "PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER",
    ],
    false
  );
}

export function getPrivateTesterAllowedEmails(env: EnvLike = process.env) {
  return readCsv(env, ["PRIVATE_TESTER_ALLOWED_EMAILS"]);
}

export function getPrivateTesterBlockedEmails(env: EnvLike = process.env) {
  return readCsv(env, ["PRIVATE_TESTER_BLOCKED_EMAILS"]);
}

export function isPrivateTesterSymptomCheckerPath(pathname: string | null | undefined) {
  return (
    typeof pathname === "string" &&
    (pathname === PRIVATE_TESTER_ROUTE_PREFIX ||
      pathname.startsWith(`${PRIVATE_TESTER_ROUTE_PREFIX}/`))
  );
}

export function buildPrivateTesterConfigSummary(
  env: EnvLike = process.env
): PrivateTesterConfigSummary {
  const allowedEmails = getPrivateTesterAllowedEmails(env);
  const blockedEmails = getPrivateTesterBlockedEmails(env);

  return {
    allowedEmailCount: allowedEmails.length,
    allowedEmails,
    blockedEmailCount: blockedEmails.length,
    blockedEmails,
    freeAccess: isPrivateTesterFreeAccessEnabled(env),
    guestSymptomChecker: isGuestSymptomCheckerEnabled(env),
    inviteOnly: isPrivateTesterInviteOnly(env),
    modeEnabled: isPrivateTesterModeEnabled(env),
  };
}

export function buildPrivateTesterEnvMutationPlan(
  email: string,
  action: "allow" | "block" | "remove",
  env: EnvLike = process.env
): PrivateTesterEnvMutationPlan {
  const normalizedEmail = normalizePrivateTesterEmail(email);
  const allowedEmails = new Set(getPrivateTesterAllowedEmails(env));
  const blockedEmails = new Set(getPrivateTesterBlockedEmails(env));

  if (!normalizedEmail) {
    return {
      action,
      allowedEmails: [...allowedEmails],
      blockedEmails: [...blockedEmails],
    };
  }

  if (action === "allow") {
    allowedEmails.add(normalizedEmail);
    blockedEmails.delete(normalizedEmail);
  } else if (action === "block") {
    blockedEmails.add(normalizedEmail);
  } else {
    allowedEmails.delete(normalizedEmail);
    blockedEmails.delete(normalizedEmail);
  }

  return {
    action,
    allowedEmails: [...allowedEmails].sort(),
    blockedEmails: [...blockedEmails].sort(),
  };
}

export function evaluatePrivateTesterAccess(
  input: {
    email?: string | null;
    pathname?: string | null;
  },
  env: EnvLike = process.env
): PrivateTesterAccessResult {
  const email = normalizePrivateTesterEmail(input.email);
  const modeEnabled = isPrivateTesterModeEnabled(env);
  const inviteOnly = isPrivateTesterInviteOnly(env);
  const freeAccess = isPrivateTesterFreeAccessEnabled(env);
  const guestSymptomChecker = isGuestSymptomCheckerEnabled(env);

  if (!modeEnabled) {
    return {
      allowed: true,
      blocked: false,
      email,
      freeAccess: false,
      guestSymptomChecker: false,
      inviteOnly: false,
      modeEnabled: false,
      reason: "mode_disabled",
    };
  }

  const blockedEmails = new Set(getPrivateTesterBlockedEmails(env));
  if (email && blockedEmails.has(email)) {
    return {
      allowed: false,
      blocked: true,
      email,
      freeAccess,
      guestSymptomChecker,
      inviteOnly,
      modeEnabled,
      reason: "blocked_email",
    };
  }

  if (!inviteOnly) {
    return {
      allowed: true,
      blocked: false,
      email,
      freeAccess,
      guestSymptomChecker,
      inviteOnly,
      modeEnabled,
      reason: email ? "invite_not_required" : "guest_symptom_checker",
    };
  }

  if (email) {
    const allowedEmails = new Set(getPrivateTesterAllowedEmails(env));
    return {
      allowed: allowedEmails.has(email),
      blocked: false,
      email,
      freeAccess,
      guestSymptomChecker,
      inviteOnly,
      modeEnabled,
      reason: allowedEmails.has(email) ? "allowlisted_email" : "invite_required",
    };
  }

  if (
    guestSymptomChecker &&
    isPrivateTesterSymptomCheckerPath(input.pathname)
  ) {
    return {
      allowed: true,
      blocked: false,
      email: null,
      freeAccess,
      guestSymptomChecker,
      inviteOnly,
      modeEnabled,
      reason: "guest_symptom_checker",
    };
  }

  return {
    allowed: false,
    blocked: false,
    email: null,
    freeAccess,
    guestSymptomChecker,
    inviteOnly,
    modeEnabled,
    reason: isPrivateTesterSymptomCheckerPath(input.pathname)
      ? "guest_blocked"
      : "missing_email",
  };
}

export function shouldBypassPlanGateForPrivateTester(
  email: string | null | undefined,
  env: EnvLike = process.env
) {
  if (!isPrivateTesterModeEnabled(env) || !isPrivateTesterFreeAccessEnabled(env)) {
    return false;
  }

  return evaluatePrivateTesterAccess({ email }, env).allowed;
}

export function shouldBypassUsageLimitForPrivateTester(
  email: string | null | undefined,
  env: EnvLike = process.env
) {
  if (!isPrivateTesterModeEnabled(env) || !isPrivateTesterFreeAccessEnabled(env)) {
    return false;
  }

  return evaluatePrivateTesterAccess({ email }, env).allowed;
}
