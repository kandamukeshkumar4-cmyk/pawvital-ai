export const SUPABASE_ENV_SPLIT_BRAIN_ERROR = "SUPABASE_ENV_SPLIT_BRAIN";

export const SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "DATABASE_URL",
] as const;

export type SupabaseEnvKey = (typeof SUPABASE_ENV_KEYS)[number];

type EnvLike = NodeJS.ProcessEnv | Partial<Record<SupabaseEnvKey, string | undefined>>;

type ExtractedRef = {
  projectRef: string | null;
  reason?: "empty" | "invalid-url" | "unsupported-host" | "missing-pooler-username";
};

export type SupabaseEnvAlignmentResult = {
  ok: boolean;
  refs: Partial<Record<SupabaseEnvKey, string>>;
  findings: string[];
};

export function normalizeSupabaseEnvValue(
  rawValue: string | null | undefined
): string {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function extractProjectRefFromPoolerUsername(username: string): string | null {
  const decodedUsername = decodeURIComponent(username);
  const prefix = "postgres.";
  if (!decodedUsername.startsWith(prefix)) {
    return null;
  }

  const projectRef = decodedUsername.slice(prefix.length).trim();
  return projectRef || null;
}

function extractRef(rawValue: string | null | undefined): ExtractedRef {
  const value = normalizeSupabaseEnvValue(rawValue);
  if (!value) {
    return { projectRef: null, reason: "empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { projectRef: null, reason: "invalid-url" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const supabaseRestSuffix = ".supabase.co";
  if (hostname.endsWith(supabaseRestSuffix)) {
    const hostPrefix = hostname.slice(0, -supabaseRestSuffix.length);
    const projectRef = hostPrefix.startsWith("db.")
      ? hostPrefix.slice("db.".length)
      : hostPrefix;

    return projectRef
      ? { projectRef }
      : { projectRef: null, reason: "unsupported-host" };
  }

  if (hostname.endsWith(".pooler.supabase.com")) {
    const projectRef = extractProjectRefFromPoolerUsername(parsed.username);
    return projectRef
      ? { projectRef }
      : { projectRef: null, reason: "missing-pooler-username" };
  }

  return { projectRef: null, reason: "unsupported-host" };
}

export function extractSupabaseProjectRef(
  rawValue: string | null | undefined
): string | null {
  return extractRef(rawValue).projectRef;
}

function describeInvalidEnv(key: SupabaseEnvKey, reason: string): string {
  return `${key} is not a parseable Supabase project URL (${reason})`;
}

function readEnvValue(env: EnvLike, key: SupabaseEnvKey): string | undefined {
  return (env as Partial<Record<string, string | undefined>>)[key];
}

export function evaluateSupabaseEnvAlignment(
  env: EnvLike = process.env
): SupabaseEnvAlignmentResult {
  const refs: Partial<Record<SupabaseEnvKey, string>> = {};
  const findings: string[] = [];

  for (const key of SUPABASE_ENV_KEYS) {
    const rawValue = readEnvValue(env, key);
    const normalizedValue = normalizeSupabaseEnvValue(rawValue);
    if (!normalizedValue) {
      continue;
    }

    const extracted = extractRef(normalizedValue);
    if (extracted.projectRef) {
      refs[key] = extracted.projectRef;
      continue;
    }

    findings.push(describeInvalidEnv(key, extracted.reason ?? "unknown"));
  }

  const uniqueRefs = [...new Set(Object.values(refs))].sort();
  if (uniqueRefs.length > 1) {
    findings.push(
      `Supabase project refs are split across env vars: ${uniqueRefs.join(", ")}`
    );
  }

  return {
    ok: findings.length === 0,
    refs,
    findings,
  };
}

export function assertSupabaseEnvAligned(env: EnvLike = process.env): void {
  const result = evaluateSupabaseEnvAlignment(env);
  if (result.ok) {
    return;
  }

  throw new Error(
    `${SUPABASE_ENV_SPLIT_BRAIN_ERROR}: ${result.findings.join("; ")}`
  );
}
