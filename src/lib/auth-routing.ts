const INTERNAL_BASE_URL = "https://pawvital.local";

export const DEFAULT_AUTH_REDIRECT = "/dashboard";
export const RESET_PASSWORD_PATH = "/reset-password";

export const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/symptom-checker",
  "/supplements",
  "/reminders",
  "/journal",
  "/community",
  "/settings",
  "/analytics",
  "/history",
  "/notifications",
  "/pets",
  "/admin",
];

export const AUTH_PAGE_PREFIXES = ["/login", "/signup", "/forgot-password"];

export const AUTH_CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "We couldn't complete sign-in from that link. Please try again.",
  invalid_reset_link: "That password reset link is invalid or has expired.",
};

export const AUTH_REASON_MESSAGES: Record<string, string> = {
  access_required:
    "Sign in with an invited tester or admin account to continue.",
  session_expired: "Your session expired. Please sign in again.",
  password_updated: "Your password was updated. You can continue below.",
  check_email: "Check your email for the link to continue.",
};

const AUTH_NETWORK_ERROR_PATTERNS = [
  "Failed to fetch",
  "Load failed",
  "NetworkError",
  "Network request failed",
  "ERR_NAME_NOT_RESOLVED",
];

const AUTH_NETWORK_ERROR_MESSAGES = {
  login: "We couldn't reach secure sign-in right now. Please try again in a moment.",
  password_reset:
    "We couldn't reach password reset right now. Please try again in a moment.",
  signup: "We couldn't reach account setup right now. Please try again in a moment.",
} as const;

function toPath(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isAuthPagePath(pathname: string) {
  return AUTH_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function sanitizeRedirectTarget(
  rawTarget: string | null | undefined,
  allowedOrigin?: string
) {
  if (!rawTarget) {
    return null;
  }

  const value = rawTarget.trim();
  if (!value || value.startsWith("//")) {
    return null;
  }

  try {
    if (value.startsWith("/")) {
      return toPath(new URL(value, INTERNAL_BASE_URL));
    }

    if (!allowedOrigin) {
      return null;
    }

    const url = new URL(value);
    if (url.origin !== allowedOrigin) {
      return null;
    }

    return toPath(url);
  } catch {
    return null;
  }
}

export function resolvePostAuthRedirect(
  rawTarget: string | null | undefined,
  options?: {
    allowedOrigin?: string;
    fallback?: string;
    allowResetPassword?: boolean;
  }
) {
  const fallback = options?.fallback || DEFAULT_AUTH_REDIRECT;
  const target = sanitizeRedirectTarget(rawTarget, options?.allowedOrigin);

  if (!target) {
    return fallback;
  }

  if (target === "/") {
    return fallback;
  }

  if (isAuthPagePath(target)) {
    return fallback;
  }

  if (!options?.allowResetPassword && target.startsWith(RESET_PASSWORD_PATH)) {
    return fallback;
  }

  return target;
}

export function buildRedirectTarget(pathname: string, search = "") {
  return sanitizeRedirectTarget(`${pathname}${search}`) || DEFAULT_AUTH_REDIRECT;
}

export function appendRedirectParam(pathname: string, redirectTarget: string | null | undefined) {
  const url = new URL(pathname, INTERNAL_BASE_URL);
  const safeTarget = sanitizeRedirectTarget(redirectTarget);

  if (safeTarget) {
    url.searchParams.set("redirect", safeTarget);
  }

  return `${url.pathname}${url.search}`;
}

export function buildRecoveryRedirectPath(redirectTarget: string | null | undefined) {
  return appendRedirectParam(RESET_PASSWORD_PATH, redirectTarget);
}

export function buildCallbackUrl(origin: string, redirectTarget: string | null | undefined) {
  const url = new URL("/api/auth/callback", origin);
  const safeTarget = sanitizeRedirectTarget(redirectTarget, origin);

  if (safeTarget) {
    url.searchParams.set("next", safeTarget);
  }

  return url.toString();
}

export function buildBrowserCallbackUrl(
  origin: string,
  redirectTarget: string | null | undefined
) {
  const url = new URL("/auth/callback", origin);
  const safeTarget = sanitizeRedirectTarget(redirectTarget, origin);

  if (safeTarget) {
    url.searchParams.set("next", safeTarget);
  }

  return url.toString();
}

export function buildRecoveryCallbackUrl(
  origin: string,
  redirectTarget: string | null | undefined
) {
  const url = new URL("/auth/callback", origin);
  const recoveryTarget = buildRecoveryRedirectPath(redirectTarget);

  url.searchParams.set("flow", "recovery");
  url.searchParams.set("next", recoveryTarget);

  return url.toString();
}

export function buildLoginPath(
  redirectTarget: string | null | undefined,
  options?: {
    reason?: string;
    error?: string;
  }
) {
  const url = new URL("/login", INTERNAL_BASE_URL);
  const safeTarget = sanitizeRedirectTarget(redirectTarget);

  if (safeTarget) {
    url.searchParams.set("redirect", safeTarget);
  }

  if (options?.reason) {
    url.searchParams.set("reason", options.reason);
  }

  if (options?.error) {
    url.searchParams.set("error", options.error);
  }

  return `${url.pathname}${url.search}`;
}

export function getAuthFeedbackMessage(reason: string | null, error: string | null) {
  if (error && AUTH_CALLBACK_ERROR_MESSAGES[error]) {
    return {
      tone: "error" as const,
      text: AUTH_CALLBACK_ERROR_MESSAGES[error],
    };
  }

  if (reason && AUTH_REASON_MESSAGES[reason]) {
    return {
      tone: "info" as const,
      text: AUTH_REASON_MESSAGES[reason],
    };
  }

  return null;
}

export function getAuthActionErrorMessage(
  error: unknown,
  action: keyof typeof AUTH_NETWORK_ERROR_MESSAGES,
  fallbackMessage: string
) {
  const rawMessage = error instanceof Error ? error.message.trim() : "";

  if (!rawMessage) {
    return fallbackMessage;
  }

  if (AUTH_NETWORK_ERROR_PATTERNS.some((pattern) => rawMessage.includes(pattern))) {
    return AUTH_NETWORK_ERROR_MESSAGES[action];
  }

  return rawMessage;
}
