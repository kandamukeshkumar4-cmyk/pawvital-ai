# Concern Bucket Engine — Qwen Implementation Notes

> **Ticket:** VET-1406Q
> **Date:** 2026-04-28
> **Author:** Qwen 3.6 Plus
> **Scope:** Pure TypeScript utilities + tests. Not wired into production flow.

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/clinical-intelligence/concern-buckets.ts` | Bucket definitions, types, and lookup helpers |
| `src/lib/clinical-intelligence/concern-bucket-scoring.ts` | Scoring engine, top-N, must-not-miss detection, merge into case state |
| `tests/clinical-intelligence/concern-buckets.test.ts` | Unit tests for all exported functions |

---

## Bucket Definitions (13 total)

### Must-not-miss buckets (8)
| ID | Label | Key Red Flags |
|----|-------|---------------|
| `emergency_airway_breathing` | Emergency — Airway / Breathing | blue_gums, pale_gums, breathing_difficulty, breathing_onset_sudden, stridor_present |
| `emergency_circulation_shock` | Emergency — Circulation / Shock | collapse, unresponsive, pale_gums, large_blood_volume, wound_deep_bleeding |
| `bloat_gdv_pattern` | Emergency — Bloat / GDV Pattern | unproductive_retching, rapid_onset_distension, bloat_with_restlessness, distended_abdomen_painful |
| `toxin_exposure_pattern` | Emergency — Toxin Exposure Pattern | toxin_confirmed, rat_poison_confirmed, toxin_with_symptoms |
| `urinary_obstruction_pattern` | Emergency — Urinary Obstruction Pattern | urinary_blockage, no_urine_24h |
| `seizure_neuro_pattern` | Emergency — Seizure / Neuro Pattern | seizure_activity, seizure_prolonged, post_ictal_prolonged, sudden_paralysis |
| `trauma_severe_pain` | Emergency — Trauma / Severe Pain | wound_deep_bleeding, wound_bone_visible |
| `skin_allergy_emergency` | Emergency — Skin Allergy Emergency | face_swelling, hives_widespread, allergic_with_breathing |

### Non-critical buckets (5)
| ID | Label |
|----|-------|
| `gi_dehydration_or_blood` | Concern — GI Dehydration or Blood |
| `skin_irritation_or_parasite` | Concern — Skin Irritation or Parasite |
| `routine_mild_skin` | Routine — Mild Skin Issue |
| `routine_mild_limp` | Routine — Mild Limp |
| `unclear_needs_more_info` | Unclear — Needs More Information |

---

## Scoring Rules

| Evidence Type | Score | Notes |
|---------------|-------|-------|
| Positive matching red flag | +35 | Strong score increase |
| Matching clinical signal | +20 | Medium score increase |
| Matching explicit answer | +15 | Medium score increase |
| Unknown emergency slot (must-not-miss) | +5 | Keeps bucket present at low score |
| Emergency urgency + positive flag | min(score, 80) | Floor for emergency buckets |

Scores are clamped to 0–100.

---

## Pure Functions

### Bucket Definitions
- `getConcernBucketDefinitions()` — returns all 13 bucket definitions
- `getConcernBucketDefinitionById(id)` — lookup by ID
- `getAllMustNotMissBucketIds()` — returns IDs of 8 must-not-miss buckets

### Scoring
- `scoreConcernBuckets(caseState)` — scores all buckets against case state
- `scoreConcernBucket(caseState, definition)` — scores a single bucket
- `getTopConcernBuckets(caseState, limit?)` — returns top N scored buckets sorted descending
- `hasMustNotMissConcern(caseState)` — true if any must-not-miss bucket has score > 0
- `mergeConcernBucketsIntoCaseState(caseState)` — writes scored buckets into `caseState.concernBuckets`

---

## Safety Rules

1. **Buckets are internal only** — `labelForLogs` is for logging/debugging, not owner-facing
2. **No diagnosis/treatment language** — bucket IDs and labels contain no diagnosis, treatment, cure, medication, prescription, antibiotic, steroid, or surgery terms
3. **Buckets cannot downgrade emergency urgency** — `mergeConcernBucketsIntoCaseState` only writes `concernBuckets`, never touches `currentUrgency`
4. **User-facing text must not use bucket labels** — bucket IDs are internal identifiers
5. **No treatment advice** — buckets only suggest question-card IDs for further information gathering
6. **Negative answer cannot override positive red flag** — scoring only adds for positive matches; negative flags are ignored

---

## Suggested Question Mappings

Each bucket maps to question-card IDs for follow-up:
- `emergency_airway_breathing` → `breathing_difficulty_check`, `gum_color_check`
- `emergency_circulation_shock` → `collapse_weakness_check`, `gum_color_check`
- `bloat_gdv_pattern` → `bloat_retching_abdomen_check`
- `toxin_exposure_pattern` → `toxin_exposure_check`
- `urinary_obstruction_pattern` → `urinary_blockage_check`, `urinary_straining_output`
- `seizure_neuro_pattern` → `seizure_neuro_check`, `neuro_seizure_duration`
- `trauma_severe_pain` → `limping_trauma_onset`
- `skin_allergy_emergency` → `skin_emergency_allergy_screen`
- `skin_irritation_or_parasite` → `skin_location_distribution`, `skin_changes_check`, `skin_exposure_check`
- `routine_mild_skin` → `skin_location_distribution`
- `routine_mild_limp` → `limping_weight_bearing`
- `unclear_needs_more_info` → `emergency_global_screen`

---

## NOT Done (Out of Scope)

- No wiring into live symptom-check flow
- No API route changes
- No UI changes
- No planner cutover
- No model/RAG changes
- No emergency threshold changes
- No owner-facing exposure of bucket labels

---

## Next Steps (Separate Ticket Required — Codex GPT-5.4)

1. Wire concern bucket scoring into the symptom-check session loop
2. Use `getTopConcernBuckets()` to drive next-question selection
3. Use `hasMustNotMissConcern()` as a safety gate before handoff
4. Build admin UI for bucket inspection
5. Integrate with the planner for question prioritization
