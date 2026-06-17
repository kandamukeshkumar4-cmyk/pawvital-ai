# VET-1563 Model Routing Evaluation Matrix

Mode: review-only-routing-readout

| Role | Current primary | Fallback | Runtime surface | Promotion gate |
|---|---|---|---|---|
| extraction | current-runtime-extraction-route | deterministic extraction fallback | src/lib/symptom-chat/answer-extraction.ts | separate VET-1563 promotion ticket after scorecard, hashes, owner approval, and smoke |
| phrasing | current-runtime-phrasing-route | deterministic clinical question wording | src/lib/symptom-chat/question-phrasing.ts | separate promotion ticket with owner-facing claim review |
| phrasing_verifier | current-runtime-verifier-route | deterministic required-question checks | src/lib/symptom-chat/final-safety-verifier.ts | separate promotion ticket with blocker false-pass proof |
| diagnosis | current-runtime-report-route | deterministic clinical matrix report support | src/lib/symptom-chat/report-pipeline.ts | separate promotion ticket; clinical matrix remains authority |
| safety | current-runtime-safety-route | deterministic safety copy guard | src/lib/symptom-chat/final-safety-verifier.ts | separate promotion ticket with emergency no-downgrade proof |
| vision_fast | current-runtime-vision-fast-route | text-only clinical triage | src/lib/nvidia-models.ts | separate vision-sidecar promotion ticket; text gates remain authority |
| vision_detailed | current-runtime-vision-detailed-route | text-only clinical triage | src/lib/nvidia-models.ts | separate vision-sidecar promotion ticket; text gates remain authority |
| vision_deep | current-runtime-vision-deep-route | text-only clinical triage | src/lib/nvidia-models.ts | separate vision-sidecar promotion ticket; text gates remain authority |

This artifact is review-only and does not authorize runtime routing changes.
