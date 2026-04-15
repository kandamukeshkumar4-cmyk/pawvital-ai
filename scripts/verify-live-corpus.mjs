import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const corpusImagesDir = path.join(rootDir, "corpus", "images");
const registryPath = path.join(rootDir, "src", "lib", "live-corpus-registry.json");
const qualityManifestPath = path.join(
  rootDir,
  "data",
  "corpus",
  "csv-ingestion-round2.json"
);

loadEnvFiles();

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  "";

const registry = readJson(registryPath, []);
const qualityManifest = readJson(qualityManifestPath, {
  minimumLiveTrustLevel: 60,
  sources: [],
});
const minimumLiveTrustLevel =
  Number.isFinite(Number(qualityManifest.minimumLiveTrustLevel))
    ? Number(qualityManifest.minimumLiveTrustLevel)
    : 60;

function loadEnvFiles() {
  for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function statusLine(level, message) {
  const prefix =
    level === "ok"
      ? "[OK]"
      : level === "warn"
        ? "[WARN]"
        : level === "info"
          ? "[INFO]"
          : "[FAIL]";
  console.log(`${prefix} ${message}`);
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeStringArray(values, fallback = []) {
  const list = Array.isArray(values) ? values : fallback;
  return list.map((value) => String(value || "").trim()).filter(Boolean);
}

function normalizeNumericMetric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";
}

function countFiles(dirPath) {
  let count = 0;
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        count += 1;
      }
    }
  }

  return count;
}

function findMatches(directoryEntries, hints) {
  const normalizedHints = hints.map((hint) => normalizeSlug(hint));
  return directoryEntries.filter((entry) => {
    const normalizedEntry = normalizeSlug(entry.name);
    return normalizedHints.some(
      (hint) =>
        normalizedEntry === hint ||
        normalizedEntry.includes(hint) ||
        hint.includes(normalizedEntry)
    );
  });
}

function resolveDataDirCandidates() {
  const configured = normalizeStringArray(qualityManifest.defaultDataDirCandidates).map(
    (entry) =>
      path.isAbsolute(entry) ? entry : path.resolve(rootDir, entry)
  );

  return [
    ...new Set([
      ...configured,
      path.join(rootDir, "data", "corpus", "csv"),
      path.join(rootDir, "data", "corpus"),
      path.join(rootDir, "corpus", "data"),
      path.join(rootDir, "corpus"),
    ]),
  ];
}

function resolveSourceFile(fileCandidates) {
  const dataDirCandidates = resolveDataDirCandidates();
  for (const fileCandidate of normalizeStringArray(fileCandidates)) {
    const directPath = path.isAbsolute(fileCandidate)
      ? fileCandidate
      : path.resolve(rootDir, fileCandidate);
    if (fs.existsSync(directPath)) return directPath;

    for (const dataDir of dataDirCandidates) {
      const candidatePath = path.join(dataDir, fileCandidate);
      if (fs.existsSync(candidatePath)) return candidatePath;
    }
  }

  return null;
}

function verifyQualityManifest() {
  let failures = 0;
  let warnings = 0;

  if (!Array.isArray(qualityManifest.sources) || qualityManifest.sources.length === 0) {
    statusLine("warn", "No round-2 corpus quality manifest entries found");
    return { failures: 0, warnings: 1 };
  }

  statusLine(
    "info",
    `Round-2 corpus quality audit loaded (${qualityManifest.sources.length} source(s), live floor=${minimumLiveTrustLevel})`
  );

  for (const source of qualityManifest.sources) {
    const trustLevel = Number(source.trustLevel);
    const liveEligible = trustLevel >= minimumLiveTrustLevel;
    const filePath = resolveSourceFile(source.fileCandidates || source.files);
    const accuracyRate = normalizeNumericMetric(source.qualityMetrics?.accuracyRate);
    const duplicateRate = normalizeNumericMetric(source.qualityMetrics?.duplicateRate);
    const labelConsistency = normalizeNumericMetric(
      source.qualityMetrics?.labelConsistency
    );
    const message = [
      `${source.slug}`,
      `trust=${Number.isFinite(trustLevel) ? trustLevel : "n/a"}`,
      `tier=${source.qualityTier || "unrated"}`,
      `accuracy=${formatPercent(accuracyRate)}`,
      `duplicates=${formatPercent(duplicateRate)}`,
      `labels=${formatPercent(labelConsistency)}`,
      `live=${liveEligible ? "yes" : "no"}`,
      `file=${filePath ? path.relative(rootDir, filePath) : "missing"}`,
    ].join(" | ");

    if (liveEligible && duplicateRate !== null && duplicateRate >= 0.2) {
      failures += 1;
      statusLine("fail", `${message} | duplicate rate exceeds live tolerance`);
      continue;
    }

    if (
      liveEligible &&
      labelConsistency !== null &&
      labelConsistency < 0.7
    ) {
      failures += 1;
      statusLine("fail", `${message} | label consistency below live tolerance`);
      continue;
    }

    if (
      normalizeText(source.ingestionStatus) === "flagged for removal" &&
      liveEligible
    ) {
      failures += 1;
      statusLine("fail", `${message} | flagged-for-removal source still clears live floor`);
      continue;
    }

    if (normalizeText(source.ingestionStatus) === "ingestion ready" && !filePath) {
      warnings += 1;
      statusLine("warn", `${message} | ingestion-ready source is waiting on a staged local CSV`);
      continue;
    }

    if (!filePath && normalizeText(source.ingestionStatus) === "active") {
      warnings += 1;
      statusLine("warn", `${message} | source file is not present in this repo snapshot`);
      continue;
    }

    statusLine("ok", message);
  }

  return { failures, warnings };
}

function verifyRegistryTrust() {
  let failures = 0;
  let warnings = 0;

  for (const policy of Array.isArray(registry) ? registry : []) {
    const trustLevel = Number(policy.trustLevel);
    if (policy.status === "live" && (!Number.isFinite(trustLevel) || trustLevel < minimumLiveTrustLevel)) {
      failures += 1;
      statusLine(
        "fail",
        `Live image policy ${policy.slug} has trust ${Number.isFinite(trustLevel) ? trustLevel : "n/a"} below the live floor ${minimumLiveTrustLevel}`
      );
      continue;
    }

    if (policy.status !== "live" && Number.isFinite(trustLevel) && trustLevel >= minimumLiveTrustLevel) {
      warnings += 1;
      statusLine(
        "warn",
        `Non-live image policy ${policy.slug} carries trust ${trustLevel}; activate only after assets are verified`
      );
      continue;
    }

    statusLine(
      "ok",
      `Image policy ${policy.slug} | status=${policy.status} | trust=${Number.isFinite(trustLevel) ? trustLevel : "n/a"}`
    );
  }

  return { failures, warnings };
}

function verifyLocalImageDirectories() {
  if (!fs.existsSync(corpusImagesDir)) {
    statusLine(
      "info",
      `No local corpus image directory at ${corpusImagesDir}; skipping on-disk image verification in this repo snapshot`
    );
    return { failures: 0, warnings: 0 };
  }

  const directoryEntries = fs
    .readdirSync(corpusImagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  const matchedDirectories = new Set();
  let failures = 0;
  let warnings = 0;

  for (const policy of registry) {
    const hints = policy.directoryHints?.length ? policy.directoryHints : [policy.slug];
    const matches = findMatches(directoryEntries, hints);

    if (matches.length === 0) {
      if (policy.status === "live") {
        failures += 1;
        statusLine(
          "fail",
          `${policy.slug} has no matching corpus directory (hints: ${hints.join(", ")})`
        );
      } else {
        statusLine(
          "info",
          `${policy.slug} is ${policy.status} and has no active corpus directory yet`
        );
      }
      continue;
    }

    let totalFiles = 0;
    for (const match of matches) {
      matchedDirectories.add(match.name);
      totalFiles += countFiles(path.join(corpusImagesDir, match.name));
    }

    if (totalFiles <= 0) {
      if (policy.status === "live") {
        warnings += 1;
        statusLine(
          "warn",
          `${policy.slug} matched ${matches.map((entry) => entry.name).join(", ")} but no files were found`
        );
      } else {
        statusLine(
          "info",
          `${policy.slug} is ${policy.status} and currently excluded from live activation until assets are populated`
        );
      }
      continue;
    }

    statusLine(
      "ok",
      `${policy.slug} -> ${matches
        .map((entry) => entry.name)
        .join(", ")} (${totalFiles} file(s), domains=${policy.supportedDomains.join(",")})`
    );
  }

  const unmatchedDirectories = directoryEntries
    .map((entry) => entry.name)
    .filter((name) => !matchedDirectories.has(name));

  for (const unmatched of unmatchedDirectories) {
    warnings += 1;
    statusLine(
      "warn",
      `Corpus directory ${unmatched} is not currently mapped into the live corpus registry`
    );
  }

  return { failures, warnings };
}

function isSupabaseConfigured() {
  return (
    (SUPABASE_URL.startsWith("http://") || SUPABASE_URL.startsWith("https://")) &&
    Boolean(SUPABASE_KEY)
  );
}

async function verifySupabaseTrustLevels() {
  if (!isSupabaseConfigured() || !Array.isArray(qualityManifest.sources)) {
    statusLine("info", "Supabase trust verification skipped (no credentials configured)");
    return { failures: 0, warnings: 0 };
  }

  const slugs = qualityManifest.sources.map((source) => source.slug).filter(Boolean);
  if (slugs.length === 0) {
    return { failures: 0, warnings: 0 };
  }

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/knowledge_sources`);
  url.searchParams.set("select", "slug,trust_level,active,metadata");
  url.searchParams.set("slug", `in.(${slugs.join(",")})`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
  });

  const rawText = await response.text();
  const rows = rawText ? JSON.parse(rawText) : [];
  if (!response.ok) {
    throw new Error(`Supabase trust verification failed: ${response.status} ${rawText}`);
  }

  let failures = 0;
  let warnings = 0;
  const rowsBySlug = new Map(rows.map((row) => [row.slug, row]));

  for (const source of qualityManifest.sources) {
    const row = rowsBySlug.get(source.slug);
    if (!row) {
      warnings += 1;
      statusLine("warn", `Supabase has no knowledge_sources row for ${source.slug}`);
      continue;
    }

    if (Number(row.trust_level) !== Number(source.trustLevel)) {
      failures += 1;
      statusLine(
        "fail",
        `Supabase trust mismatch for ${source.slug}: db=${row.trust_level}, manifest=${source.trustLevel}`
      );
      continue;
    }

    statusLine(
      "ok",
      `Supabase trust synced for ${source.slug} (${row.trust_level})`
    );
  }

  return { failures, warnings };
}

async function main() {
  const manifestResults = verifyQualityManifest();
  const registryResults = verifyRegistryTrust();
  const imageResults = verifyLocalImageDirectories();
  const supabaseResults = await verifySupabaseTrustLevels();

  const failures =
    manifestResults.failures +
    registryResults.failures +
    imageResults.failures +
    supabaseResults.failures;
  const warnings =
    manifestResults.warnings +
    registryResults.warnings +
    imageResults.warnings +
    supabaseResults.warnings;

  console.log("");
  console.log(
    `Live corpus verification summary: ${failures} failure(s), ${warnings} warning(s), ${Array.isArray(registry) ? registry.length : 0} image policy source(s), ${Array.isArray(qualityManifest.sources) ? qualityManifest.sources.length : 0} audited text source(s)`
  );

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
