#!/usr/bin/env node
/**
 * C3 cutover smoke checklist — verifies platform adapters and env guards.
 */
import { spawnSync } from "node:child_process";

function run(label, command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`${label} failed`);
    process.exit(result.status ?? 1);
  }
  console.log(`${label} passed`);
}

run("Supabase env guard", "npm", ["run", "check:supabase-env"]);
run("Azure Vercel env", "npm", ["run", "check:azure:vercel-env"]);
run("Key Vault env template", "npm", ["run", "check:keyvault-env-template"]);

console.log("Azure cutover smoke checklist complete.");
