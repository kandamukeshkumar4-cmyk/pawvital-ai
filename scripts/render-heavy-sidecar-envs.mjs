import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const rootDir = process.cwd();

for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
  const fullPath = path.join(rootDir, relativePath);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const services = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "src", "lib", "sidecar-service-registry.json"),
    "utf8"
  )
);

const args = process.argv.slice(2);

function readArg(flag) {
  const directIndex = args.indexOf(flag);
  if (directIndex >= 0) {
    return args[directIndex + 1] || "";
  }

  const prefixed = args.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : "";
}

function getBaseDomain() {
  return (
    readArg("--base-domain") ||
    process.env.SIDECAR_BASE_DOMAIN ||
    process.env.HEAVY_SIDECAR_BASE_DOMAIN ||
    ""
  ).trim();
}

function getScheme() {
  return (
    readArg("--scheme") ||
    process.env.SIDECAR_PUBLIC_SCHEME ||
    process.env.HEAVY_SIDECAR_PUBLIC_SCHEME ||
    "https"
  )
    .trim()
    .toLowerCase();
}

function getBaseUrl() {
  return (
    readArg("--base-url") ||
    process.env.SIDECAR_BASE_URL ||
    process.env.HEAVY_SIDECAR_BASE_URL ||
    ""
  ).trim();
}

function getMode() {
  return (
    readArg("--mode") ||
    process.env.SIDECAR_HOST_MODE ||
    process.env.HEAVY_SIDECAR_HOST_MODE ||
    "subdomain"
  )
    .trim()
    .toLowerCase();
}

function statusLine(level, message) {
  const prefix =
    level === "ok" ? "[OK]" : level === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function slugForService(serviceName) {
  return serviceName.replace(/-service$/, "");
}

function validateMode(mode) {
  if (!["subdomain", "single-host"].includes(mode)) {
    throw new Error(
      `Unsupported mode "${mode}". Use "subdomain" or "single-host".`
    );
  }
}

function buildUrl(service, { mode, scheme, baseDomain, baseUrl }) {
  if (mode === "subdomain") {
    return `${scheme}://${slugForService(service.name)}.${baseDomain}${service.expectedPath}`;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}${service.expectedPath}`;
}

function main() {
  const mode = getMode();
  validateMode(mode);

  const scheme = getScheme();
  if (!["http", "https"].includes(scheme)) {
    throw new Error(`Unsupported scheme "${scheme}". Use http or https.`);
  }

  const baseDomain = getBaseDomain();
  const baseUrl = getBaseUrl();

  if (mode === "subdomain" && !baseDomain) {
    throw new Error(
      "Missing --base-domain (or SIDECAR_BASE_DOMAIN / HEAVY_SIDECAR_BASE_DOMAIN) for subdomain mode."
    );
  }

  if (mode === "single-host" && !baseUrl) {
    throw new Error(
      "Missing --base-url (or SIDECAR_BASE_URL / HEAVY_SIDECAR_BASE_URL) for single-host mode."
    );
  }

  const rendered = [];
  for (const service of services) {
    rendered.push({
      env: service.env,
      value: buildUrl(service, { mode, scheme, baseDomain, baseUrl }),
      service: service.name,
    });
  }

  statusLine(
    "ok",
    `Rendered ${rendered.length} sidecar app URLs using ${mode} mode`
  );
  if (mode === "subdomain") {
    statusLine("ok", `Base domain: ${baseDomain}`);
  } else {
    statusLine("ok", `Base URL: ${baseUrl}`);
  }

  console.log("");
  console.log("# Copy these into .env.local or .env.sidecars");
  for (const item of rendered) {
    console.log(`${item.env}=${item.value}`);
  }
}

try {
  main();
} catch (error) {
  statusLine(
    "fail",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
