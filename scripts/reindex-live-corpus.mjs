import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";

const rootDir = process.cwd();
const defaultCheckpointPath = path.join(
  rootDir,
  "tmp",
  "reindex-live-corpus.checkpoint.json"
);
const registryPath = path.join(rootDir, "src", "lib", "live-corpus-registry.json");
const corpusImagesDir = path.join(rootDir, "corpus", "images");

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
  const options = {
    dryRun: argv.includes("--dry-run"),
    resume: argv.includes("--resume"),
    resetCheckpoint: argv.includes("--reset-checkpoint"),
    batchSize: 50,
    checkpointPath: defaultCheckpointPath,
    resumeFrom: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--checkpoint=")) {
      options.checkpointPath = path.resolve(
        rootDir,
        arg.slice("--checkpoint=".length)
      );
    } else if (arg.startsWith("--resume-from=")) {
      options.resumeFrom = Number(arg.slice("--resume-from=".length));
    }
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) {
    return {
      stage: "ingest_csv",
      offset: 0,
      completedBatchKeys: [],
    };
  }

  return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
}

function writeCheckpoint(checkpointPath, checkpoint) {
  ensureDir(path.dirname(checkpointPath));
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
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
      } else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) {
        count += 1;
      }
    }
  }

  return count;
}

function findDirectoryMatches(directoryEntries, hints) {
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

function runNodeScript(scriptRelativePath, args, options) {
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, scriptRelativePath), ...args],
    {
      cwd: rootDir,
      env: process.env,
      stdio: options.dryRun ? "pipe" : "inherit",
      encoding: "utf8",
    }
  );

  if (options.dryRun) {
    console.log(`[dry-run] ${scriptRelativePath} ${args.join(" ")}`.trim());
    if (result.stdout?.trim()) console.log(result.stdout.trim());
    if (result.stderr?.trim()) console.error(result.stderr.trim());
  }

  if (result.status !== 0) {
    throw new Error(
      `${scriptRelativePath} failed with exit code ${result.status}: ${
        result.stderr?.trim() || result.stdout?.trim() || "unknown error"
      }`
    );
  }
}

function buildEmbedUrl() {
  const rawUrl = (process.env.HF_TEXT_RETRIEVAL_URL || "").trim();
  if (!rawUrl) {
    throw new Error("HF_TEXT_RETRIEVAL_URL is required for BGE-M3 reindexing");
  }

  const url = new URL(rawUrl);
  url.pathname = "/embed";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildSidecarHeaders() {
  const headers = { "Content-Type": "application/json" };
  const apiKey = (process.env.HF_SIDECAR_API_KEY || "").trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildKnowledgePassageText(row) {
  const keywordTags = Array.isArray(row.keyword_tags) ? row.keyword_tags : [];
  return [
    row.title || "",
    keywordTags.length ? `Tags: ${keywordTags.join(", ")}` : "",
    row.citation ? `Source: ${row.citation}` : "",
    row.text_content || "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchKnowledgeChunkBatch(pool, offset, batchSize) {
  const result = await pool.query(
    `select
        kc.id,
        kc.title,
        kc.text_content,
        kc.citation,
        kc.keyword_tags
      from public.knowledge_chunks kc
      join public.knowledge_sources ks
        on ks.id = kc.source_id
      where ks.active = true
        and ks.species_scope @> ARRAY['dog']::text[]
      order by kc.chunk_index asc, kc.id asc
      offset $1
      limit $2`,
    [offset, batchSize]
  );

  return result.rows;
}

async function resetKnowledgeEmbeddings(pool, dryRun) {
  const sql = `update public.knowledge_chunks kc
    set embedding = null,
        embedding_model = 'BAAI/bge-m3',
        embedding_status = 'pending',
        updated_at = now()
    from public.knowledge_sources ks
    where ks.id = kc.source_id
      and ks.active = true
      and ks.species_scope @> ARRAY['dog']::text[]`;

  if (dryRun) {
    console.log("[dry-run] reset BGE-M3 embeddings for dog-scoped knowledge chunks");
    return 0;
  }

  const result = await pool.query(sql);
  return result.rowCount || 0;
}

async function embedKnowledgeBatch(embedUrl, rows) {
  const response = await fetch(embedUrl, {
    method: "POST",
    headers: buildSidecarHeaders(),
    body: JSON.stringify({
      texts: rows.map(buildKnowledgePassageText),
      input_type: "passage",
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !Array.isArray(body.embeddings)) {
    throw new Error(
      `Embedding batch failed at ${embedUrl}: ${response.status} ${
        body?.detail || body?.error || "invalid response"
      }`
    );
  }

  return {
    model: String(body.model || "BAAI/bge-m3"),
    embeddings: body.embeddings,
  };
}

async function updateKnowledgeEmbeddings(pool, rows, embeddings, model, dryRun) {
  if (dryRun) {
    console.log(
      `[dry-run] would update ${rows.length} knowledge chunk embeddings with model ${model}`
    );
    return;
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const base = index * 3;
    const vectorLiteral = `[${embeddings[index].join(",")}]`;
    values.push(row.id, vectorLiteral, model);
    return `($${base + 1}::uuid, $${base + 2}::vector, $${base + 3})`;
  });

  await pool.query(
    `update public.knowledge_chunks kc
      set embedding = payload.embedding,
          embedding_model = payload.embedding_model,
          embedding_status = 'ready',
          updated_at = now()
      from (
        values ${placeholders.join(", ")}
      ) as payload(id, embedding, embedding_model)
      where kc.id = payload.id`,
    values
  );
}

function reconcileRegistry(dryRun) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!fs.existsSync(corpusImagesDir)) {
    console.log("No corpus/images directory found; live-corpus registry unchanged.");
    return 0;
  }

  const directoryEntries = fs
    .readdirSync(corpusImagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  let changed = 0;

  for (const policy of registry) {
    if (policy.status !== "pending_assets") continue;
    const hints = policy.directoryHints?.length ? policy.directoryHints : [policy.slug];
    const matches = findDirectoryMatches(directoryEntries, hints);
    const fileCount = matches.reduce(
      (sum, match) => sum + countFiles(path.join(corpusImagesDir, match.name)),
      0
    );

    if (fileCount <= 0) continue;
    changed += 1;
    policy.status = "live";
    policy.note = `Automatically promoted to live after on-disk asset verification (${fileCount} image file(s)).`;
  }

  if (changed > 0 && !dryRun) {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
  }

  console.log(
    dryRun
      ? `[dry-run] ${changed} pending_assets live-corpus entries would be promoted to live`
      : `${changed} pending_assets live-corpus entries promoted to live`
  );
  return changed;
}

async function main() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  const embedUrl = buildEmbedUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for live corpus reindexing");
  }

  if (options.resetCheckpoint && fs.existsSync(options.checkpointPath)) {
    fs.unlinkSync(options.checkpointPath);
  }

  const checkpoint =
    options.resume || options.resumeFrom !== null
      ? readCheckpoint(options.checkpointPath)
      : {
          stage: "ingest_csv",
          offset: 0,
          completedBatchKeys: [],
        };

  if (options.resumeFrom !== null) {
    checkpoint.stage = "reembed_knowledge";
    checkpoint.offset = Math.max(0, options.resumeFrom);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 2,
  });

  try {
    if (checkpoint.stage === "ingest_csv") {
      runNodeScript("scripts/ingest-csv-corpus.mjs", ["--dog-only"], options);
      checkpoint.stage = "reembed_knowledge";
      checkpoint.offset = 0;
      writeCheckpoint(options.checkpointPath, checkpoint);
    }

    if (checkpoint.stage === "reembed_knowledge") {
      if (checkpoint.offset === 0) {
        const resetCount = await resetKnowledgeEmbeddings(pool, options.dryRun);
        console.log(
          options.dryRun
            ? "[dry-run] planned BGE-M3 embedding reset"
            : `Reset ${resetCount} dog-scoped knowledge chunk embedding rows to pending`
        );
      }

      let offset = checkpoint.offset || 0;
      while (true) {
        const rows = await fetchKnowledgeChunkBatch(pool, offset, options.batchSize);
        if (rows.length === 0) break;

        const batchKey = `knowledge:${offset}:${rows.length}`;
        if (checkpoint.completedBatchKeys.includes(batchKey)) {
          offset += rows.length;
          checkpoint.offset = offset;
          writeCheckpoint(options.checkpointPath, checkpoint);
          continue;
        }

        const { model, embeddings } = await embedKnowledgeBatch(embedUrl, rows);
        await updateKnowledgeEmbeddings(
          pool,
          rows,
          embeddings,
          model,
          options.dryRun
        );
        offset += rows.length;
        checkpoint.offset = offset;
        checkpoint.completedBatchKeys = [
          ...checkpoint.completedBatchKeys,
          batchKey,
        ].slice(-50);
        writeCheckpoint(options.checkpointPath, checkpoint);
        console.log(`Embedded knowledge batch ${batchKey}`);
      }

      checkpoint.stage = "reindex_images";
      checkpoint.offset = 0;
      writeCheckpoint(options.checkpointPath, checkpoint);
    }

    if (checkpoint.stage === "reindex_images") {
      runNodeScript("scripts/index-local-image-corpus.mjs", [], options);
      checkpoint.stage = "reconcile_registry";
      writeCheckpoint(options.checkpointPath, checkpoint);
    }

    if (checkpoint.stage === "reconcile_registry") {
      reconcileRegistry(options.dryRun);
      checkpoint.stage = "verify";
      writeCheckpoint(options.checkpointPath, checkpoint);
    }

    if (checkpoint.stage === "verify") {
      runNodeScript("scripts/verify-live-corpus.mjs", [], options);
      checkpoint.stage = "done";
      writeCheckpoint(options.checkpointPath, checkpoint);
    }

    console.log("Live corpus reindex complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
