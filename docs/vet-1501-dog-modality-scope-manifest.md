# VET-1501 — Dog-Only Multimodal Scope Manifest

> Mandatory first document for Wave 5 (VET-1500).
> All specialist packs (VET-1504–1509) must conform to this manifest.
> Any deviation requires an amendment ticket before implementation starts.

---

## 1. Validated Scope — Dog Only

Wave 5 multimodal work is **dog-only**. No feline, equine, or exotic species modality
work is permitted until a separate species-parity wave is authorized.

Rationale: the current benchmark corpus (dog-triage benchmark, wound/skin pilot, NVIDIA
NIM model assignments) is dog-validated. Adding species without benchmarks violates
global safety rule 3.

---

## 2. Allowed Media Domains

These domains are validated for implementation in Wave 5. Each requires its own pack
ticket, benchmark slice, and rollout gate before going live.

| Domain | Pack | Allowed media types | Priority |
|--------|------|---------------------|----------|
| `skin_wound` | VET-1504 | Single image (JPEG/PNG/WebP) | P0 — already piloted |
| `mass_swelling` | VET-1504 | Single image | P0 |
| `lesion_descriptor` | VET-1504 | Single image | P0 |
| `eye` | VET-1505 | Single image | P1 |
| `ear` | VET-1505 | Single image | P1 |
| `oral_gum` | VET-1505 | Single image | P1 |
| `gait_lameness` | VET-1506 | Multi-image sequence (2–4 frames) or short video clip (≤15s) | P1 |
| `respiratory_audio` | VET-1507 | Audio file (MP3/WAV/M4A, ≤30s) | P2 |
| `stool_vomit` | VET-1508 | Single image | P2 |
| `abdominal_distension` | VET-1508 | Single image | P2 |

**Already partially built** (skin_wound, eye, ear, stool_vomit): the vision-preprocess
sidecar (`services/vision-preprocess-service/`) already detects these four domains.
VET-1504 and VET-1505 generalize and harden what exists.

---

## 3. Unsupported Domains — Must Abstain

Any media submitted against these domains must return a structured abstention rather
than a speculative result.

| Domain | Reason for abstention |
|--------|-----------------------|
| X-ray / radiograph | Requires licensed radiograph reader; no validated model in stack |
| Ultrasound image | Specialist equipment imagery; out of scope for owner-uploaded media |
| Lab result photo | OCR path exists (Azure Doc Intel) but is not clinical evidence |
| Video (general) | Only structured gait sequences allowed; arbitrary video is out of scope |
| Audio (non-respiratory) | Heart murmur, GI borborygmi, and similar sounds are out of scope |
| Non-dog species | See Section 1 |
| Medication / pill | No formulary or drug-ID model in stack |
| Human person | Must be refused immediately; no processing |

Abstention response shape (returned by router, VET-1503):
```ts
{ abstained: true; reason: AbstentionReason; suggestedAction: string }
```

---

## 4. Media Quality Gates (Global)

All packs must enforce these quality gates before passing media to any sidecar or
inference service. The gates already exist in `src/lib/image-gate.ts` for images;
each pack must plug in to the shared gate surface.

| Gate | Image | Audio | Temporal |
|------|-------|-------|----------|
| Minimum resolution | 512 × 512 px | — | 512 × 512 px per frame |
| Maximum file size | 10 MB | 5 MB | 50 MB total sequence |
| Blur score | Laplacian < 100 → retake | — | Per-frame check |
| Duration limit | — | ≤ 30 s | ≤ 15 s |
| Quality fail action | Retake request or abstain | Retake request or abstain | Drop worst frames or abstain |
| Minimum accepted quality | `borderline` | `acceptable` | `borderline` per frame |

Quality levels: `poor` → `borderline` → `good` → `excellent` (defined in VisionPreprocessResult).

---

## 5. Safety Rules (Repeating Wave-5 Global Rules)

All packs inherit these rules verbatim from the VET-1500 parent issue:

1. **Media inference is additive only.** It may escalate or enrich, never silently
   downgrade deterministic urgency.
2. **Low-quality media must trigger a retake request, gate, or abstention path.** Never
   infer from poor-quality media.
3. **Every modality pack needs its own benchmark slice and rollout gate.** No live
   promotion before benchmark + shadow + silent-trial pass.
4. **Breed-aware modality priors are allowed for dogs**, but must be
   provenance-backed and benchmarked.
5. **No modality pack goes live without shadow evaluation, kill switches, and
   cost / latency guardrails.**

---

## 6. Benchmark Requirements per Pack

Each pack must deliver a benchmark slice before entering shadow mode.

| Pack | Ticket | Benchmark slice name | Minimum cases | Coverage dimensions |
|------|--------|---------------------|---------------|---------------------|
| Skin/wound/mass | VET-1504 | `dog-triage/skin-wound` | 40 | lesion type × severity × lighting × breed group |
| Eye/ear/oral | VET-1505 | `dog-triage/eye-ear-oral` | 40 | region × concern type × image quality |
| Gait/lameness | VET-1506 | `dog-triage/gait-temporal` | 20 | limb × weight-bearing score × sequence length |
| Respiratory audio | VET-1507 | `dog-triage/respiratory-audio` | 30 | sound type × severity × background noise |
| GI visual | VET-1508 | `dog-triage/gi-visual` | 30 | presentation type × concern level × image quality |
| Breed-aware priors | VET-1509 | `dog-triage/breed-modality` | 20 per breed group | modality × breed × accuracy delta |

Each slice follows the existing `data/benchmarks/dog-triage/benchmark.schema.json` schema
and adds a required `modality` tag in the `tags` field.

---

## 7. Rollout Gate Requirements per Pack

| Gate | Requirement |
|------|-------------|
| Benchmark pass | ≥ 90% correctness on slice; no regressions vs. text-only baseline |
| Shadow trial | Minimum 50 real sessions with modality enabled (feature-flagged, silent) |
| Kill switch | Azure App Config flag per pack: `multimodal.<pack>.enabled` |
| Cost guard | Per-request cost ceiling set and logged before any live promotion |
| Latency guard | p95 latency ceiling set and enforced; timeout returns text-only fallback |
| Clinical-reviewer sign-off | Required for VET-1504 through VET-1510 (see VET-1500 review gates) |

---

## 8. Current Infrastructure — What Already Exists

These components are complete and do not need to be re-built. Each pack ticket must
integrate against them rather than duplicate them.

| Component | Location | Status |
|-----------|----------|--------|
| Image upload + client resize | `src/app/(dashboard)/symptom-checker/page.tsx` | Complete |
| Blur detection + quality gate | `src/lib/image-gate.ts` | Complete |
| `SupportedImageDomain` enum | `src/lib/clinical-evidence.ts` | Complete — extend for new domains |
| `VisionClinicalEvidence` contract | `src/lib/clinical-evidence.ts` | Complete — use as-is |
| Vision-preprocess sidecar | `services/vision-preprocess-service/` | Complete for skin/eye/ear/stool |
| Multimodal-consult sidecar | `services/multimodal-consult-service/` | Complete |
| Async-review sidecar | `services/async-review-service/` | Complete |
| TriageSession vision state | `src/lib/triage-engine.ts` | Complete — extend for audio |
| Sidecar timeout + split routing | `src/lib/hf-sidecars.ts` | Complete |
| Speech-to-text (dictation) | `src/hooks/useAzureSpeechInput.ts` | Complete — dictation only, not audio evidence |
| Journal photo upload | `src/app/api/journal/upload/route.ts` | Complete — separate from clinical media |

---

## 9. Infrastructure Gaps — What Must Be Built (by ticket)

| Gap | Ticket | Notes |
|-----|--------|-------|
| Unified `MediaPayload` type covering image + audio + temporal | VET-1502 | Single contract; backward compat with image flow |
| Complaint-to-modality router (`mediaIsUseful(complaint)`) | VET-1503 | Deterministic; no media request on every case |
| Audio file upload (accept="audio/*", ≤30s) | VET-1507 | New UI component + storage path |
| `AudioClinicalEvidence` contract | VET-1507 | Mirrors `VisionClinicalEvidence` |
| Respiratory audio sidecar (new HF service) | VET-1507 | Or NIM model; advisory only |
| Multi-image / temporal sequence intake | VET-1506 | Ordered frame array with timestamps |
| Per-pack Azure App Config kill switches | VET-1511 | `multimodal.<pack>.enabled` flags |
| Per-pack benchmark slices | VET-1509 + each pack | See Section 6 |
| Media evidence summary in report UI | VET-1510 | Confidence + abstention reason |

---

## 10. Execution Order Confirmation

Hard order per VET-1500 parent:

```
VET-1501 (this manifest) → done
    ↓
VET-1502 (unified media intake contract)
    ↓
VET-1503 (complaint-to-modality router)
    ↓ ──────────────────────────────────────────────┐
VET-1504  VET-1505  VET-1506  VET-1507  VET-1508   VET-1509
(skin)    (eye/ear)  (gait)   (audio)   (GI)       (breed)
    └──────────────────────────────────────────────┘
                        ↓
                    VET-1510 (scorecards + UI)
                        ↓
                    VET-1511 (staged rollout + guardrails)
```

Parallel work is permitted among VET-1504–1509 only after VET-1503 is merged.

---

*Document owner: Claude (VET-1501 implementation)*
*Created: 2026-06-17*
*Gate: Required before any VET-1504–1511 implementation starts*
