# Complaint Modules Heat + Trauma Pack (VET-1421K)

## Overview
This pack adds two new complaint modules to the clinical-intelligence complaint-module registry:

1. **heatstroke_heat_exposure** — for heatstroke, overheating, hot-car exposure, heavy panting, and heat-related collapse.
2. **trauma_bleeding_wound** — for trauma, bleeding, lacerations, bite wounds, hit-by-car, and external injuries.

## Files Added / Modified

- `src/lib/clinical-intelligence/complaint-modules/heatstroke.ts` (new)
- `src/lib/clinical-intelligence/complaint-modules/trauma-bleeding.ts` (new)
- `src/lib/clinical-intelligence/complaint-modules/index.ts` (updated — imports + exports + `ALL_MODULES`)
- `tests/clinical-intelligence/complaint-modules-heat-trauma-pack.test.ts` (new — 29 tests)
- `docs/clinical-intelligence/complaint-modules-heat-trauma-pack-notes-kimi.md` (this file)

## Design Decisions

### Question-card reuse
Neither heatstroke nor trauma has dedicated characterization question cards in the current registry. Therefore, both modules reuse existing emergency screen cards across all phases:

- `emergency_global_screen`
- `gum_color_check`
- `collapse_weakness_check`
- `breathing_difficulty_check`

This is a deliberate reuse decision to avoid inventing non-existent question IDs.

### Red-flag and signal IDs used
All red-flag and signal IDs were verified against the real registry before inclusion:

**Heatstroke red flags:** `heatstroke_signs`, `brachycephalic_heat`, `collapse`, `breathing_difficulty`, `pale_gums`, `blue_gums`
**Heatstroke signals:** `possible_heat_stroke`, `possible_collapse_or_weakness`, `possible_breathing_difficulty`

**Trauma red flags:** `large_blood_volume`, `wound_deep_bleeding`, `collapse`, `unresponsive`, `pale_gums`, `blue_gums`, `breathing_difficulty`
**Trauma signals:** `possible_trauma`, `possible_collapse_or_weakness`, `possible_pale_gums`, `possible_blue_gums`, `possible_breathing_difficulty`

### Trigger design
- **Heatstroke triggers:** `heat stroke`, `heatstroke`, `overheating`, `hot car`, `heavy panting`, `too hot`, `collapsed in heat`, `overheated`
- **Heatstroke aliases:** `heat exhaustion`, `heat injury`, `brachycephalic heat`
- **Trauma triggers:** `bleeding`, `bleed`, `wound`, `cut`, `laceration`, `injury`, `trauma`, `hit by car`, `car accident`, `fight wound`, `bite wound`, `scratch`, `abrasion`, `blood`
- **Trauma aliases:** `hemorrhage`, `penetrating wound`, `open wound`, `external injury`

### Safety notes
All safety notes direct the user to seek veterinary care and do not contain diagnosis/treatment language. They passed `hasDiagnosisOrTreatmentLanguage()` validation.

## Test Results
Run the pack-specific tests with:

```bash
npx jest tests/clinical-intelligence/complaint-modules-heat-trauma-pack.test.ts --verbose
```

Run all complaint-module regression tests with:

```bash
npx jest tests/clinical-intelligence/complaint-modules --verbose
```

## Validation
Run structural validation with:

```bash
node -e "require('ts-node/register'); const { validateComplaintModules } = require('./src/lib/clinical-intelligence/complaint-modules'); const { getAllQuestionCards } = require('./src/lib/clinical-intelligence/question-card-registry'); validateComplaintModules(getAllQuestionCards().map(c => c.id)).then(r => console.log(JSON.stringify(r, null, 2)))"
```

## Notes for Future Enhancement
- When dedicated heatstroke characterization cards (e.g., body temperature, panting severity, exposure duration) are added to the registry, the `characterize` and `timeline` phases should be updated to include them.
- When dedicated trauma characterization cards (e.g., wound location, bleeding rate, lameness check) are added, the `characterize` and `discriminate` phases should be updated.
