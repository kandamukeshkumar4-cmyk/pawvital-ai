import type { PlatformDbProvider } from "../types";

/**
 * Azure PostgreSQL Flexible Server adapter (C2). Uses DATABASE_URL when
 * PLATFORM_DB_PROVIDER=azure-postgres after schema migration.
 */
export class AzurePostgresDbProvider implements PlatformDbProvider {
  readonly id = "azure-postgres" as const;

  async ping(): Promise<boolean> {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl || !databaseUrl.includes("postgres")) {
      return false;
    }

    // Lazy import keeps Supabase path free of pg dependency until cutover.
    try {
      const { default: pg } = await import("pg");
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        await client.end().catch(() => {});
      }
    } catch {
      return false;
    }
  }
}
