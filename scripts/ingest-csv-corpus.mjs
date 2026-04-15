#!/usr/bin/env node
/**
 * Ingest CSV clinical datasets into Supabase knowledge_chunks.
 *
 * Round 2 adds:
 * - trust-level overrides from an audited manifest
 * - ingestion-ready placeholders for higher-quality sources
 * - resumable source/batch checkpoints
 * - dedicated breed-specific clinical cases for the top 10 dog breeds
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const defaultQualityManifestPath = path.join(
  rootDir,
  "data",
  "corpus",
  "csv-ingestion-round2.json"
);
const defaultBreedProfilePath = path.join(
  rootDir,
  "data",
  "corpus",
  "breed-expansion-profiles.json"
);
const defaultCheckpointPath = path.join(
  rootDir,
  "tmp",
  "ingest-csv-corpus.checkpoint.json"
);
const defaultReportPath = path.join(
  rootDir,
  "tmp",
  "ingest-csv-corpus.round2-report.json"
);
const defaultDataDirCandidates = [
  path.join(rootDir, "data", "corpus", "csv"),
  path.join(rootDir, "data", "corpus"),
  path.join(rootDir, "corpus", "data"),
  path.join(rootDir, "corpus"),
];
const CAT_MARKER_PATTERN = /\b(cat|cats|feline|kitten|kittens)\b/i;
const MIXED_BREED_PATTERN = /[\/&,]|\bmix(?:ed)?\b|\bx\b/i;
const MINIMUM_BREED_RECORD_TRUST = 70;

loadEnvFiles();

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const BASE_SOURCE_CONFIGS = [
  {
    files: ["pet-health-symptoms-dataset.csv", "pet-health-symptoms.csv"],
    kind: "document",
    processor: "petHealthSymptoms",
    slug: "csv-pet-health-symptoms",
    sourceKnown: true,
    sourceType: "dataset",
    speciesScope: ["dog", "cat"],
    title: "Pet Health Symptoms Dataset (2K clinical notes)",
    trustLevel: 60,
  },
  {
    files: ["veterinary_clinical_data.csv", "veterinary-clinical-data.csv"],
    kind: "document",
    processor: "vetClinicalData",
    slug: "csv-veterinary-clinical-data",
    sourceKnown: true,
    sourceType: "dataset",
    speciesScope: ["dog", "cat"],
    title: "Veterinary Clinical Dataset (10K records)",
    trustLevel: 60,
  },
];

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

function parseArgs(argv) {
  return {
    batchSize: Number(readFlagValue(argv, "--batch-size") || 50),
    checkpointPath: resolveRootPath(
      readFlagValue(argv, "--checkpoint") || defaultCheckpointPath
    ),
    dataDir: readFlagValue(argv, "--data-dir"),
    dogOnly: argv.includes("--dog-only"),
    dryRun: argv.includes("--dry-run"),
    fileFilter: readFlagValue(argv, "--file"),
    qualityManifestPath: resolveRootPath(
      readFlagValue(argv, "--quality-manifest") || defaultQualityManifestPath
    ),
    reportPath: resolveRootPath(
      readFlagValue(argv, "--report") || defaultReportPath
    ),
    resetCheckpoint: argv.includes("--reset-checkpoint"),
    resume: argv.includes("--resume"),
    sourceFilter: readFlagValue(argv, "--source"),
  };
}

function readFlagValue(argv, flag) {
  const exactIndex = argv.indexOf(flag);
  if (exactIndex >= 0 && argv[exactIndex + 1]) {
    return argv[exactIndex + 1];
  }

  const prefixed = argv.find((entry) => entry.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : null;
}

function resolveRootPath(inputPath) {
  if (!inputPath) return "";
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(rootDir, inputPath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallbackValue) {
  if (!filePath || !fs.existsSync(filePath)) return fallbackValue;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function normalizeNumericMetric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") return null;
  return {
    accuracyRate: normalizeNumericMetric(metrics.accuracyRate),
    duplicateRate: normalizeNumericMetric(metrics.duplicateRate),
    labelConsistency: normalizeNumericMetric(metrics.labelConsistency),
  };
}

function normalizeStringArray(values, fallback = []) {
  const list = Array.isArray(values) ? values : fallback;
  return list.map((value) => String(value || "").trim()).filter(Boolean);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";
}

function loadQualityManifest(filePath) {
  const parsed = readJson(filePath, {
    auditRound: "baseline",
    defaultDataDirCandidates: [],
    minimumLiveTrustLevel: 60,
    sources: [],
  });

  return {
    auditRound: String(parsed.auditRound || "baseline"),
    defaultDataDirCandidates: normalizeStringArray(parsed.defaultDataDirCandidates),
    minimumLiveTrustLevel:
      Number.isFinite(Number(parsed.minimumLiveTrustLevel))
        ? Number(parsed.minimumLiveTrustLevel)
        : 60,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}

function loadBreedExpansionProfiles(filePath) {
  const resolvedPath = resolveRootPath(filePath || defaultBreedProfilePath);
  const parsed = readJson(resolvedPath, { breeds: [] });
  const breeds = Array.isArray(parsed.breeds) ? parsed.breeds : [];
  return breeds.map((profile) => ({
    ...profile,
    aliases: normalizeStringArray(profile.aliases),
    topConditions: Array.isArray(profile.topConditions)
      ? profile.topConditions.map((condition) => ({
          ...condition,
          conditionLabel: normalizeTag(condition.conditionLabel),
          domain: normalizeTag(condition.domain),
          trustLevel: Number(condition.trustLevel),
        }))
      : [],
  }));
}

function buildDatasetConfigs(qualityManifest) {
  const bySlug = new Map(
    BASE_SOURCE_CONFIGS.map((config) => [
      config.slug,
      {
        ...config,
        baselineTrustLevel: config.trustLevel,
        ingestionStatus: "active",
        profileManifest: "",
        qualityMetrics: null,
        qualityTier: "",
        trustLevelReason: "",
      },
    ])
  );

  for (const source of qualityManifest.sources) {
    const existing = bySlug.get(source.slug) || {
      baselineTrustLevel: null,
      files: [],
      kind: "document",
      processor: "vetClinicalData",
      profileManifest: "",
      sourceKnown: false,
      sourceType: "dataset",
      speciesScope: ["dog"],
      title: source.title || source.slug,
      trustLevel: 60,
    };

    bySlug.set(source.slug, {
      ...existing,
      ...source,
      files: normalizeStringArray(
        source.fileCandidates ?? source.files,
        existing.files
      ),
      baselineTrustLevel:
        Number.isFinite(Number(source.baselineTrustLevel))
          ? Number(source.baselineTrustLevel)
          : existing.baselineTrustLevel,
      profileManifest: String(source.profileManifest || existing.profileManifest || ""),
      qualityMetrics: normalizeMetrics(source.qualityMetrics ?? existing.qualityMetrics),
      qualityTier: String(source.qualityTier || existing.qualityTier || ""),
      sourceKnown:
        typeof source.sourceKnown === "boolean"
          ? source.sourceKnown
          : existing.sourceKnown,
      speciesScope: normalizeStringArray(source.speciesScope, existing.speciesScope),
      trustLevel:
        Number.isFinite(Number(source.trustLevel))
          ? Number(source.trustLevel)
          : existing.trustLevel,
      trustLevelReason: String(
        source.trustLevelReason || existing.trustLevelReason || ""
      ),
    });
  }

  return [...bySlug.values()];
}

function resolveDataDirCandidates(options, qualityManifest) {
  const configured = options.dataDir
    ? [resolveRootPath(options.dataDir)]
    : [
        ...qualityManifest.defaultDataDirCandidates.map((entry) =>
          resolveRootPath(entry)
        ),
        ...defaultDataDirCandidates,
      ];

  return [...new Set(configured.filter(Boolean))];
}

function resolveSourceFile(fileCandidates, dataDirCandidates) {
  for (const fileCandidate of fileCandidates) {
    const directPath = resolveRootPath(fileCandidate);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    for (const dataDir of dataDirCandidates) {
      const candidatePath = path.join(dataDir, fileCandidate);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function readCheckpoint(checkpointPath, auditRound) {
  const parsed = readJson(checkpointPath, null);
  if (!parsed || parsed.auditRound !== auditRound) {
    return {
      auditRound,
      completedSourceSlugs: [],
      currentBatchStart: 0,
      currentSourceSlug: null,
      report: [],
      sourceProgress: {},
    };
  }

  return {
    auditRound,
    completedSourceSlugs: normalizeStringArray(parsed.completedSourceSlugs),
    currentBatchStart: Number(parsed.currentBatchStart || 0),
    currentSourceSlug:
      typeof parsed.currentSourceSlug === "string"
        ? parsed.currentSourceSlug
        : null,
    report: Array.isArray(parsed.report) ? parsed.report : [],
    sourceProgress:
      parsed.sourceProgress && typeof parsed.sourceProgress === "object"
        ? parsed.sourceProgress
        : {},
  };
}

function writeCheckpoint(checkpointPath, checkpoint) {
  ensureDir(path.dirname(checkpointPath));
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function writeReport(reportPath, report) {
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function supportsDatabaseWrites(dryRun) {
  return dryRun || Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function supabaseRequest(endpoint, method, body) {
  const response = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${endpoint}`,
    {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer:
          method === "POST"
            ? "resolution=merge-duplicates,return=representation"
            : "return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${endpoint}: ${response.status} ${text}`);
  }

  return parsed;
}

async function fetchSourceRecord(slug) {
  const endpoint = `knowledge_sources?slug=eq.${encodeURIComponent(
    slug
  )}&select=id,slug,active,title,trust_level,metadata`;
  const response = await supabaseRequest(endpoint, "GET");
  return Array.isArray(response) && response.length > 0 ? response[0] : null;
}

function buildSourceMetadata(config, qualityManifest, filePath, chunkCount) {
  return {
    audit_round: qualityManifest.auditRound,
    baseline_trust_level: config.baselineTrustLevel,
    chunk_count: chunkCount,
    file_candidates: [...config.files],
    file_path: filePath ? path.relative(rootDir, filePath) : null,
    ingestion_status: config.ingestionStatus,
    minimum_live_trust_level: qualityManifest.minimumLiveTrustLevel,
    profile_manifest: config.profileManifest || null,
    quality_metrics: config.qualityMetrics,
    quality_tier: config.qualityTier || null,
    trust_level_reason: config.trustLevelReason || null,
  };
}

async function syncSourceRecord(config, qualityManifest, filePath, chunkCount, allowCreate) {
  const payload = {
    active: config.ingestionStatus !== "flagged_for_removal",
    canonical_url: config.canonicalUrl || null,
    kind: config.kind,
    license: config.license || null,
    metadata: buildSourceMetadata(config, qualityManifest, filePath, chunkCount),
    slug: config.slug,
    source_type: config.sourceType || "dataset",
    species_scope: config.speciesScope,
    title: config.title,
    trust_level: config.trustLevel,
  };

  const existing = await fetchSourceRecord(config.slug);
  if (existing) {
    const response = await supabaseRequest(
      `knowledge_sources?slug=eq.${encodeURIComponent(config.slug)}`,
      "PATCH",
      payload
    );
    return Array.isArray(response) && response.length > 0 ? response[0] : existing;
  }

  if (!allowCreate) {
    return null;
  }

  const response = await supabaseRequest(
    "knowledge_sources?on_conflict=slug",
    "POST",
    payload
  );
  return Array.isArray(response) ? response[0] : response;
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

function isDogCompatibleRow(row) {
  const haystack = Object.values(row || {})
    .map((value) => String(value || ""))
    .join(" ");
  return !CAT_MARKER_PATTERN.test(haystack);
}

function splitSignalSymptoms(value) {
  return String(value || "")
    .split(/[|;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildBreedProfileIndex(config) {
  const profiles = loadBreedExpansionProfiles(
    config.profileManifest || defaultBreedProfilePath
  );
  const byId = new Map();
  for (const profile of profiles) {
    byId.set(normalizeTag(profile.breedId), profile);
  }
  return byId;
}

function processPetHealthSymptoms(rows) {
  const chunks = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const text = row.text?.trim();
    const condition = row.condition?.trim();
    const recordType = row.record_type?.trim();
    if (!text) {
      errors.push(`Row ${index + 1}: missing text`);
      continue;
    }

    const keywordTags = [];
    if (condition) keywordTags.push(normalizeTag(condition));
    if (recordType) keywordTags.push(normalizeTag(recordType));

    chunks.push({
      body: text,
      case_data: {
        condition: condition || "Unknown",
        record_type: recordType || "unknown",
      },
      heading: `Clinical Note: ${condition || "Unknown"}`,
      keyword_tags: keywordTags,
    });
  }

  return { chunks, errors };
}

function processVetClinicalData(rows) {
  const chunks = [];
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const animalName = row.AnimalName?.trim() || "Unknown";
    const breed = row.Breed?.trim() || "Unknown";
    const age = row.Age?.trim() || "Unknown";
    const weight = row.Weight_kg?.trim() || "Unknown";
    const history = row.MedicalHistory?.trim() || "None";
    const symptoms = [
      row.Symptom_1,
      row.Symptom_2,
      row.Symptom_3,
      row.Symptom_4,
      row.Symptom_5,
    ]
      .map((value) => value?.trim())
      .filter(Boolean);

    if (symptoms.length === 0) {
      errors.push(`Row ${index + 1}: no symptoms found`);
      continue;
    }

    const keywordTags = [
      ...symptoms.map((symptom) => normalizeTag(symptom)),
      normalizeTag(breed),
    ].filter((tag) => tag && tag !== "unknown");

    chunks.push({
      body: [
        `Species: ${animalName}. Breed: ${breed}. Age: ${age} years. Weight: ${weight} kg.`,
        `Medical History: ${history}.`,
        `Symptoms: ${symptoms.join(", ")}.`,
      ].join("\n"),
      case_data: {
        age,
        breed,
        medical_history: history,
        species: animalName,
        symptoms,
        weight_kg: weight,
      },
      heading: `Veterinary Case: ${breed}, ${age}y, ${weight}kg`,
      keyword_tags: keywordTags,
    });
  }

  return { chunks, errors };
}

function processBreedSpecificClinicalCases(rows, config) {
  const chunks = [];
  const errors = [];
  const breedProfiles = buildBreedProfileIndex(config);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const breedId = normalizeTag(row.breed_id || row.BreedId);
    const breed = String(row.breed || row.Breed || "").trim();
    const conditionLabel = normalizeTag(
      row.condition_label || row.ConditionLabel
    );
    const conditionName = String(
      row.condition_name || row.ConditionName || ""
    ).trim();
    const domain = normalizeTag(row.domain || row.Domain);
    const trustLevel = Number(row.trust_level || row.TrustLevel);
    const chiefComplaint = String(
      row.chief_complaint || row.ChiefComplaint || ""
    ).trim();
    const signalSymptoms = splitSignalSymptoms(
      row.signal_symptoms || row.SignalSymptoms
    );
    const medicalHistory = String(
      row.medical_history || row.MedicalHistory || ""
    ).trim();
    const clinicalSummary = String(
      row.clinical_summary || row.ClinicalSummary || ""
    ).trim();

    if (!breedId || !breed || !conditionLabel || !conditionName || !domain) {
      errors.push(`Row ${index + 1}: missing breed tag, condition label, or domain`);
      continue;
    }
    if (MIXED_BREED_PATTERN.test(normalizeText(breed))) {
      errors.push(`Row ${index + 1}: mixed-breed record missing disambiguation tag`);
      continue;
    }
    if (!Number.isFinite(trustLevel) || trustLevel < MINIMUM_BREED_RECORD_TRUST) {
      errors.push(`Row ${index + 1}: trust ${trustLevel || "n/a"} is below ${MINIMUM_BREED_RECORD_TRUST}`);
      continue;
    }

    const profile = breedProfiles.get(breedId);
    if (!profile) {
      errors.push(`Row ${index + 1}: unknown breed profile ${breedId}`);
      continue;
    }

    const validName =
      normalizeText(profile.name) === normalizeText(breed) ||
      profile.aliases.some((alias) => normalizeText(alias) === normalizeText(breed));
    if (!validName) {
      errors.push(`Row ${index + 1}: breed ${breed} does not match manifest profile ${profile.name}`);
      continue;
    }

    const conditionProfile = profile.topConditions.find(
      (condition) => condition.conditionLabel === conditionLabel
    );
    if (!conditionProfile) {
      errors.push(`Row ${index + 1}: ${conditionLabel} is not declared for ${profile.name}`);
      continue;
    }
    if (conditionProfile.domain !== domain) {
      errors.push(`Row ${index + 1}: domain ${domain} does not match manifest domain ${conditionProfile.domain}`);
      continue;
    }

    const keywordTags = [
      breedId,
      normalizeTag(profile.name),
      ...profile.aliases.map((alias) => normalizeTag(alias)),
      conditionLabel,
      domain,
      ...signalSymptoms.map((symptom) => normalizeTag(symptom)),
    ].filter(Boolean);

    chunks.push({
      body: [
        `Breed: ${profile.name}. Domain: ${domain}. Condition focus: ${conditionName}.`,
        chiefComplaint ? `Chief complaint: ${chiefComplaint}.` : "",
        signalSymptoms.length
          ? `Signal symptoms: ${signalSymptoms.join(", ")}.`
          : "",
        medicalHistory ? `Medical history: ${medicalHistory}.` : "",
        clinicalSummary ? `Clinical summary: ${clinicalSummary}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      case_data: {
        breed,
        breed_id: breedId,
        condition_label: conditionLabel,
        condition_name: conditionName,
        domain,
        record_id: String(row.record_id || row.RecordId || `breed-case-${index + 1}`),
        selection_source: profile.selectionSource,
        signal_symptoms: signalSymptoms,
        smoke_query: profile.smokeQuery,
        trust_level: trustLevel,
      },
      heading: `Breed-Specific Case: ${profile.name} — ${conditionName}`,
      keyword_tags: [...new Set(keywordTags)],
    });
  }

  return { chunks, errors };
}

const PROCESSORS = {
  petHealthSymptoms: processPetHealthSymptoms,
  vetClinicalData: processVetClinicalData,
  breedSpecificClinicalCases: processBreedSpecificClinicalCases,
};

function normalizeFingerprint(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function computeObservedQuality(chunks) {
  if (chunks.length === 0) {
    return { duplicateRate: 0, labelConsistency: 0 };
  }

  const seen = new Set();
  let duplicateCount = 0;
  let labeledCount = 0;

  for (const chunk of chunks) {
    const fingerprint = normalizeFingerprint(`${chunk.heading}\n${chunk.body}`);
    if (seen.has(fingerprint)) {
      duplicateCount += 1;
    } else {
      seen.add(fingerprint);
    }

    if (Array.isArray(chunk.keyword_tags) && chunk.keyword_tags.length > 0) {
      labeledCount += 1;
    }
  }

  return {
    duplicateRate: duplicateCount / chunks.length,
    labelConsistency: labeledCount / chunks.length,
  };
}

async function upsertChunkBatch(sourceId, batch) {
  const payload = batch.map((chunk) => ({
    chunk_index: chunk.chunk_index,
    citation: chunk.citation || null,
    embedding_status: "pending",
    keyword_tags: chunk.keyword_tags,
    metadata: { case_data: chunk.case_data },
    source_id: sourceId,
    text_content: chunk.body,
    title: chunk.heading,
  }));

  await supabaseRequest(
    "knowledge_chunks?on_conflict=source_id,chunk_index",
    "POST",
    payload
  );
}

function buildSourceReport(config, input) {
  return {
    auditRound: input.auditRound,
    baselineTrustLevel: config.baselineTrustLevel,
    chunkCount: input.chunkCount,
    filePath: input.filePath ? path.relative(rootDir, input.filePath) : null,
    ingestionStatus: config.ingestionStatus,
    observedQuality: input.observedQuality,
    processor: config.processor,
    profileManifest: config.profileManifest || null,
    qualityMetrics: config.qualityMetrics,
    qualityTier: config.qualityTier || null,
    skippedRows: input.skippedRows,
    slug: config.slug,
    sourceKnown: config.sourceKnown,
    status: input.status,
    title: config.title,
    totalRows: input.totalRows,
    trustLevel: config.trustLevel,
  };
}

function printSourceSummary(config, reportEntry) {
  const metrics = config.qualityMetrics;
  const observed = reportEntry.observedQuality;

  console.log(`${config.slug}: ${reportEntry.status}`);
  console.log(`   trust ${config.baselineTrustLevel ?? "n/a"} -> ${config.trustLevel}`);
  console.log(
    `   quality ${config.qualityTier || "unrated"} | audited accuracy=${formatPercent(
      metrics?.accuracyRate
    )}, duplicates=${formatPercent(metrics?.duplicateRate)}, labels=${formatPercent(
      metrics?.labelConsistency
    )}`
  );

  if (reportEntry.totalRows > 0 || reportEntry.chunkCount > 0) {
    console.log(
      `   observed rows=${reportEntry.totalRows}, chunks=${reportEntry.chunkCount}, duplicates=${formatPercent(
        observed.duplicateRate
      )}, labels=${formatPercent(observed.labelConsistency)}`
    );
  }

  if (reportEntry.filePath) {
    console.log(`   file ${reportEntry.filePath}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const qualityManifest = loadQualityManifest(options.qualityManifestPath);
  const dataDirCandidates = resolveDataDirCandidates(options, qualityManifest);

  if (!supportsDatabaseWrites(options.dryRun)) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  if (options.resetCheckpoint && fs.existsSync(options.checkpointPath)) {
    fs.unlinkSync(options.checkpointPath);
  }

  const checkpoint = options.resume
    ? readCheckpoint(options.checkpointPath, qualityManifest.auditRound)
    : readCheckpoint("", qualityManifest.auditRound);
  const report = Array.isArray(checkpoint.report) ? checkpoint.report : [];

  console.log("=== PawVital CSV Corpus Ingestion ===");
  console.log(`   audit round: ${qualityManifest.auditRound}`);
  if (options.dryRun) console.log("   [DRY RUN — no database writes]");
  if (options.dogOnly) console.log("   [DOG-ONLY MODE]");
  if (options.resume) console.log(`   [RESUME from ${options.checkpointPath}]`);
  console.log("");

  const datasetConfigs = buildDatasetConfigs(qualityManifest).filter((config) => {
    if (options.sourceFilter && config.slug !== options.sourceFilter) return false;
    if (options.fileFilter) {
      return config.files.some(
        (fileName) =>
          fileName === options.fileFilter || fileName.includes(options.fileFilter)
      );
    }
    return true;
  });

  for (const config of datasetConfigs) {
    if (options.resume && checkpoint.completedSourceSlugs.includes(config.slug)) {
      console.log(`Skipping ${config.slug} (already completed in checkpoint)`);
      continue;
    }

    const filePath = resolveSourceFile(config.files, dataDirCandidates);
    const processor = PROCESSORS[config.processor];
    if (!processor) {
      throw new Error(`Unknown processor "${config.processor}" for ${config.slug}`);
    }

    if (!filePath) {
      const record =
        !options.dryRun &&
        (config.sourceKnown || config.ingestionStatus === "flagged_for_removal")
          ? await syncSourceRecord(config, qualityManifest, null, 0, false)
          : null;
      const reportEntry = buildSourceReport(config, {
        auditRound: qualityManifest.auditRound,
        chunkCount: 0,
        filePath: null,
        observedQuality: { duplicateRate: 0, labelConsistency: 0 },
        skippedRows: 0,
        status:
          config.ingestionStatus === "ingestion_ready"
            ? "awaiting_local_csv"
            : record
              ? "trust_synced_without_file"
              : "missing_file",
        totalRows: 0,
      });
      report.push(reportEntry);
      printSourceSummary(config, reportEntry);
      writeReport(options.reportPath, report);
      console.log("");
      continue;
    }

    const rows = parseCSV(fs.readFileSync(filePath, "utf8"));
    const filteredRows = options.dogOnly ? rows.filter(isDogCompatibleRow) : rows;
    const { chunks, errors } = processor(filteredRows, config);
    const observedQuality = computeObservedQuality(chunks);
    const sourceRecord =
      options.dryRun
        ? null
        : await syncSourceRecord(config, qualityManifest, filePath, chunks.length, true);
    const startIndex =
      options.resume && checkpoint.currentSourceSlug === config.slug
        ? Number(checkpoint.currentBatchStart || 0)
        : Number(checkpoint.sourceProgress?.[config.slug]?.nextBatchStart || 0);

    if (!options.dryRun && sourceRecord) {
      for (
        let batchStart = startIndex;
        batchStart < chunks.length;
        batchStart += options.batchSize
      ) {
        const batch = chunks.slice(batchStart, batchStart + options.batchSize).map(
          (chunk, offset) => ({
            ...chunk,
            chunk_index: batchStart + offset,
          })
        );
        await upsertChunkBatch(sourceRecord.id, batch);
        checkpoint.currentBatchStart = batchStart + batch.length;
        checkpoint.currentSourceSlug = config.slug;
        checkpoint.sourceProgress[config.slug] = {
          nextBatchStart: checkpoint.currentBatchStart,
        };
        writeCheckpoint(options.checkpointPath, checkpoint);
      }
    }

    const reportEntry = buildSourceReport(config, {
      auditRound: qualityManifest.auditRound,
      chunkCount: chunks.length,
      filePath,
      observedQuality,
      skippedRows: errors.length,
      status: options.dryRun ? "dry_run" : "ingested",
      totalRows: filteredRows.length,
    });
    report.push(reportEntry);
    printSourceSummary(config, reportEntry);
    if (errors.length > 0) {
      errors.slice(0, 5).forEach((error) => console.log(`   ${error}`));
      if (errors.length > 5) {
        console.log(`   ... and ${errors.length - 5} more`);
      }
    }

    checkpoint.completedSourceSlugs = [
      ...checkpoint.completedSourceSlugs.filter((slug) => slug !== config.slug),
      config.slug,
    ];
    checkpoint.currentBatchStart = 0;
    checkpoint.currentSourceSlug = null;
    delete checkpoint.sourceProgress[config.slug];
    checkpoint.report = report;
    writeCheckpoint(options.checkpointPath, checkpoint);
    writeReport(options.reportPath, report);
    console.log("");
  }

  console.log(`Report written to ${path.relative(rootDir, options.reportPath)}`);
  if (!options.dryRun) {
    console.log(
      `Checkpoint written to ${path.relative(rootDir, options.checkpointPath)}`
    );
  }
  console.log("=== CSV Ingestion Complete ===");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
