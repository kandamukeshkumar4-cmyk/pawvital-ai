# PawVital AI — Product Overview

## What Is PawVital?

PawVital AI is an evidence-based veterinary symptom triage application for dogs and cats. It helps pet owners understand their pet's symptoms, assess urgency, and prepare professional-quality reports to share with their veterinarian.

Unlike generic pet health apps that rely on simple checklists or web search scraping, PawVital uses a deterministic clinical matrix powered by veterinary reference data, clinical case matching, and multi-model AI inference.

## How the Clinical Matrix Works

PawVital's core diagnostic engine is a **deterministic clinical matrix** — not a black-box LLM prompt. Here's the high-level flow:

1. **Symptom Intake**: The user describes what's happening in natural language. The AI asks clinically structured follow-up questions (onset, duration, severity, associated symptoms).

2. **Clinical Matrix Lookup**: The symptom set is matched against 200+ disease profiles. Each disease profile contains:
   - Symptom-to-disease correlation weights
   - Breed-specific multipliers (e.g., Dachshunds get a 10× multiplier for IVDD)
   - Age and weight modifiers
   - Urgency classification rules

3. **Knowledge Retrieval**: The system retrieves relevant passages from:
   - Merck Veterinary Manual
   - WAVD (World Association for Veterinary Dermatology) guidelines
   - 10,000+ indexed clinical case records
   - 9,700+ labeled reference images

4. **Differential Diagnosis**: The matrix produces a ranked list of differential diagnoses, each with:
   - Confidence score (percentage)
   - Evidence citations (source + passage)
   - Urgency rating (green/amber/red)

5. **SOAP Report Generation**: A structured report is generated in SOAP (Subjective, Objective, Assessment, Plan) format — the same format veterinarians use in medical records.

## What Data Sources Power the Diagnosis

| Source | Type | Size |
|--------|------|------|
| Merck Veterinary Manual | Reference text | Full text indexed |
| WAVD Guidelines | Dermatology guidelines | Selected chapters |
| Clinical Case Records | Structured cases | 10,000+ records |
| Reference Image Library | Labeled veterinary images | 9,700+ images |
| Breed Disease Profiles | Structured data | 200+ breeds |

All data is embedded using NVIDIA NIM embedding models and stored in Supabase with pgvector for semantic search.

## Vision Analysis Pipeline

PawVital includes a 3-tier vision analysis pipeline for photo-based symptom assessment:

1. **Tier 1 — Image Classification**: Basic categorization (skin, eye, wound, etc.)
2. **Tier 2 — Similarity Search**: Compares against 9,700+ reference images to find visually similar conditions
3. **Tier 3 — AI Analysis**: Multi-model inference for detailed condition analysis

## Privacy and Safety

- **No data selling**: Pet health data is never sold to third parties
- **User-controlled data**: Users can delete all their data at any time
- **Not a vet replacement**: Every report includes a disclaimer that PawVital is a triage tool, not a substitute for professional veterinary care
- **Transparent evidence**: Every diagnosis shows its evidence sources so users can verify the reasoning

## Target Audience

### Pet Owners
- Dog and cat owners who want to understand their pet's symptoms before deciding whether a vet visit is needed
- Pet parents who want to track their pet's health over time
- Users who want to prepare useful information for their veterinarian

### Developers
- The codebase is structured for extensibility — new disease profiles, knowledge sources, and embedding models can be added through the data pipeline
- Solo developers interested in veterinary AI applications can study the architecture

## Technical Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API routes, NVIDIA NIM models, Supabase (Postgres + pgvector)
- **AI**: Multi-model inference (NVIDIA NIM for generation, embeddings for retrieval)
- **Deployment**: Vercel (frontend), Supabase (database), RunPod (GPU inference)
