# VET-1402 Emergency Sentinel Notes

## Scope

This ticket adds a deterministic emergency sentinel scaffold only. It does not
wire the sentinel into the live symptom-check route, does not change model or
RAG behavior, and does not change UI/API behavior.

The sentinel is limited to urgency guidance, vet handoff readiness, and
emergency screening.

## Baseline Captured Before Implementation

Command:

```bash
node scripts/eval-question-quality.ts
```

Result:

```text
Total cases: 150
Average question score: 2.50 / 3.00
Generic question rate: 3.0%
Emergency red-flag miss rate: 56.0%
First-question emergency-screen rate: 44.0%
Repeated-question rate: 0.0%
```

Top missed red-flag patterns used to shape the sentinel regression tests:

```text
collapse_or_weakness: 131 cases
pale_or_blue_gums: 90 cases
breathing_difficulty: 62 cases
repeated_vomiting: 58 cases
not_drinking: 49 cases
fracture_or_bone_exposure: 27 cases
non_weight_bearing: 19 cases
facial_swelling: 12 cases
head_tilt_balance: 7 cases
active_bleeding: 6 cases
eye_swelling: 6 cases
toxin_exposure: 6 cases
unproductive_retching: 6 cases
coughing_blood: 5 cases
intact_female_discharge: 5 cases
straining_with_no_urine: 5 cases
```

## Sentinel Behavior

The sentinel exposes pure helpers under `src/lib/clinical-intelligence/`:

```text
evaluateEmergencySentinel(caseState, options?)
getEmergencyScreenRules()
matchEmergencyRules(caseState, rules?)
getMissingEmergencyRedFlags(caseState, complaintModule?)
chooseEmergencyScreenQuestion(caseState, complaintModule?)
isEmergencyPositive(caseState)
```

Decision rules:

```text
Positive canonical emergency red flag -> emergency_result.
currentUrgency === "emergency" -> emergency_result.
Unknown or not_sure required critical red flags -> ask_emergency_screen.
High/critical clinical signals -> ask confirmation screen, without writing explicit answers.
proceed_to_module only after required active-complaint sentinel red flags are resolved and no emergency signal remains.
```

Returned question IDs are validated through `getQuestionCardById(id)`.
They must also match the internal question-card ID shape before lookup. If a
specific card is missing from the registry, the sentinel falls back to
`emergency_global_screen`.

The sentinel does not build prompts, call models, call RAG, write telemetry, or
return owner copy from the question-card registry. It returns compact structured
actions only: the selected action, registered question ID when screening is
needed, internal reason codes, matched categories, and red-flag IDs needed by
the next deterministic step.

The emergency rule tables are static internal constants. Question IDs are not
accepted from owner input, are shape-checked before registry lookup, and are not
used to build SQL, prompts, telemetry payloads, or external requests.

## Registered Question Cards

The sentinel returns only registered question-card IDs:

```text
emergency_global_screen
gum_color_check
breathing_difficulty_check
collapse_weakness_check
toxin_exposure_check
bloat_retching_abdomen_check
urinary_blockage_check
seizure_neuro_check
skin_emergency_allergy_screen
gi_vomiting_frequency
gi_blood_check
gi_keep_water_down_check
panting_excess_check
brachycephalic_breed_check
bleeding_volume_check
laceration_depth_check
limping_weight_bearing
limping_trauma_onset
```

Heat screening uses `panting_excess_check`, `breathing_difficulty_check`,
`collapse_weakness_check`, `gum_color_check`, or `emergency_global_screen`.
`heat_exposure_check` remains history context and is not used as the main heat
emergency-screen card.

## Production Wiring

None. This is scaffold-only. Live symptom-check behavior should be changed only
by a later reviewed integration ticket.
