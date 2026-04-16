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
const breedExpansionProfilePath = path.join(
  rootDir,
  "data",
  "corpus",
  "breed-expansion-profiles.json"
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
const breedExpansionProfileManifest = readJson(breedExpansionProfilePath, {
  breeds: [],
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

function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header.trim()] = (values[headerIndex] || "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
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

function normalizeTag(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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

function tokenize(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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
  const configured = normalizeStringArray(
    qualityManifest.defaultDataDirCandidates
  ).map((entry) =>
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

function getBreedSpecificSources() {
  if (!Array.isArray(qualityManifest.sources)) return [];
  return qualityManifest.sources.filter(
    (source) => source.processor === "breedSpecificClinicalCases"
  );
}

function loadBreedSpecificRows() {
  const rows = [];
  for (const source of getBreedSpecificSources()) {
    const filePath = resolveSourceFile(source.fileCandidates || source.files);
    if (!filePath) {
      rows.push({ __missingSource: source.slug });
      continue;
    }
    for (const row of parseCSV(fs.readFileSync(filePath, "utf8"))) {
      rows.push({ ...row, __filePath: filePath, __sourceSlug: source.slug });
    }
  }
  return rows;
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
    if (liveEligible && labelConsistency !== null && labelConsistency < 0.7) {
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
    if (
      policy.status === "live" &&
      (!Number.isFinite(trustLevel) || trustLevel < minimumLiveTrustLevel)
    ) {
      failures += 1;
      statusLine(
        "fail",
        `Live image policy ${policy.slug} has trust ${Number.isFinite(trustLevel) ? trustLevel : "n/a"} below the live floor ${minimumLiveTrustLevel}`
      );
      continue;
    }

    if (
      policy.status !== "live" &&
      Number.isFinite(trustLevel) &&
      trustLevel >= minimumLiveTrustLevel
    ) {
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

function verifyBreedExpansionManifest() {
  const profiles = Array.isArray(breedExpansionProfileManifest.breeds)
    ? breedExpansionProfileManifest.breeds
    : [];
  const rows = loadBreedSpecificRows();
  let failures = 0;
  let warnings = 0;

  if (profiles.length !== 10) {
    failures += 1;
    statusLine(
      "fail",
      `Breed expansion manifest should contain 10 breeds, found ${profiles.length}`
    );
  } else {
    statusLine("ok", `Breed expansion manifest covers ${profiles.length} breeds`);
  }

  const rowsByBreed = new Map();
  for (const row of rows) {
    if (row.__missingSource) {
      failures += 1;
      statusLine("fail", `Missing breed-specific source file for ${row.__missingSource}`);
      continue;
    }

    const breedId = normalizeTag(row.breed_id);
    const list = rowsByBreed.get(breedId) || [];
    list.push(row);
    rowsByBreed.set(breedId, list);
  }

  for (const profile of profiles) {
    const breedId = normalizeTag(profile.breedId);
    const breedRows = rowsByBreed.get(breedId) || [];
    const conditionSet = new Set(
      breedRows.map((row) => normalizeTag(row.condition_label))
    );

    if (breedRows.length !== 3) {
      failures += 1;
      statusLine(
        "fail",
        `${profile.name} should have 3 breed-specific rows, found ${breedRows.length}`
      );
      continue;
    }

    if (profile.topConditions.length !== 3) {
      failures += 1;
      statusLine("fail", `${profile.name} manifest should declare 3 top conditions`);
      continue;
    }

    for (const condition of profile.topConditions) {
      if (Number(condition.trustLevel) < 70) {
        failures += 1;
        statusLine(
          "fail",
          `${profile.name} condition ${condition.conditionLabel} drops below trust 70`
        );
      }
      if (!conditionSet.has(normalizeTag(condition.conditionLabel))) {
        failures += 1;
        statusLine(
          "fail",
          `${profile.name} is missing corpus row for ${condition.conditionLabel}`
        );
      }
    }

    const mixedBreedRow = breedRows.find((row) =>
      /[\/&,]|\bmix(?:ed)?\b|\bx\b/i.test(normalizeText(row.breed))
    );
    if (mixedBreedRow) {
      failures += 1;
      statusLine(
        "fail",
        `${profile.name} includes a mixed-breed row (${mixedBreedRow.record_id}) without disambiguation`
      );
      continue;
    }

    statusLine(
      "ok",
      `${profile.name} -> ${breedRows.length} rows, ${conditionSet.size} condition label(s)`
    );
  }

  if (rows.length < profiles.length * 3) {
    warnings += 1;
    statusLine(
      "warn",
      `Breed-specific corpus rows are sparse (${rows.length} rows for ${profiles.length} breeds)`
    );
  }

  return { failures, warnings, rows };
}

function scoreBreedSpecificRow(row, query, profileById) {
  const profile = profileById.get(normalizeTag(row.breed_id));
  const haystack = [
    row.breed,
    ...(profile?.aliases || []),
    row.condition_label,
    row.condition_name,
    row.domain,
    row.chief_complaint,
    row.signal_symptoms,
    row.clinical_summary,
  ]
    .map((value) => String(value || ""))
    .join(" ");
  const queryTokens = tokenize(query);
  const haystackTokens = new Set(tokenize(haystack));
  return queryTokens.reduce(
    (score, token) => (haystackTokens.has(token) ? score + 1 : score),
    0
  );
}

function verifyBreedSmokeQueries(rows) {
  const profiles = Array.isArray(breedExpansionProfileManifest.breeds)
    ? breedExpansionProfileManifest.breeds
    : [];
  const profileById = new Map(
    profiles.map((profile) => [normalizeTag(profile.breedId), profile])
  );
  let failures = 0;

  for (const profile of profiles) {
    const ranked = rows
      .filter((row) => !row.__missingSource)
      .map((row) => ({
        row,
        score: scoreBreedSpecificRow(row, profile.smokeQuery, profileById),
      }))
      .sort((a, b) => b.score - a.score);

    const topMatch = ranked[0];
    if (!topMatch || topMatch.score <= 0) {
      failures += 1;
      statusLine("fail", `${profile.name} smoke query returned no relevant local row`);
      continue;
    }

    if (normalizeTag(topMatch.row.breed_id) !== normalizeTag(profile.breedId)) {
      failures += 1;
      statusLine(
        "fail",
        `${profile.name} smoke query surfaced ${topMatch.row.breed} instead`
      );
      continue;
    }

    statusLine(
      "ok",
      `${profile.name} smoke query -> ${topMatch.row.condition_label} (${topMatch.row.record_id})`
    );
  }

  return { failures, warnings: 0 };
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

    statusLine("ok", `Supabase trust synced for ${source.slug} (${row.trust_level})`);
  }

  return { failures, warnings };
}

async function main() {
  const manifestResults = verifyQualityManifest();
  const registryResults = verifyRegistryTrust();
  const imageResults = verifyLocalImageDirectories();
  const breedManifestResults = verifyBreedExpansionManifest();
  const breedSmokeResults = verifyBreedSmokeQueries(breedManifestResults.rows);
  const supabaseResults = await verifySupabaseTrustLevels();

  const failures =
    manifestResults.failures +
    registryResults.failures +
    imageResults.failures +
    breedManifestResults.failures +
    breedSmokeResults.failures +
    supabaseResults.failures;
  const warnings =
    manifestResults.warnings +
    registryResults.warnings +
    imageResults.warnings +
    breedManifestResults.warnings +
    breedSmokeResults.warnings +
    supabaseResults.warnings;

  console.log("");
  console.log(
    `Live corpus verification summary: ${failures} failure(s), ${warnings} warning(s), ${Array.isArray(registry) ? registry.length : 0} image policy source(s), ${Array.isArray(qualityManifest.sources) ? qualityManifest.sources.length : 0} audited text source(s), ${Array.isArray(breedExpansionProfileManifest.breeds) ? breedExpansionProfileManifest.breeds.length : 0} breed profiles`
  );

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
