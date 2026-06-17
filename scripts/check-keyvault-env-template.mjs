#!/usr/bin/env node
/**
 * Documents Key Vault secret names ↔ local AZURE_SECRET_* env vars.
 * Does not read secret values — safe to run in CI.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const azureIndex = readFileSync(
  join(root, "src/lib/azure/index.ts"),
  "utf8"
);

const secretNames = [...azureIndex.matchAll(/(\w+):\s*"([^"]+)"/g)]
  .filter((match) => match[1].endsWith("Key") || match[1].includes("Endpoint") || match[1].includes("ConnectionString") || match[1].includes("Region"))
  .map((match) => match[2]);

const envVars = [
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_KEY_VAULT_NAME",
  "NVIDIA_API_KEY",
  ...secretNames.map(
    (name) =>
      `AZURE_SECRET_${name.replace(/-/g, "_").toUpperCase()}`
  ),
];

console.log("Key Vault / Vercel env checklist (names only):\n");
for (const name of envVars) {
  const set = Boolean(process.env[name]?.trim());
  console.log(`${set ? "[set]" : "[ ]"} ${name}`);
}

console.log("\nKey Vault secret names (store in vault, not in chat):");
for (const name of secretNames) {
  console.log(`  - ${name}`);
}
