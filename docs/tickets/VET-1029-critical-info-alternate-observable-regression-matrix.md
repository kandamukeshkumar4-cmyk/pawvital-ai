# VET-1029 — Critical Info and Alternate Observable Regression Matrix

## Scope

Add deterministic route-level regression coverage for the current critical-info uncertainty behavior without changing runtime code.

## Added Matrix Coverage

- Missing critical info still blocks report readiness even after three other respiratory answers are present.
- The supported alternate-observable path remains limited to `gum_color`, with one retry before `cannot_assess`.
- Unsupported emergency-screen unknowns such as `breathing_onset` and `consciousness_level` stay on the direct `cannot_assess` path.

## Validation

- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "VET-1029|alternate|critical info|cannot_assess"`
