export interface SafeSupabaseErrorDetails {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractSafeSupabaseErrorDetails(
  error: unknown
): SafeSupabaseErrorDetails | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as Record<string, unknown>;
  const safeError: SafeSupabaseErrorDetails = {
    code: normalizeOptionalText(candidate.code),
    message: normalizeOptionalText(candidate.message),
    details: normalizeOptionalText(candidate.details),
    hint: normalizeOptionalText(candidate.hint),
  };

  return Object.values(safeError).some(Boolean) ? safeError : null;
}

export function formatSafeSupabaseErrorSummary(
  safeError: SafeSupabaseErrorDetails | null | undefined
) {
  if (!safeError) {
    return "";
  }

  return [safeError.code, safeError.message, safeError.details, safeError.hint]
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

export function isMissingRelationSupabaseError(
  safeError: SafeSupabaseErrorDetails | null | undefined
) {
  if (!safeError) {
    return false;
  }

  if (safeError.code === "42P01") {
    return true;
  }

  const message = safeError.message?.toLowerCase() ?? "";
  return (
    /relation .* does not exist/.test(message) ||
    /table .* does not exist/.test(message)
  );
}

export function isPolicySupabaseError(
  safeError: SafeSupabaseErrorDetails | null | undefined
) {
  if (!safeError) {
    return false;
  }

  if (safeError.code === "42501") {
    return true;
  }

  const message = safeError.message?.toLowerCase() ?? "";
  return (
    message.includes("row-level security") ||
    message.includes("permission denied")
  );
}
