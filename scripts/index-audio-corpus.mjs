#!/usr/bin/env node
/**
 * Index audio corpus files into audio_sources + audio_assets tables.
 *
 * Usage:
 *   node scripts/index-audio-corpus.mjs            # Index all audio files
 *   node scripts/index-audio-corpus.mjs --dry-run   # Preview only
 *
 * Scans corpus/sounds/dog-disease-sounds/ and creates audio_asset rows.
 * No ML classification — just catalogs the files for future use.
 */

import { readdir, stat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;
const isDryRun = process.argv.includes("--dry-run");

if (!isDryRun && !databaseUrl) {
  console.error("DATABASE_URL is required to index the audio corpus.");
  process.exit(1);
}

const AUDIO_ROOT = resolve(process.cwd(), "corpus", "sounds", "dog-disease-sounds");

const PATHOLOGICAL_CATEGORIES = new Set([
  "tracheal_collapse",
  "kennel_cough",
  "reverse_sneeze",
]);

async function listWavFiles(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && extname(e.name).toLowerCase() === ".wav")
      .map((e) => resolve(dirPath, e.name));
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== PawVital Audio Corpus Indexer ===\n");
  if (isDryRun) console.log("   [DRY RUN — no database writes]\n");

  const categoryDirs = await readdir(AUDIO_ROOT, { withFileTypes: true });
  const categories = categoryDirs.filter((d) => d.isDirectory()).map((d) => d.name);

  const assets = [];
  const categoryCounts = {};

  for (const category of categories) {
    const categoryDir = resolve(AUDIO_ROOT, category);
    const wavFiles = await listWavFiles(categoryDir);
    categoryCounts[category] = wavFiles.length;

    for (const wavPath of wavFiles) {
      assets.push({
        local_path: relative(process.cwd(), wavPath).replace(/\\/g, "/"),
        category,
        is_pathological: PATHOLOGICAL_CATEGORIES.has(category),
      });
    }
  }

  // Print summary
  const totalFiles = assets.length;
  const pathologicalCount = assets.filter((a) => a.is_pathological).length;
  const normalCount = totalFiles - pathologicalCount;

  console.log(`Total audio files: ${totalFiles}`);
  console.log(`Pathological: ${pathologicalCount}   Normal: ${normalCount}\n`);
  console.log("Per-category counts:");
  for (const [cat, count] of Object.entries(categoryCounts).sort()) {
    const marker = PATHOLOGICAL_CATEGORIES.has(cat) ? " [pathological]" : "";
    console.log(`   ${cat}: ${count}${marker}`);
  }
  console.log();

  if (isDryRun) {
    console.log(`[DRY RUN] Would insert ${totalFiles} audio assets.\n`);
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 2,
  });

  try {
    // Upsert audio source
    const sourceResult = await pool.query(
      `INSERT INTO public.audio_sources (slug, dataset_name, description, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (slug) DO UPDATE SET
         dataset_name = EXCLUDED.dataset_name,
         description = EXCLUDED.description,
         metadata = EXCLUDED.metadata
       RETURNING id`,
      [
        "dog-disease-sounds",
        "Dog Disease Sound Classification Dataset",
        "925 WAV samples across 8 categories (3 pathological, 5 normal)",
        JSON.stringify({
          total_files: totalFiles,
          categories: Object.keys(categoryCounts),
          pathological_categories: [...PATHOLOGICAL_CATEGORIES],
          indexed_at: new Date().toISOString(),
        }),
      ]
    );
    const sourceId = sourceResult.rows[0].id;
    console.log(`Audio source upserted (id: ${sourceId})`);

    // Delete existing assets for this source to allow re-indexing
    const deleteResult = await pool.query(
      "DELETE FROM public.audio_assets WHERE source_id = $1",
      [sourceId]
    );
    if (deleteResult.rowCount > 0) {
      console.log(`Deleted ${deleteResult.rowCount} old assets`);
    }

    // Batch insert assets
    const chunkSize = 100;
    let insertedCount = 0;
    for (let i = 0; i < assets.length; i += chunkSize) {
      const chunk = assets.slice(i, i + chunkSize);
      const values = [];
      const placeholders = chunk.map((asset, idx) => {
        const base = idx * 4;
        values.push(sourceId, asset.local_path, asset.category, asset.is_pathological);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });

      await pool.query(
        `INSERT INTO public.audio_assets (source_id, local_path, category, is_pathological)
         VALUES ${placeholders.join(", ")}`,
        values
      );
      insertedCount += chunk.length;
      if (insertedCount % 200 === 0 || insertedCount === assets.length) {
        console.log(`Inserted ${insertedCount} / ${assets.length} audio assets`);
      }
    }

    console.log(`\nDone: ${insertedCount} audio assets indexed.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Audio indexing failed:", err);
  process.exit(1);
});
