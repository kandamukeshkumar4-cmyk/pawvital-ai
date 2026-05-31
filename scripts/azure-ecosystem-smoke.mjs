#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { BlobServiceClient } from "@azure/storage-blob";
import { ServiceBusClient } from "@azure/service-bus";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

const RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP || "pawvital-rg";
const KEY_VAULT_NAME = process.env.AZURE_KEY_VAULT_NAME || "pawvital-kv-nil7y8";
const APP_CONFIG_NAME =
  process.env.AZURE_APP_CONFIG_NAME || "pawvital-appconfig-nil7y8";
const APP_INSIGHTS_NAME =
  process.env.AZURE_APP_INSIGHTS_NAME || "pawvital-appinsights";
const STATIC_WEB_APP = process.env.AZURE_STATIC_WEB_APP || "pawvital-swa";
const SERVICE_BUS_QUEUE = process.env.AZURE_SERVICE_BUS_QUEUE || "async-review";
const WEB_PUBSUB_HUB =
  process.env.AZURE_WEBPUBSUB_HUB || "pawvital_triage";
const PRODUCTION_APP_URL =
  process.env.PAWVITAL_PRODUCTION_URL || "https://pawvital-ai.vercel.app";
const CHECK_TIMEOUT_MS = Number.parseInt(
  process.env.AZURE_SMOKE_CHECK_TIMEOUT_MS || "60000",
  10,
);

const REQUIRED_SECRETS = [
  "appconfig-connection-string",
  "appinsights-connection-string",
  "azure-storage-connection-string",
  "contentsafety-endpoint",
  "contentsafety-key",
  "docintel-endpoint",
  "docintel-key",
  "maps-key",
  "servicebus-connection-string",
  "speech-endpoint",
  "speech-key",
  "speech-region",
  "translator-endpoint",
  "translator-key",
  "translator-region",
  "webpubsub-connection-string",
];

const REQUIRED_FLAGS = [
  "azure.async-review.enabled",
  "azure.docintel.enabled",
  "azure.maps.enabled",
  "azure.speech.enabled",
  "azure.translator.enabled",
  "azure.webpubsub.enabled",
];

const REQUIRED_CONTAINERS = ["audio-corpus", "pet-media", "reports"];
const secretCache = new Map();
let azureCliPath = null;

function quoteShellArg(value) {
  const text = String(value);
  if (process.platform === "win32") {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function spawnAzureCli(candidate, args, timeoutMs) {
  const commandLine = [candidate, ...args].map(quoteShellArg).join(" ");
  return spawnSync(commandLine, {
    encoding: "utf8",
    shell: true,
    timeout: timeoutMs,
  });
}

function findAzureCli() {
  if (azureCliPath) {
    return azureCliPath;
  }

  const candidates = [
    process.env.AZURE_CLI_PATH,
    "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd",
    "az",
    "az.cmd",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnAzureCli(candidate, ["--version"], 30_000);
    if (result.status === 0) {
      azureCliPath = candidate;
      return azureCliPath;
    }
  }

  throw new Error("Azure CLI was not found. Install az or set AZURE_CLI_PATH.");
}

function runAz(args, options = {}) {
  const result = spawnAzureCli(
    findAzureCli(),
    args,
    options.timeoutMs ?? 60_000,
  );

  if (result.status !== 0) {
    const message = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
    throw new Error(message || `az exited with ${result.status}`);
  }

  const output = result.stdout.trim();
  if (!options.json) {
    return output;
  }

  try {
    return output ? JSON.parse(output) : null;
  } catch (error) {
    throw new Error(
      `az returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function fetchText(url, init = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson(url, init = {}, timeoutMs = 20_000) {
  const text = await fetchText(url, init, timeoutMs);
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(
      `service returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function checkClockSkew() {
  const response = await fetch("https://www.microsoft.com", {
    cache: "no-store",
    method: "HEAD",
  });
  const serverDateHeader = response.headers.get("date");
  const serverDate = serverDateHeader ? new Date(serverDateHeader) : null;
  if (!serverDate || Number.isNaN(serverDate.getTime())) {
    throw new Error("could not read server Date header");
  }

  const skewMs = Math.abs(Date.now() - serverDate.getTime());
  const skewMinutes = Math.round(skewMs / 60_000);
  if (skewMs > 10 * 60_000) {
    throw new Error(
      `local clock differs from Microsoft server time by about ${skewMinutes} minutes; sync Windows time before running Azure shared-key checks`,
    );
  }

  return `clock skew about ${skewMinutes} minute(s)`;
}

async function getSecret(name) {
  if (secretCache.has(name)) {
    return secretCache.get(name);
  }

  const value = runAz([
    "keyvault",
    "secret",
    "show",
    "--vault-name",
    KEY_VAULT_NAME,
    "--name",
    name,
    "--query",
    "value",
    "-o",
    "tsv",
  ]);

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Key Vault secret '${name}' is empty`);
  }
  secretCache.set(name, trimmed);
  return trimmed;
}

function buildUrl(endpoint, path) {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

function timeoutError(label) {
  const error = new Error(
    `${label} did not finish within ${CHECK_TIMEOUT_MS}ms`,
  );
  error.name = "TimeoutError";
  return error;
}

async function withTimeout(label, promise) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(timeoutError(label)), CHECK_TIMEOUT_MS);
        timeoutId.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkAzureAccount() {
  const account = runAz(["account", "show", "-o", "json"], { json: true });
  if (!account?.id || !account?.name) {
    throw new Error("az account show did not return an active subscription");
  }
  return `${account.name}`;
}

async function checkResourceInventory() {
  const resources = runAz(["resource", "list", "-g", RESOURCE_GROUP, "-o", "json"], {
    json: true,
  });
  if (!Array.isArray(resources) || resources.length < 15) {
    throw new Error(`expected Azure resources in ${RESOURCE_GROUP}`);
  }
  return `${resources.length} resources`;
}

async function checkKeyVaultSecrets() {
  const secrets = runAz(
    ["keyvault", "secret", "list", "--vault-name", KEY_VAULT_NAME, "-o", "json"],
    { json: true },
  );
  const names = new Set(
    Array.isArray(secrets) ? secrets.map((secret) => secret.name) : [],
  );
  const missing = REQUIRED_SECRETS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`missing Key Vault secrets: ${missing.join(", ")}`);
  }
  return `${REQUIRED_SECRETS.length} required secrets`;
}

async function checkAppInsights() {
  const connectionString = runAz([
    "resource",
    "show",
    "-g",
    RESOURCE_GROUP,
    "-n",
    APP_INSIGHTS_NAME,
    "--resource-type",
    "Microsoft.Insights/components",
    "--query",
    "properties.ConnectionString",
    "-o",
    "tsv",
  ]);
  if (!connectionString.includes("InstrumentationKey=")) {
    throw new Error("Application Insights connection string was not returned");
  }
  return "connection string available";
}

async function checkAppConfigFlags() {
  const flags = runAz(
    ["appconfig", "feature", "list", "--name", APP_CONFIG_NAME, "-o", "json"],
    { json: true },
  );
  const byName = new Map(
    Array.isArray(flags) ? flags.map((flag) => [flag.name, flag.state]) : [],
  );
  const missing = REQUIRED_FLAGS.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`missing App Configuration flags: ${missing.join(", ")}`);
  }
  const states = REQUIRED_FLAGS.map((name) => `${name}=${byName.get(name)}`);
  return states.join(", ");
}

async function checkStaticWebApp() {
  const swa = runAz(
    [
      "staticwebapp",
      "show",
      "-g",
      RESOURCE_GROUP,
      "-n",
      STATIC_WEB_APP,
      "-o",
      "json",
    ],
    { json: true },
  );
  if (!swa?.defaultHostname) {
    throw new Error("Static Web App default hostname was not returned");
  }
  return swa.repositoryUrl
    ? `linked to ${swa.repositoryUrl}`
    : `resource ready, GitHub repo not linked (${swa.defaultHostname})`;
}

async function checkStorage() {
  const connectionString = await getSecret("azure-storage-connection-string");
  const client = BlobServiceClient.fromConnectionString(connectionString);
  const containers = [];
  for await (const container of client.listContainers()) {
    containers.push(container.name);
  }

  const missing = REQUIRED_CONTAINERS.filter(
    (container) => !containers.includes(container),
  );
  if (missing.length > 0) {
    throw new Error(`missing Blob containers: ${missing.join(", ")}`);
  }

  const blobName = `smoke/azure-ecosystem-${randomUUID()}.txt`;
  const blob = client
    .getContainerClient("reports")
    .getBlockBlobClient(blobName);
  await blob.uploadData(Buffer.from("pawvital azure smoke\n", "utf8"), {
    blobHTTPHeaders: { blobContentType: "text/plain" },
  });
  try {
    const downloaded = await blob.downloadToBuffer();
    if (!downloaded.toString("utf8").includes("pawvital azure smoke")) {
      throw new Error("Blob round-trip content mismatch");
    }
  } finally {
    await blob.deleteIfExists();
  }

  return `${REQUIRED_CONTAINERS.join(", ")} plus upload/download/delete`;
}

async function checkTranslator() {
  const [endpoint, key, region] = await Promise.all([
    getSecret("translator-endpoint"),
    getSecret("translator-key"),
    getSecret("translator-region"),
  ]);
  const url = new URL(buildUrl(endpoint, "/translate"));
  url.searchParams.set("api-version", "3.0");
  url.searchParams.set("to", "en");

  const payload = await fetchJson(url, {
    body: JSON.stringify([{ Text: "hola" }]),
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
      "Ocp-Apim-Subscription-Region": region,
      "X-ClientTraceId": `pawvital-smoke-${randomUUID()}`,
    },
    method: "POST",
  });
  const translated = payload?.[0]?.translations?.[0]?.text;
  if (typeof translated !== "string" || !/hello/i.test(translated)) {
    throw new Error("Translator did not translate hola to English");
  }
  return "hola -> hello";
}

async function checkSpeechToken() {
  const [key, region] = await Promise.all([
    getSecret("speech-key"),
    getSecret("speech-region"),
  ]);
  const token = await fetchText(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
    {
      headers: { "Ocp-Apim-Subscription-Key": key },
      method: "POST",
    },
  );
  if (token.length < 40) {
    throw new Error("Speech token endpoint returned an unexpectedly short token");
  }
  return "authorization token issued";
}

async function checkDocumentIntelligence() {
  const [endpoint, key] = await Promise.all([
    getSecret("docintel-endpoint"),
    getSecret("docintel-key"),
  ]);
  const url = new URL(buildUrl(endpoint, "/documentintelligence/documentModels"));
  url.searchParams.set("api-version", "2024-11-30");
  const payload = await fetchJson(url, {
    headers: { "Ocp-Apim-Subscription-Key": key },
    method: "GET",
  });
  if (!Array.isArray(payload?.value)) {
    throw new Error("Document Intelligence models list was not returned");
  }
  return `${payload.value.length} models visible`;
}

async function checkContentSafety() {
  const [endpoint, key] = await Promise.all([
    getSecret("contentsafety-endpoint"),
    getSecret("contentsafety-key"),
  ]);
  const url = new URL(buildUrl(endpoint, "/contentsafety/text:analyze"));
  url.searchParams.set("api-version", "2024-09-01");
  const payload = await fetchJson(url, {
    body: JSON.stringify({
      categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
      outputType: "EightSeverityLevels",
      text: "PawVital Azure smoke test checks a harmless veterinary note.",
    }),
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },
    method: "POST",
  });
  if (!Array.isArray(payload?.categoriesAnalysis)) {
    throw new Error("Content Safety categoriesAnalysis was not returned");
  }
  return `${payload.categoriesAnalysis.length} categories analyzed`;
}

async function checkMaps() {
  const key = await getSecret("maps-key");
  const url = new URL("https://atlas.microsoft.com/search/address/json");
  url.searchParams.set("api-version", "1.0");
  url.searchParams.set("limit", "1");
  url.searchParams.set("query", "emergency veterinary hospital Kent OH");
  url.searchParams.set("subscription-key", key);
  const payload = await fetchJson(url, { method: "GET" });
  if (!Array.isArray(payload?.results)) {
    throw new Error("Azure Maps search results were not returned");
  }
  return `${payload.results.length} search result(s)`;
}

async function checkProductionAppRuntime() {
  const payload = await fetchJson(
    buildUrl(PRODUCTION_APP_URL, "/api/azure/maps/nearest-vets"),
    {
      body: JSON.stringify({
        latitude: 41.1537,
        longitude: -81.3579,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    30_000,
  );

  if (payload?.enabled !== true) {
    throw new Error(
      `production app returned enabled=${String(payload?.enabled)} reason=${
        payload?.reason ?? "unknown"
      }`,
    );
  }

  if (!Array.isArray(payload.clinics)) {
    throw new Error("production app did not return a clinics array");
  }

  return `${payload.clinics.length} clinic(s) through ${PRODUCTION_APP_URL}`;
}

async function checkWebPubSub() {
  const connectionString = await getSecret("webpubsub-connection-string");
  const client = new WebPubSubServiceClient(connectionString, WEB_PUBSUB_HUB);
  const token = await client.getClientAccessToken({
    expirationTimeInMinutes: 5,
    userId: `azure-smoke-${randomUUID()}`,
  });
  if (!token?.url || !/^wss:\/\//i.test(token.url)) {
    throw new Error("Web PubSub did not issue a websocket URL");
  }
  return "client access token issued";
}

async function checkServiceBus() {
  const connectionString = await getSecret("servicebus-connection-string");
  const client = new ServiceBusClient(connectionString);
  const sender = client.createSender(SERVICE_BUS_QUEUE);
  const receiver = client.createReceiver(SERVICE_BUS_QUEUE, {
    receiveMode: "peekLock",
  });
  const messageId = `azure-smoke-${randomUUID()}`;
  try {
    await sender.sendMessages({
      applicationProperties: { jobType: "shadow-telemetry" },
      body: {
        source: "azure-ecosystem-smoke",
        smokeId: messageId,
      },
      contentType: "application/json",
      messageId,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const messages = await receiver.receiveMessages(5, {
        maxWaitTimeInMs: 5_000,
      });
      for (const message of messages) {
        if (message.messageId === messageId) {
          await receiver.completeMessage(message);
          return "send/receive/complete";
        }
        await receiver.abandonMessage(message);
      }
    }
    throw new Error("sent smoke message was not received");
  } finally {
    await sender.close().catch(() => undefined);
    await receiver.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

async function runCheck(label, fn) {
  console.log(`[RUN]  ${label}`);
  try {
    const details = await withTimeout(label, fn());
    console.log(`[PASS] ${label}${details ? ` - ${details}` : ""}`);
    return true;
  } catch (error) {
    console.log(
      `[FAIL] ${label} - ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

async function main() {
  console.log("PawVital Azure ecosystem smoke");
  console.log(`Resource group: ${RESOURCE_GROUP}`);
  console.log(`Key Vault: ${KEY_VAULT_NAME}`);
  console.log("Secrets are read but never printed.\n");

  const checks = [
    ["Azure account", checkAzureAccount],
    ["Local clock skew", checkClockSkew],
    ["Resource inventory", checkResourceInventory],
    ["Key Vault secrets", checkKeyVaultSecrets],
    ["Application Insights", checkAppInsights],
    ["App Configuration flags", checkAppConfigFlags],
    ["Static Web App", checkStaticWebApp],
    ["Blob Storage", checkStorage],
    ["Translator", checkTranslator],
    ["Speech token", checkSpeechToken],
    ["Document Intelligence", checkDocumentIntelligence],
    ["Content Safety", checkContentSafety],
    ["Azure Maps", checkMaps],
    ["Production app Azure runtime", checkProductionAppRuntime],
    ["Web PubSub", checkWebPubSub],
    ["Service Bus", checkServiceBus],
  ];

  let passed = 0;
  for (const [label, fn] of checks) {
    if (await runCheck(label, fn)) {
      passed += 1;
    }
  }

  console.log(`\n${passed}/${checks.length} checks passed.`);
  if (passed !== checks.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
