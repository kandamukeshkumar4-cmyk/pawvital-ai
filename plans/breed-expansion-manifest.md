# Breed Expansion Manifest

`VET-1217` adds a committed breed-specific corpus slice for the 10 highest-priority canine breeds in the app’s current fallback ordering, while keeping the source fully tagged and reviewable.

## Selection note

- Intended selection source: `symptom_checks` usage data.
- Observed constraint in this isolated worktree: the configured Supabase host from `.env.local` did not resolve, so a live usage refresh was not possible here.
- Deterministic fallback used for this round: the current ordered `fallbackDogBreeds` list in [breed-data.ts](/G:/MY Website/pawvital-ai-vet1217/src/lib/breed-data.ts), which already reflects the app’s top dog-breed experience.

## Corpus source

- Source slug: `csv-breed-specific-clinical-cases-top10`
- File: [breed-specific-clinical-cases-top10.csv](/G:/MY Website/pawvital-ai-vet1217/data/corpus/csv/breed-specific-clinical-cases-top10.csv)
- Profile manifest: [breed-expansion-profiles.json](/G:/MY Website/pawvital-ai-vet1217/data/corpus/breed-expansion-profiles.json)
- Record count: `30` total (`3` dedicated cases per breed)
- Trust policy: every committed record has trust `>= 70`

## Breed coverage

| Rank | Breed | Records | Condition focus | Trust |
| --- | --- | --- | --- | --- |
| 1 | Labrador Retriever | 3 | `ccl_rupture`, `obesity_related`, `ear_infection_bacterial` | 74–78 |
| 2 | German Shepherd | 3 | `hip_dysplasia`, `degenerative_myelopathy`, `lumbosacral_disease` | 77–80 |
| 3 | Golden Retriever | 3 | `ccl_rupture`, `allergic_dermatitis`, `mast_cell_tumor` | 74–78 |
| 4 | French Bulldog | 3 | `difficulty_breathing`, `ivdd`, `heat_stroke` | 78–80 |
| 5 | Bulldog | 3 | `difficulty_breathing`, `allergic_dermatitis`, `cherry_eye` | 72–79 |
| 6 | Poodle | 3 | `addisons_disease`, `ear_infection_bacterial`, `bloat` | 72–79 |
| 7 | Beagle | 3 | `ear_infection_bacterial`, `epilepsy`, `obesity_related` | 72–76 |
| 8 | Rottweiler | 3 | `ccl_rupture`, `bone_cancer`, `hip_dysplasia` | 75–80 |
| 9 | German Shorthaired Pointer | 3 | `bloat`, `ccl_rupture`, `hip_dysplasia` | 72–76 |
| 10 | Dachshund | 3 | `ivdd`, `obesity_related`, `diabetes` | 72–80 |

## Safety rules

- Every record must carry `breed_id`, `breed`, `condition_label`, `domain`, and `trust_level`.
- Mixed-breed records are rejected by ingest unless a disambiguation tag is provided.
- The committed manifest remains observational only; it does not change deterministic triage logic or `src/lib/breed-risk.ts`.

## Verification targets

- `Golden Retriever limping` should rank a Golden Retriever orthopedic case above non-Golden rows in the offline breed smoke check.
- `French Bulldog breathing struggle in heat` should rank a French Bulldog airway or heat case.
- `Dachshund back pain shaking` should rank a Dachshund IVDD case.
