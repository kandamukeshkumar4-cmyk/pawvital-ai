# PawVital AI — Product Overview

## What Is PawVital?

PawVital AI is a dog-only veterinary symptom triage application. It helps dog owners describe what is happening, understand urgency, and prepare a structured report to share with a veterinarian.

Unlike generic pet-health tools that rely on loose checklist logic or open-ended prompting, PawVital is built around a deterministic canine clinical matrix. The LLM layer supports language understanding and report narration, but it does not replace the deterministic medical authority.

## Current Validated Scope

As of the 2026-04-10 clinical audit and current Wave 3 scope gate:

- Species support is dog-only.
- Deterministic complaint coverage spans 50 complaint families.
- The clinical matrix covers roughly 150+ modeled canine conditions.
- Active breed-modifier coverage spans 26 breeds, with expansion still pending for several high-value gaps.
- The current benchmark pack is useful for engineering evaluation, but the `gold-candidate` suite is not yet a true vet-adjudicated gold standard.

## How the Clinical Matrix Works

PawVital's core engine is a **deterministic canine clinical matrix**, not a black-box diagnosis prompt. At a high level:

1. **Symptom intake**: The owner describes what they are seeing in natural language.
2. **Structured follow-up**: The system asks clinically bounded questions about onset, severity, timing, red flags, and related signs.
3. **Deterministic matrix lookup**: Complaint families, disease rules, breed modifiers, age/weight context, and urgency floors are evaluated in the deterministic engine.
4. **Supportive retrieval**: Veterinary references and related internal evidence can support explanation and reporting, but they do not override deterministic urgency.
5. **Report generation**: PawVital produces a structured owner-facing report and a veterinarian handoff summary with safety guidance and reasoning context.

## What Data Sources Power the System

| Source | Role | Current note |
|--------|------|--------------|
| Deterministic clinical matrix | Medical authority | Complaint logic, urgency floors, disease rules, and must-ask questions |
| Merck Veterinary Manual | Reference support | Used as supporting evidence for explanation and review |
| WAVD guidance and curated veterinary references | Reference support | Used for supporting evidence in relevant domains |
| Curated clinical case corpus | Retrieval support | Used for evidence enrichment and report context |
| Reference image corpus | Retrieval support | Used for guarded image-support workflows |
| Breed modifier registry | Deterministic support | 26 active breeds as of the 2026-04-10 audit |

All retrieval and corpus sources are supplemental. The deterministic engine remains authoritative for medical routing.

## Multimodal Status

PawVital has multimodal scaffolding and a documented dog-focused wound triage pilot, but broader multimodal claims are not yet validated for general release.

Current safe product description:

- Image support exists as a guarded canine adjunct workflow.
- The documented validated pilot is still wound-focused.
- Broader skin, eye, ear, oral, gait, audio, and temporal packs are roadmap work, not current validated scope.

## Privacy and Safety

- **No medical authority shift**: `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` remain the medical authority.
- **No data selling**: Dog health data is not sold to third parties.
- **User-controlled data**: Users can delete their account data and stored reports.
- **Not a veterinary replacement**: PawVital is a triage and communication tool, not a substitute for professional veterinary care.
- **Transparent evidence**: Owner reports can expose evidence and confidence context without turning supportive retrieval into medical authority.

## Target Audience

### Dog owners

- People who want help understanding their dog's symptoms before deciding how urgently to seek care
- Households that want a clearer, structured history for veterinarian visits
- Owners who want safer triage guidance than a generic web search

### Developers and operators

- Engineers extending the deterministic clinical system, report pipeline, benchmark harness, or review tooling
- Operators maintaining validated scope, provenance, and release gating for the dog-only product

## Technical Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API routes, Supabase (Postgres + pgvector), optional sidecar services
- **AI support**: NVIDIA-hosted generation and embedding services plus supplemental multimodal sidecars
- **Deployment**: Vercel (app), Supabase (database), RunPod/sidecars where enabled
