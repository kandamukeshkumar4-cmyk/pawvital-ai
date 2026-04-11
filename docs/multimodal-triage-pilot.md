# Multimodal Dog Triage Pilot — VET-916

## Overview

End-to-end demonstration of PawVital's multimodal wound triage capabilities:
1. **Image Upload** → Vision pipeline classifies wound characteristics
2. **Breed Detection** → Breed-specific risk modifiers applied to urgency
3. **Clinical Matrix Integration** → Vision-derived symptoms feed deterministic triage logic
4. **Confidence Transparency** → Model confidence scores with actionable guidance
5. **Temporal Wound Tracking** → Multi-image comparison for progression monitoring

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  PawVital Multimodal Triage                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  User uploads wound photo ──→ Image Gate (quality check)    │
│                                   │                          │
│                                   ▼                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Vision Pipeline                        │   │
│  │                                                     │   │
│  │  Tier 1: Llama 3.2 11B ──→ Wound detection         │   │
│  │  Tier 2: Llama 3.2 90B ──→ Detailed analysis       │   │
│  │  Tier 3: Kimi K2.5 ──→ Complex reasoning           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                   │                          │
│                                   ▼                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Breed Risk Modifiers                      │   │
│  │                                                     │   │
│  │  Golden Retriever: 1.3x infection, 3x hot spots    │   │
│  │  Boxer: 2.5x skin mass risk (HIGHEST)              │   │
│  │  French Bulldog: 2.8x allergy likelihood           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                   │                          │
│                                   ▼                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Clinical Matrix (Deterministic)          │   │
│  │                                                     │   │
│  │  wound_skin_issue symptom triggers:                 │   │
│  │  - Wound-specific follow-up questions               │   │
│  │  - Urgency tier calculation                         │   │
│  │  - Red flag evaluation                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                   │                          │
│                                   ▼                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Confidence Scoring                        │   │
│  │                                                     │   │
│  │  Vision confidence (30%) + Image quality (20%) +    │   │
│  │  Breed match (10%) + Matrix agreement (10%) =       │   │
│  │  Total confidence score                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                   │                          │
│                                   ▼                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Temporal Tracking (Optional)                │   │
│  │                                                     │   │
│  │  Compare multiple images over time:                 │   │
│  │  - Size change percentage                           │   │
│  │  - Discharge improvement                            │   │
│  │  - Color/swelling trends                            │   │
│  │  - Progression recommendation                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Breed Risk Modifiers

The pilot includes breed-specific risk modifiers for 8 common breeds:

| Breed | Infection Risk | Hot Spot Risk | Skin Mass Risk | Allergy Risk | Urgency Boost |
|-------|---------------|---------------|----------------|--------------|---------------|
| Golden Retriever | 1.3x | 3.0x | 1.8x | 2.5x | Moderate |
| Labrador | 1.2x | 2.8x | 1.5x | 2.2x | Moderate |
| Bulldog | 1.5x | 2.5x | 1.2x | 1.8x | High |
| French Bulldog | 1.4x | 2.0x | 1.1x | 2.8x | High |
| German Shepherd | 1.2x | 1.5x | 1.3x | 1.5x | Moderate |
| Boxer | 1.3x | 1.8x | 2.5x | 2.0x | High |
| Pitbull | 1.4x | 1.5x | 1.5x | 3.0x | Moderate |
| Husky | 1.1x | 1.3x | 1.2x | 1.5x | Low |

**Urgency Boost Logic:**
- `none`: No change to base urgency
- `low`: Can bump monitor→vet_soon in edge cases
- `moderate`: Bumps monitor→vet_soon, vet_soon→vet_24h
- `high`: Bumps up to 2 levels (monitor→vet_24h)

## Usage

### Demo Mode (No Live Dependencies)

```bash
npm run multimodal:demo
# or
node scripts/multimodal-triage-pilot.mjs --demo
```

This runs with simulated triage data to demonstrate:
- Breed risk modifier application
- Confidence score computation
- Temporal wound tracking
- Report generation

### Live Mode (Requires Running App)

```bash
# Single image triage
node scripts/multimodal-triage-pilot.mjs --image=path/to/wound.jpg --breed=golden_retriever

# Multiple images with temporal tracking
node scripts/multimodal-triage-pilot.mjs --images=day1.jpg,day2.jpg,day3.jpg --track-temporal
```

### Output

The pilot generates a JSON report at `data/multimodal-triage-report.json` containing:
- Patient profile with breed context
- Triage result with breed-modified urgency
- Confidence score breakdown
- Temporal analysis (if multiple images)

## Confidence Score Breakdown

| Component | Weight | Description |
|-----------|--------|-------------|
| Vision Confidence | 30% | Model confidence in wound classification |
| Image Quality | 20% | Blur score, lighting, angle |
| Breed Match | 10% | Whether breed-specific modifiers are available |
| Matrix Agreement | 10% | Clinical matrix found matching diseases |
| **Baseline** | **50%** | Minimum confidence score |
| **Maximum** | **100%** | All components optimal |

**Confidence Thresholds:**
- `< 70%`: Low confidence - recommend better image or in-person exam
- `70-85%`: Moderate confidence - results reliable but monitor for changes
- `> 85%`: High confidence - results reliable for triage decisions

## Integration Points

This pilot validates the following integrations:

1. **Vision Pipeline → Clinical Matrix**
   - `parseVisionForMatrix()` extracts symptoms from vision output
   - `wound_skin_issue` symptom triggers wound-specific logic

2. **Breed Detection → Urgency Calculation**
   - Nyckel breed detection feeds risk modifiers
   - Risk modifiers can bump urgency tier

3. **Image Gate → Triage Pipeline**
   - Quality check before vision analysis
   - Guides user to retake if needed

4. **Async Review → Shadow Disagreement**
   - 7B vs 32B comparison for complex cases
   - Disagreement drives routing decisions

5. **Temporal Tracking → Progress Monitoring**
   - Multi-image comparison over time
   - Wound evolution detection

## Future Enhancements

1. **Real-time Image Quality Feedback**
   - Guide user to retake blurry/dark images
   - Show bounding boxes for wound area

2. **Multi-modal Differential Diagnosis**
   - Combine vision findings with clinical history
   - Show top 3 differentials with breed-specific probabilities

3. **Reference Case Matching**
   - Show similar cases from database
   - "95% of similar Golden Retriever lacerations resolved with oral antibiotics"

4. **Veterinary Handoff Report**
   - Structured PDF with:
     - Breed risk context
     - Wound classification
     - Confidence scores
     - Temporal progression
     - Images + analysis

5. **Expanded Breed Coverage**
   - Add all 50 complaint families' breed modifiers
   - Dynamic modifier calculation from breed database

## Files Created

| File | Purpose |
|------|---------|
| `scripts/multimodal-triage-pilot.mjs` | Main pilot script |
| `data/multimodal-triage-report.json` | Generated report (demo) |
| `data/multimodal-triage-live-report.json` | Generated report (live) |
| This file | Documentation |

## Testing

Run the demo to verify all components work:

```bash
npm run multimodal:demo
```

Expected output:
- Triage result with breed-modified urgency
- Confidence score 75-90%
- Temporal tracking report
- JSON report file generated

## Related

- VET-909: Gold Benchmark Dataset (575 cases)
- VET-910: Evaluation Harness
- VET-911: Silent Trial Framework
- VET-915: RunPod Narrow Model Pack
- `src/lib/nvidia-models.ts`: Vision pipeline implementation
- `src/lib/clinical-matrix.ts`: Deterministic triage logic
- `services/multimodal-consult-service/`: 7B specialist sidecar
- `services/async-review-service/`: 32B async review sidecar
