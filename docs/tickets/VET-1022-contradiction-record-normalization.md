# VET-1022 - Contradiction Record Normalization

## Goal

Normalize contradiction telemetry into a durable internal record shape without changing owner-facing behavior or leaking new fields into client payloads.

## Scope

- Enrich text contradiction detections with normalized metadata
- Persist normalized contradiction records in internal telemetry only
- Keep `ambiguity_flags` and response payload shape unchanged
- Strip normalized records from client-visible `service_observations`

## Normalized Record Shape

Each internal contradiction record carries:

- `contradiction_type`
- `severity`
- `resolution`
- `source_pair`
- `affected_key`
- `turn_number`

## Validation

- `npx jest tests/clinical.contradiction-detector.test.ts --runInBand`
- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "contradiction|payload"`
- `npm run build`
