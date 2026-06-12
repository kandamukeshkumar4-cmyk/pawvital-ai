export interface SupabaseEnvRefs {
  publicProjectRef: string | null;
  databaseProjectRef: string | null;
}

export interface SupabaseEnvGuardResult {
  ok: boolean;
  reason?: string;
  refs: SupabaseEnvRefs;
}

const SUPABASE_HOST_REF_PATTERN = /^[a-z0-9]{20}$/i;

function extractSupabaseProjectRefFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const hostname = new URL(trimmed).hostname;
    const [subdomain] = hostname.split(".");
    if (!subdomain || subdomain === "localhost") {
      return null;
    }
    return SUPABASE_HOST_REF_PATTERN.test(subdomain) ? subdomain.toLowerCase() : null;
  } catch {
    return null;
  }
}

function extractSupabaseProjectRefFromDatabaseUrl(databaseUrl: string): string | null {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const hostname = new URL(trimmed).hostname;
    const match = hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function readSupabaseEnvRefs(env: NodeJS.ProcessEnv = process.env): SupabaseEnvRefs {
  return {
    publicProjectRef: extractSupabaseProjectRefFromUrl(
      env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    ),
    databaseProjectRef: extractSupabaseProjectRefFromDatabaseUrl(
      env.DATABASE_URL ?? ""
    ),
  };
}

export function checkSupabaseEnvConsistency(
  env: NodeJS.ProcessEnv = process.env
): SupabaseEnvGuardResult {
  const refs = readSupabaseEnvRefs(env);
  const { publicProjectRef, databaseProjectRef } = refs;

  if (!publicProjectRef && !databaseProjectRef) {
    return { ok: true, refs };
  }

  if (!publicProjectRef || !databaseProjectRef) {
    return {
      ok: true,
      refs,
      reason: "partial_configuration",
    };
  }

  if (publicProjectRef !== databaseProjectRef) {
    return {
      ok: false,
      refs,
      reason: "project_ref_mismatch",
    };
  }

  return { ok: true, refs };
}

export function assertSupabaseEnvConsistency(
  env: NodeJS.ProcessEnv = process.env
): void {
  const result = checkSupabaseEnvConsistency(env);
  if (!result.ok) {
    throw new Error(
      "Supabase environment mismatch: NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL must reference the same project."
    );
  }
}
