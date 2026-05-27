# PawVital AI

[![CI](https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/actions/workflows/ci.yml)
[![AI Review Gate](https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/actions/workflows/ai-review.yml/badge.svg)](https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/actions/workflows/ai-review.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Deployed on Vercel](https://img.shields.io/badge/deployed-Vercel-black?logo=vercel&logoColor=white)](https://pawvital-ai.vercel.app)

AI-powered dog symptom triage — multi-turn clinical interview, urgency scoring, health reports, and photo coaching. Built with Next.js 16.2, Supabase, and NVIDIA NIM. The language model handles conversation; a **deterministic clinical matrix** makes every medical call.

**Live:** [pawvital-ai.vercel.app](https://pawvital-ai.vercel.app) — free, no account required

---

## What it does

| Feature | Description |
|---|---|
| **Symptom Chat** | Describe your dog's symptoms in plain language — get a structured clinical interview and triage recommendation (routine / urgent / emergency) in under 60 seconds |
| **Urgency Scoring** | Bayesian confidence-calibrated urgency score with breed-adjusted risk multipliers — not a guess, a deterministic output |
| **Second Opinion** | Shadow comparison pipeline runs a second model path on every session and logs divergence for offline evaluation |
| **Health Score** | AI-generated health score (0–100) across vitals, history, and symptoms — updated after every session |
| **AI Photo Analysis** | Upload a photo of a wound, rash, or skin condition — get scored visual feedback and a prompt list for your vet |
| **Supplement Recommendations** | Evidence-linked supplement suggestions generated from symptom history and breed profile |
| **Health Reports** | Shareable PDF-ready report for your vet — includes session transcript, urgency level, and suggested questions |
| **Pet Profiles** | Manage multiple pets with breed, age, weight, and medical history for breed-specific risk calibration |
| **Health Journal** | Ongoing log of symptoms, photos, and notes — feeds back into triage context |
| **Async Review** | Background review pipeline that scores completed triage sessions and flags cases for human follow-up |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Auth & Database | Supabase (Postgres + Row-Level Security + Auth) |
| Primary LLM | NVIDIA NIM — Qwen 2.5 72B, DeepSeek, GLM-4, Kimi (multi-model) |
| Fallback LLM | Anthropic Claude (second-opinion and report generation) |
| Memory compression | MiniMax M2 (long-session context compression) |
| Vector search | Pinecone (clinical knowledge RAG) |
| Vision classifiers | Roboflow, Nyckel, HuggingFace BiomedCLIP |
| Image CDN | Cloudinary |
| Rate limiting | Upstash Redis |
| GPU sidecars | 5 Python microservices on HuggingFace / RunPod |
| Payments | Stripe |
| CI/CD | GitHub Actions + GitHub Models AI review gate |
| Hosting | Vercel |

---

## Architecture

```
Browser
├── Next.js App Router (React Server Components + Client Components)
│   ├── /(marketing)             → landing, pricing, community
│   ├── /(dashboard)
│   │   ├── /symptom-checker     → multi-turn triage chat
│   │   ├── /pets                → pet profiles + breed risk
│   │   ├── /journal             → health log + photo uploads
│   │   ├── /supplements         → AI supplement recommendations
│   │   ├── /history             → past triage sessions
│   │   ├── /analytics           → health trend dashboard
│   │   └── /reports             → shareable vet reports
│   └── /auth                    → Supabase Auth (email + OAuth)
│
└── Next.js API Routes (Node.js runtime, server-side only)
    ├── POST /api/ai/symptom-chat      → multi-turn clinical interview
    ├── POST /api/ai/symptom-check     → single-shot urgency check
    ├── POST /api/ai/health-score      → health score generation
    ├── POST /api/ai/supplements       → supplement recommendations
    ├── POST /api/ai/async-review      → background session review
    ├── GET  /api/ai/shadow-rollout    → shadow comparison admin
    ├── POST /api/pets/[id]            → pet profile management
    ├── POST /api/reports              → report generation + sharing
    └── POST /api/triage               → triage session persistence
        │
        ├── Supabase Auth    — session validation on every request
        ├── Upstash Redis    — usage_log rate limiting (per user, per day)
        ├── Supabase Postgres — chat history, pet profiles, health scores
        └── NVIDIA NIM API   — multi-model calls with Anthropic fallback
```

**Key decisions:**

- **Clinical matrix is the source of truth.** Urgency levels, red flags, and follow-up question order are hardcoded in `src/lib/clinical-matrix.ts`. The LLM never overrides them — it only handles natural language rephrasing and answer extraction.
- **Deterministic answer coercion before LLM extraction.** When a user says "yes" or "about two days", the system coerces the answer deterministically using the pending question as an anchor before falling back to the model.
- **Structured state cannot be mutated by model output.** `answered_questions`, `extracted_answers`, and `unresolved_question_ids` are protected from compression side effects and LLM hallucination.
- **Multi-model fallback.** If NVIDIA NIM is unavailable, `sideModel()` automatically switches to the next ranked model. Anthropic Claude handles second-opinion and final report paths.
- **Rate limiting via Postgres.** A `usage_log` table with an indexed `(user_id, created_at)` compound key counts daily requests without an external counter. Falls back gracefully if Redis is unavailable.
- **Row-Level Security on every table.** Supabase RLS policies ensure users can only read and write their own data, enforced at the database layer.
- **Multimodal support.** Chat and photo routes accept base64-encoded images and route them to vision-capable models.
- **AI-gated merges.** A GitHub Models review gate checks every PR for clinical correctness before the auto-merge step runs.

---

## Local Development

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

```bash
cp .env.example .env.local
# Fill in NVIDIA_API_KEY, Supabase keys, and NEXT_PUBLIC_APP_URL
```

**3. Set up the database**

```bash
# Paste supabase/schema.sql into your Supabase SQL editor and run it
```

**4. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Demo mode:** The app runs without any environment variables configured. All AI features and the dashboard render with deterministic fallback data — no API keys needed to explore locally.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NVIDIA_API_KEY` | Yes | NVIDIA NIM API key — covers all model roles server-side only |
| `NVIDIA_QWEN_API_KEY` | No | Per-role override for Qwen 2.5 72B |
| `NVIDIA_DEEPSEEK_API_KEY` | No | Per-role override for DeepSeek |
| `NVIDIA_GLM_API_KEY` | No | Per-role override for GLM-4 |
| `NVIDIA_KIMI_API_KEY` | No | Per-role override for Kimi |
| `NVIDIA_VISION_API_KEY` | No | Per-role override for vision routes |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude — second-opinion and report generation |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — server-side only |
| `DATABASE_URL` | Yes | Postgres connection string (for data pipeline scripts) |
| `STRIPE_SECRET_KEY` | Paid tiers | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Paid tiers | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Paid tiers | Stripe publishable key |
| `UPSTASH_REDIS_REST_URL` | Production | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash Redis REST token |
| `PINECONE_API_KEY` | RAG pipeline | Pinecone vector index API key |
| `CLOUDINARY_API_KEY` | Photo uploads | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Photo uploads | Cloudinary API secret |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Photo uploads | Cloudinary cloud name |
| `HF_TOKEN` | Sidecars | HuggingFace access token |
| `HF_SIDECAR_API_KEY` | Sidecars | Shared auth key for sidecar services |
| `MINIMAX_API_KEY` | Long sessions | MiniMax API key for memory compression |
| `RUNPOD_API_KEY` | GPU workloads | RunPod API key |
| `NEXT_PUBLIC_APP_URL` | Production | Canonical app URL (used in report share links) |
| `DAILY_REQUEST_LIMIT` | No | Max AI requests per user per day (default: 30) |

---

## Database Schema

Seven tables, all with RLS enabled:

- **`profiles`** — synced from `auth.users` via trigger on signup; stores display name, subscription tier, and pet count
- **`pets`** — pet profiles with breed, age, weight, sex, and medical history; foreign-keyed to `profiles`
- **`triage_sessions`** — one row per symptom-checker session; stores structured state (`answered_questions`, `extracted_answers`, `urgency_level`)
- **`chat_messages`** — per-turn message log for every triage session; used for report generation and async review
- **`health_scores`** — AI-generated health score history per pet; indexed by `(pet_id, created_at)`
- **`usage_log`** — per-user daily AI request counter; `(user_id, created_at)` compound index; rate-limit fallback if Redis is unavailable
- **`outcome_feedback`** — owner-reported triage outcome (resolved / vet visit / emergency); feeds back into shadow evaluation benchmarks

---

## Python Sidecars

Five optional microservices under `services/`. Run locally via `docker-compose.sidecars.yml` or deploy to HuggingFace Spaces / RunPod.

| Service | Port | Purpose |
|---|---|---|
| `vision-preprocess-service` | 8080 | Wound and skin condition image preprocessing + BiomedCLIP embedding |
| `text-retrieval-service` | 8081 | BM25 + dense retrieval over clinical knowledge corpus (BGE-M3) |
| `image-retrieval-service` | 8082 | Image similarity search over reference medical image index |
| `multimodal-consult-service` | 8083 | Combined text + image consultation for complex cases |
| `async-review-service` | 8084 | Background triage quality scoring and anomaly flagging |

All sidecars run in stub mode when `SIDECAR_STUB_MODE=true` — the app falls back to NVIDIA NIM paths automatically.

---

## CI/CD Pipeline

Every push to a feature branch triggers:

1. **Lint → Typecheck → Build → Tests** (`ci.yml`)
2. **Clinical automation gates** — validates that urgency logic, red flags, and clinical matrix schema are intact (`clinical-automation-gates.yml`)
3. **AI review gate** — GitHub Models reviews the PR for correctness and clinical safety; must pass before merge is allowed (`ai-review.yml`)
4. All gates pass → **auto-merged to `master`** → Vercel deploys → live in ~30 seconds

No manual merge step required.

---

## Deployment

Deployed on Vercel. Set the environment variables from the table above in your Vercel project settings, then push to `master`.

```bash
# Validate before pushing
npm run lint
npm run build
npm test
npm run security:secrets
```

> Never commit `.env.local`. All secrets belong in your deployment platform's environment manager.
