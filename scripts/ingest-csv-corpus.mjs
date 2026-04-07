#!/usr/bin/env node
/**
 * Ingest CSV clinical datasets into Supabase knowledge_chunks table.
 *
 * Usage:
 *   node scripts/ingest-csv-corpus.mjs                       # Ingest all CSV datasets
 *   node scripts/ingest-csv-corpus.mjs --dry-run              # Preview without inserting
 *   node scripts/ingest-csv-corpus.mjs --file veterinary_clinical_data.csv  # Single file
 *
 * Reads CSV files from corpus/data/, converts rows into knowledge chunks,
 * and upserts into knowledge_sources + knowledge_chunks tables.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "corpus", "data");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isDryRun = process.argv.includes("--dry-run");
const fileArgIdx = process.argv.indexOf("--file");
const fileFilter = fileArgIdx !== -1 ? process.argv[fileArgIdx + 1] : null;

if (!isDryRun && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ── CSV parsing (simple, no deps) ────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Supabase helpers ────────────────────────────────────────────────────────

async function supabaseRequest(endpoint, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
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
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${endpoint}: ${res.status} ${text}`);
  }
  return res.json();
}

async function upsertSource(slug, kind, title, trustLevel, speciesScope) {
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_sources?slug=eq.${encodeURIComponent(slug)}&select=id`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const existing = await findRes.json();
  if (existing && existing.length > 0) {
    console.log(`   (source already exists, reusing id)`);
    return existing[0];
  }

  const data = await supabaseRequest("knowledge_sources", "POST", {
    slug,
    kind,
    source_type: "dataset",
    title,
    trust_level: trustLevel,
    species_scope: speciesScope,
    active: true,
  });
  return data[0];
}

// ── Dataset configs ────────────────────────────────────────────────────────

const CSV_CONFIGS = [
  {
    files: ["pet-health-symptoms-dataset.csv", "pet-health-symptoms.csv"],
    slug: "csv-pet-health-symptoms",
    title: "Pet Health Symptoms Dataset (2K clinical notes)",
    kind: "document",
    trustLevel: 60,
    speciesScope: ["dog", "cat"],
    processor: "petHealthSymptoms",
  },
  {
    files: ["veterinary_clinical_data.csv", "veterinary-clinical-data.csv"],
    slug: "csv-veterinary-clinical-data",
    title: "Veterinary Clinical Dataset (10K records)",
    kind: "document",
    trustLevel: 60,
    speciesScope: ["dog", "cat"],
    processor: "vetClinicalData",
  },
];

// ── Process pet health symptoms (one chunk per row) ──────────────────────

function processPetHealthSymptoms(rows) {
  const chunks = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.text?.trim();
    const condition = row.condition?.trim();
    const recordType = row.record_type?.trim();

    if (!text) {
      errors.push(`Row ${i + 1}: missing text`);
      continue;
    }

    const heading = `Clinical Note: ${condition || "Unknown"}`;
    const body = text;
    const keywordTags = [];
    if (condition) keywordTags.push(condition.toLowerCase().replace(/\s+/g, "_"));
    if (recordType) keywordTags.push(recordType.toLowerCase().replace(/\s+/g, "_"));

    chunks.push({
      heading,
      body,
      keyword_tags: keywordTags,
      case_data: { condition: condition || "Unknown", record_type: recordType || "unknown" },
    });

    if ((i + 1) % 500 === 0) {
      console.log(`   Processed ${i + 1} / ${rows.length} rows`);
    }
  }

  return { chunks, errors };
}

// ── Process veterinary clinical data (one chunk per row) ─────────────────

function processVetClinicalData(rows) {
  const chunks = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const animalName = row.AnimalName?.trim() || "Unknown";
    const breed = row.Breed?.trim() || "Unknown";
    const age = row.Age?.trim() || "Unknown";
    const weight = row.Weight_kg?.trim() || "Unknown";
    const history = row.MedicalHistory?.trim() || "None";
    const symptoms = [row.Symptom_1, row.Symptom_2, row.Symptom_3, row.Symptom_4, row.Symptom_5]
      .map((s) => s?.trim())
      .filter(Boolean);

    if (symptoms.length === 0) {
      errors.push(`Row ${i + 1}: no symptoms found`);
      continue;
    }

    const heading = `Veterinary Case: ${breed}, ${age}y, ${weight}kg`;
    const body = [
      `Species: ${animalName}. Breed: ${breed}. Age: ${age} years. Weight: ${weight} kg.`,
      `Medical History: ${history}.`,
      `Symptoms: ${symptoms.join(", ")}.`,
    ].join("\n");

    const keywordTags = [
      ...symptoms.map((s) => s.toLowerCase().replace(/\s+/g, "_")),
      breed.toLowerCase().replace(/\s+/g, "_"),
    ].filter((t) => t && t !== "unknown");

    chunks.push({
      heading,
      body,
      keyword_tags: keywordTags,
      case_data: {
        species: animalName,
        breed,
        age,
        weight_kg: weight,
        medical_history: history,
        symptoms,
      },
    });

    if ((i + 1) % 500 === 0) {
      console.log(`   Processed ${i + 1} / ${rows.length} rows`);
    }
  }

  return { chunks, errors };
}

const PROCESSORS = {
  petHealthSymptoms: processPetHealthSymptoms,
  vetClinicalData: processVetClinicalData,
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PawVital CSV Corpus Ingestion ===\n");
  if (isDryRun) console.log("   [DRY RUN — no database writes]\n");

  for (const config of CSV_CONFIGS) {
    if (fileFilter) {
      const matchesFilter = config.files.some(
        (f) => f === fileFilter || f.includes(fileFilter)
      );
      if (!matchesFilter) continue;
    }

    let filePath = null;
    for (const candidate of config.files) {
      const candidatePath = path.join(DATA_DIR, candidate);
      if (fs.existsSync(candidatePath)) {
        filePath = candidatePath;
        break;
      }
    }
    if (!filePath) {
      console.log(`Skipping ${config.slug} (no matching file found: ${config.files.join(", ")})`);
      continue;
    }

    console.log(`Processing: ${config.title}`);
    console.log(`   File: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, "utf-8");
    const rows = parseCSV(content);
    console.log(`   Total rows: ${rows.length}`);

    const processor = PROCESSORS[config.processor];
    const { chunks, errors } = processor(rows);
    console.log(`   Valid chunks: ${chunks.length}`);
    if (errors.length > 0) {
      console.log(`   Skipped rows: ${errors.length}`);
      errors.slice(0, 5).forEach((e) => console.log(`      ${e}`));
      if (errors.length > 5) console.log(`      ... and ${errors.length - 5} more`);
    }

    if (isDryRun) {
      console.log(`   [DRY RUN] Would insert ${chunks.length} chunks for source "${config.slug}"\n`);
      continue;
    }

    try {
      const source = await upsertSource(
        config.slug,
        config.kind,
        config.title,
        config.trustLevel,
        config.speciesScope
      );

      let insertedCount = 0;
      const batchSize = 50;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize).map((c, idx) => ({
          source_id: source.id,
          chunk_index: i + idx,
          title: c.heading,
          text_content: c.body,
          keyword_tags: c.keyword_tags,
          metadata: { case_data: c.case_data },
          embedding_status: "pending",
        }));
        await supabaseRequest("knowledge_chunks", "POST", batch);
        insertedCount += batch.length;
        if (insertedCount % 500 === 0 || insertedCount === chunks.length) {
          console.log(`   Inserted ${insertedCount} / ${chunks.length} chunks`);
        }
      }
      console.log(`   Done: ${insertedCount} chunks ingested for "${config.slug}"\n`);
    } catch (err) {
      console.error(`   ERROR: ${err.message}\n`);
    }
  }

  console.log("=== CSV Ingestion Complete ===");
}

main().catch(console.error);
