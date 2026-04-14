# VET-1025 - Critical Info Rule Registry Extraction

## Summary

- extracted the report-blocking critical-info decision path from `route.ts` into `src/lib/clinical/critical-info-rules.ts`
- kept the route-backed behavior unchanged by delegating the ambiguous critical-answer decision to a deterministic registry helper
- added focused regression coverage for a registry-managed immediate `cannot_assess` case

## Extracted Rule Surface

The new registry currently owns three report-blocking critical question IDs:

- `breathing_onset` - immediate `cannot_assess` when the owner cannot confirm it
- `consciousness_level` - immediate `cannot_assess` when the owner cannot confirm it
- `gum_color` - allows one alternate observable retry, then escalates to `cannot_assess`

## Notes

- the registry stays deterministic and does not move any medical decisions into the LLM layer
- `route.ts` still owns session mutation, telemetry, and response assembly, but it no longer holds the rule-selection branch inline
