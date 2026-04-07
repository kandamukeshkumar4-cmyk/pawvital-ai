# PawVital AI — Data Pipeline Guide

## Overview

PawVital's knowledge base is built from multiple veterinary data sources that are ingested, chunked, embedded, and stored in Supabase (Postgres + pgvector) for semantic retrieval during symptom analysis.

## Architecture

```
Raw Data Sources
    ↓
Ingestion Scripts (chunking + metadata extraction)
    ↓
Embedding Pipeline (NVIDIA NIM embedding models)
    ↓
Supabase pgvector (semantic search index)
    ↓
Knowledge Retrieval Service (query-time RAG)
```

## Available Datasets

| Dataset | Type | Records | Script |
|---------|------|---------|--------|
| Merck Veterinary Manual | Reference text | Chunks from full text | `npm run seed:public-corpus` |
| Clinical Case Records | Structured CSV | 10,000+ cases | `npm run ingest:csv` |
| Reference Image Library | Labeled images | 9,700+ images | `npm run index:image-corpus` |
| Audio Corpus | Veterinary lectures | Transcripts | `npm run index:audio-corpus` |

## Running the Ingestion Pipeline

### Prerequisites

1. Ensure `.env.local` contains valid credentials for:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - `NVIDIA_NIM_API_KEY` (for embedding generation)

2. Apply the database schema if not already done:
   ```bash
   npm run db:apply-rag-schema
   ```

### Step 1: Seed the Knowledge Corpus

Ingest text-based knowledge sources (Merck, guidelines, etc.):

```bash
# Dry run — see what would be ingested
npm run seed:public-corpus:dry

# Run ingestion
npm run seed:public-corpus
```

### Step 2: Ingest CSV Data

Import structured clinical case records from CSV files:

```bash
npm run ingest:csv
```

CSV files should be placed in the `corpus/` directory. Expected columns vary by dataset type — see `scripts/ingest-csv-corpus.mjs` for schema details.

### Step 3: Index the Image Corpus

Index veterinary reference images with labels and metadata:

```bash
# Dry run
npm run index:image-corpus:dry

# Run indexing
npm run index:image-corpus
```

Images should be organized in `corpus/images/` with a metadata manifest.

### Step 4: Generate Embeddings

After ingestion, generate vector embeddings for all corpus entries:

```bash
# Embed all knowledge chunks
npm run embed:corpus:knowledge

# Embed image metadata
npm run embed:corpus:images

# Embed everything
npm run embed:corpus
```

### Step 5: Verify the Corpus

Validate that the corpus is healthy and complete:

```bash
npm run verify:corpus:live
```

This checks:
- Total chunk count matches expectations
- Embedding dimensions are correct
- No orphaned records
- Label distribution is balanced

## How Embeddings Work

1. **Text is chunked** into passages of ~500 tokens with 50-token overlap
2. **Each chunk is embedded** using NVIDIA NIM embedding models (1024-dimensional vectors)
3. **Vectors are stored** in Supabase using the `pgvector` extension
4. **At query time**, the user's symptom description is embedded and matched against the corpus using cosine similarity
5. **Top-K results** (typically K=5) are returned as context for the triage engine

### Embedding Models

The current pipeline uses NVIDIA NIM models:
- **Text embedding**: `nvidia/nv-embedqa-e5-v5` (1024 dimensions)
- **Reranking**: Cross-encoder reranking for improved relevance

## How to Add New Knowledge Sources

### Adding a New Text Source

1. Place the raw document in `corpus/` (supported: `.txt`, `.md`, `.pdf`, `.csv`)
2. If needed, create a custom ingestion script in `scripts/` that:
   - Reads the source file
   - Chunks it into passages
   - Assigns metadata (source name, category, labels)
   - Inserts into the `knowledge_chunks` table
3. Run the embedding pipeline:
   ```bash
   npm run embed:corpus:knowledge
   ```
4. Verify:
   ```bash
   npm run verify:corpus:live
   ```

### Adding a New Image Dataset

1. Organize images in `corpus/images/<dataset-name>/`
2. Create a metadata manifest (JSON or CSV) with:
   - Filename
   - Label (condition name)
   - Species (dog/cat)
   - Body region
   - Source attribution
3. Run the image indexing script:
   ```bash
   npm run index:image-corpus
   npm run embed:corpus:images
   ```

### Schema Reference

Key Supabase tables:

| Table | Purpose |
|-------|---------|
| `knowledge_chunks` | Text passages with embeddings |
| `image_corpus` | Reference images with metadata |
| `clinical_cases` | Structured case records |
| `audio_transcripts` | Audio lecture transcripts |

See `supabase-rag-schema.sql` for the full schema definition.

## Troubleshooting

### Common Issues

- **Embedding failures**: Check that `NVIDIA_NIM_API_KEY` is valid and the endpoint is reachable
- **Duplicate records**: The schema includes unique constraints — re-running ingestion will skip existing records
- **Missing embeddings**: Run `npm run embed:corpus` to fill any gaps
- **Schema changes**: Apply the latest schema with `npm run db:apply-rag-schema`

### Health Checks

```bash
# Full sidecar service health check
npm run verify:sidecars

# Corpus-specific validation
npm run verify:corpus:live
```
