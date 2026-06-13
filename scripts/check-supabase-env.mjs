#!/usr/bin/env node

import process from "node:process";

const SUPABASE_HOST_REF_PATTERN = /^[a-z0-9]{20}$/i;

function extractSupabaseProjectRefFromUrl(url) {
  const trimmed = String(url || "").trim();
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

function extractSupabaseProjectRefFromDatabaseUrl(databaseUrl) {
  const trimmed = String(databaseUrl || "").trim();
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

function checkSupabaseEnv(env) {
  const publicProjectRef = extractSupabaseProjectRefFromUrl(
    env.NEXT_PUBLIC_SUPABASE_URL
  );
  const databaseProjectRef = extractSupabaseProjectRefFromDatabaseUrl(
    env.DATABASE_URL
  );

  if (!publicProjectRef && !databaseProjectRef) {
    return { ok: true, publicProjectRef, databaseProjectRef };
  }

  if (!publicProjectRef || !databaseProjectRef) {
    console.log(
      "check-supabase-env: partial Supabase configuration (skipping strict match)."
    );
    return { ok: true, publicProjectRef, databaseProjectRef };
  }

  if (publicProjectRef !== databaseProjectRef) {
    return { ok: false, publicProjectRef, databaseProjectRef };
  }

  return { ok: true, publicProjectRef, databaseProjectRef };
}

const result = checkSupabaseEnv(process.env);
if (!result.ok) {
  console.error(
    "check-supabase-env: NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL reference different Supabase projects."
  );
  console.error(`  public ref: ${result.publicProjectRef ?? "(missing)"}`);
  console.error(`  database ref: ${result.databaseProjectRef ?? "(missing)"}`);
  process.exit(1);
}

console.log("check-supabase-env: OK");
