#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import { AppConfigurationClient } from "@azure/app-configuration";
import { ClientSecretCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const ENV_FILE = process.argv[2] || ".env.vercel.production.local";
const REQUIRED_ENV = [
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_KEY_VAULT_NAME",
];
const DIRECT_SECRET_ENV = {
  appConfigConnectionString: "AZURE_SECRET_APPCONFIG_CONNECTION_STRING",
  mapsKey: "AZURE_SECRET_MAPS_KEY",
};

function parseEnvFile(path) {
  const values = new Map();
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function normalizeVaultName(rawValue) {
  if (!rawValue.startsWith("http://") && !rawValue.startsWith("https://")) {
    return rawValue.replace(/\/+$/, "");
  }

  try {
    return new URL(rawValue).hostname.replace(/\.vault\.azure\.net$/i, "");
  } catch {
    return rawValue.replace(/\/+$/, "");
  }
}

async function main() {
  console.log(`Checking Azure runtime env from ${ENV_FILE}`);
  console.log("Secret values are not printed.\n");

  const env = parseEnvFile(ENV_FILE);

  let appConfigConnectionString = env.get(
    DIRECT_SECRET_ENV.appConfigConnectionString,
  );
  const directMapsKey = env.get(DIRECT_SECRET_ENV.mapsKey);
  if (appConfigConnectionString?.trim() && directMapsKey?.trim()) {
    console.log("[PASS] Direct AZURE_SECRET_* fallback values present");
  } else {
    const missing = REQUIRED_ENV.filter((name) => !env.get(name));
    if (missing.length > 0) {
      throw new Error(`missing required env vars: ${missing.join(", ")}`);
    }

    const keyVaultName = normalizeVaultName(env.get("AZURE_KEY_VAULT_NAME"));
    const credential = new ClientSecretCredential(
      env.get("AZURE_TENANT_ID"),
      env.get("AZURE_CLIENT_ID"),
      env.get("AZURE_CLIENT_SECRET"),
    );
    const secretClient = new SecretClient(
      `https://${keyVaultName}.vault.azure.net`,
      credential,
    );

    const [appConfigSecret, mapsKeySecret] = await Promise.all([
      secretClient.getSecret("appconfig-connection-string"),
      secretClient.getSecret("maps-key"),
    ]);

    if (!appConfigSecret.value?.trim()) {
      throw new Error("appconfig-connection-string secret is empty or unreadable");
    }
    if (!mapsKeySecret.value?.trim()) {
      throw new Error("maps-key secret is empty or unreadable");
    }
    appConfigConnectionString = appConfigSecret.value;
    console.log("[PASS] Key Vault secrets readable");
  }

  const appConfig = new AppConfigurationClient(appConfigConnectionString);
  const mapsFlag = await appConfig.getConfigurationSetting({
    key: ".appconfig.featureflag/azure.maps.enabled",
  });
  const parsed = JSON.parse(mapsFlag.value || "{}");
  if (parsed.enabled !== true) {
    throw new Error("azure.maps.enabled is not enabled in App Configuration");
  }
  console.log("[PASS] App Configuration azure.maps.enabled is on");
  console.log("\nVercel Azure runtime env is internally valid.");
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
