// =============================================================================
// Secret redaction for logs.
//
// Defensive: error messages can incidentally embed sensitive values (e.g. a
// thrown TypeError whose message includes a stringified Supabase session /
// JWT). This redacts token-shaped substrings before anything is logged, so a
// future error can never leak a session token into runtime logs — independent
// of whatever bug produced the error.
// =============================================================================

// A JWT: three base64url segments separated by dots, starting with the standard
// `eyJ` header. Matches access tokens, refresh-bearing session blobs, etc.
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
// `Bearer <token>` headers.
const BEARER_PATTERN = /\b[Bb]earer\s+[A-Za-z0-9._-]{12,}/g;
// Long opaque key/secret values surfaced in `key=value` / `"key":"value"` form.
const SECRET_KV_PATTERN =
  /("?(?:access_token|refresh_token|api[_-]?key|authorization|password|secret)"?\s*[:=]\s*"?)([A-Za-z0-9._-]{8,})("?)/gi;

/**
 * Return a log-safe string for `value`, masking JWTs, bearer tokens, and common
 * secret key/value pairs. Errors keep their stack/message (redacted) so logs
 * stay useful. Pure; never throws.
 */
export function redactSecrets(value: unknown): string {
  let text: string;
  try {
    if (value instanceof Error) {
      text = value.stack ?? `${value.name}: ${value.message}`;
    } else if (typeof value === "string") {
      text = value;
    } else {
      text = JSON.stringify(value);
    }
  } catch {
    text = String(value);
  }
  if (typeof text !== "string") return "[unloggable]";

  return text
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(SECRET_KV_PATTERN, "$1[REDACTED]$3");
}
