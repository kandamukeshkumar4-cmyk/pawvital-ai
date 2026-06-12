import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("Supabase env split-brain scanner", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { force: true, recursive: true });
      }
    }
  });

  function makeTempRoot(): string {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "pawvital-supabase-env-"));
    tempDirs.push(tempRoot);
    return tempRoot;
  }

  function runScanner(rootDir: string, extraArgs: string[] = []) {
    return spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "check-supabase-env-split-brain.mjs"),
        "--root",
        rootDir,
        ...extraArgs,
      ],
      { encoding: "utf8" }
    );
  }

  it("passes when DATABASE_URL matches the REST/Auth Supabase project", () => {
    const rootDir = makeTempRoot();
    writeFileSync(
      path.join(rootDir, ".env.local"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://gswjpmgxidofwmjngavh.supabase.co",
        "SUPABASE_URL=https://gswjpmgxidofwmjngavh.supabase.co",
        "DATABASE_URL=postgresql://postgres:secret@db.gswjpmgxidofwmjngavh.supabase.co:5432/postgres",
        "",
      ].join("\n")
    );

    const result = runScanner(rootDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[PASS]");
  });

  it("fails when DATABASE_URL points at a different Supabase project", () => {
    const rootDir = makeTempRoot();
    writeFileSync(
      path.join(rootDir, ".env.production"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://gswjpmgxidofwmjngavh.supabase.co",
        "DATABASE_URL=postgresql://postgres:secret@db.cvkdmbgujgcfuqtqgtxv.supabase.co:5432/postgres",
        "",
      ].join("\n")
    );

    const result = runScanner(rootDir, ["--allow-prod-variants"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("conflicting Supabase URL project refs");
    expect(result.stderr).not.toContain("postgresql://");
    expect(result.stderr).not.toContain("secret");
  });
});
