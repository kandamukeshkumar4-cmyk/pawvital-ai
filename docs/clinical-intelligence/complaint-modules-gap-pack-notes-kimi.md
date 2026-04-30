# VET-1418K Complaint Module Gap Pack Notes — Kimi

## Scope
Added two complaint modules to cover the highest-risk missing gaps identified in the clinical module audit:

1. **bloat_gdv** — Bloat / GDV / Abdominal Distension
2. **collapse_weakness** — Collapse / Weakness / Fainting

## Files Changed
- `src/lib/clinical-intelligence/complaint-modules/bloat-gdv.ts` (new)
- `src/lib/clinical-intelligence/complaint-modules/collapse-weakness.ts` (new)
- `src/lib/clinical-intelligence/complaint-modules/index.ts` (updated exports and registry)
- `tests/clinical-intelligence/complaint-modules-gap-pack.test.ts` (new)
- `docs/clinical-intelligence/complaint-modules-gap-pack-notes-kimi.md` (new)

## Constraints Followed
- Did not touch `triage-engine.ts`, `clinical-matrix.ts`, symptom-chat route, `symptom-memory.ts`, vet-knowledge files, or planner wiring.
- Did not add emergency sentinel logic or runtime behavior.
- No diagnosis/treatment language used in module metadata.
- All question IDs used exist in `question-card-registry.ts`.
- All red flag IDs used exist in `emergency-red-flags.ts` or are emitted by existing question cards.
- All signal IDs used exist in `clinical-signal-detector.ts`.
- Modules are exported from the registry but are not wired into any new runtime behavior.

## Module Details

### bloat_gdv
- **Triggers:** bloat, swollen belly, swollen abdomen, hard abdomen, retching, trying to vomit, nothing comes up, restless, distended belly
- **Aliases:** gastric dilatation, gdv, stomach bloat, bloated abdomen, tight belly
- **Emergency screen:** `bloat_retching_abdomen_check`, `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`
- **Stop conditions:**
  - `bloat_gdv_emergency` — red flags: `gastric_dilatation_volvulus`, `unproductive_retching`, `rapid_onset_distension`, `bloat_with_restlessness`, `distended_abdomen_painful`, `collapse`, `pale_gums`
  - `bloat_gdv_signal` — signals: `possible_bloat_gdv`, `possible_nonproductive_retching`
  - `bloat_gdv_enough_for_report` — questions: `bloat_retching_abdomen_check`, `emergency_global_screen`, `gum_color_check`, `collapse_weakness_check`
  - `bloat_gdv_continue`

### collapse_weakness
- **Triggers:** collapse, collapsed, fainted, weak, extreme weakness, cannot stand, unresponsive, pale gums
- **Aliases:** syncope, fainting episode, severe weakness, unable to walk
- **Emergency screen:** `collapse_weakness_check`, `emergency_global_screen`, `gum_color_check`, `breathing_difficulty_check`
- **Stop conditions:**
  - `collapse_weakness_emergency` — red flags: `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty`
  - `collapse_weakness_signal` — signals: `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`
  - `collapse_weakness_enough_for_report` — questions: `collapse_weakness_check`, `emergency_global_screen`, `gum_color_check`, `breathing_difficulty_check`
  - `collapse_weakness_continue`

## Validation
Run the following commands to validate:
- `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-gap-pack.test.ts`
- `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-mvp.test.ts`
- `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack2.test.ts`
- `npm test -- --runTestsByPath tests/clinical-intelligence/complaint-modules-pack3.test.ts`
- `npx eslint src/lib/clinical-intelligence/complaint-modules tests/clinical-intelligence/complaint-modules-gap-pack.test.ts`
- `npm run build`

## Notes
- Both modules use only existing question-card IDs and canonical/emitted red-flag IDs.
- Matcher tests include boundary-aware negative cases to prevent substring false positives (e.g., `bloat` does not match `bloated`, `weak` does not match `weakness`, `retching` does not match `stretching`).
- Safety notes consistently mention veterinary escalation without implying diagnosis or treatment.
