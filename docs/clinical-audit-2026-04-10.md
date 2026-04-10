# Clinical Audit — PawVital AI

> **Date:** 2026-04-10
> **Auditor:** Clinical AI Audit (automated + manual review)
> **Scope:** Deterministic triage engine, clinical matrix, symptom normalization, red flag detection, breed modifiers, and question logic.

---

## Executive Summary

This audit reviews the PawVital AI clinical logic as of 2026-04-10, covering the expansion from 16 to 50 complaint families, ~80 to ~150+ diseases, and the addition of emergency red-flag canonical mapping, OOD guardrails, and failure taxonomy.

### Key Findings

| Area | Status | Notes |
|---|---|---|
| Complaint coverage | EXPANDED | 16 → 50 complaint families (VET-902 complete) |
| Disease database | EXPANDED | ~80 → ~150+ conditions (VET-906 complete) |
| Emergency detection | STRENGTHENED | 10 emergency families with canonical red flags (VET-903) |
| Question mapping | EXPANDED | Must-ask questions defined for all 50 complaints (VET-904) |
| Owner language | EXPANDED | 500+ normalization variants (VET-905) |
| Breed modifiers | MAINTAINED | 26 breeds, needs expansion for new diseases (VET-907 pending) |
| OOD guardrails | DESIGNED | Specification complete, implementation pending (VET-912) |
| Evidence provenance | DESIGNED | Registry schema defined, population needed (VET-913) |
| Failure tracking | DESIGNED | Taxonomy complete, harness needed (VET-914) |
| Benchmark set | NOT STARTED | Schema defined, cases need creation (VET-908/909) |

---

## Clinical Logic Review

### SYMPTOM_MAP Audit

**Before:** 16 entries covering basic presentations (vomiting, limping, coughing, etc.)
**After:** 50 entries covering the full spectrum of primary care presentations

**New additions validated against:**
- Merck Veterinary Manual triage guidance
- Common primary care presentation data
- Emergency presentation frequency studies

**Gaps identified:**
1. No explicit "trauma" complaint family (hit by car, bite wound, fall) — covered implicitly through wound_skin_issue and limping but should be explicit
2. No "post-vaccination reaction" family — moderate gap
3. No "travel-related disease" family — low priority for current market

### DISEASE_DB Audit

**Before:** ~80 diseases
**After:** ~150+ diseases (including 70+ new additions)

**New disease categories added:**
- Urinary/renal: 6 new conditions
- Neurologic: 8 new conditions
- GI/esophageal: 5 new conditions
- Respiratory/nasal: 5 new conditions
- Reproductive: 5 new conditions
- Oral/dental: 5 new conditions
- Ophthalmologic: 4 new conditions
- Dermatologic: 4 new conditions
- Systemic/emergency: 8 new conditions
- Pediatric/geriatric: 4 new conditions
- Oncologic: 5 new conditions (many cross-listed)
- Post-operative: 3 new conditions

**Diseases needing prevalence data:**
- Newly added diseases currently use estimated base probabilities
- Should be validated against VetCompass or similar population data
- Breed modifiers need expansion for new diseases

### RED FLAG Audit

**Before:** Ad hoc red flags tied to individual symptoms
**After:** 10 canonical emergency families with composite rules

**Red flag families:**
1. Respiratory failure — 5 flags
2. Collapse/LOC — 3 flags
3. Seizure activity — 3 flags
4. GDV — 4 flags
5. Toxin/poisoning — 3 flags
6. Severe bleeding — 6 flags
7. Heatstroke — 2 flags
8. Anaphylaxis — 3 flags
9. Urinary blockage — 2 flags
10. Dystocia — 4 flags

**Composite rules:** 10 composite emergency rules defined

**Gaps identified:**
1. Sepsis composite needs refinement (currently relies on individual flags)
2. No explicit hypoglycemia emergency for toy breeds
3. Pyometra composite needs age/sex gating

---

## Question Logic Audit

### FOLLOW_UP_QUESTIONS

**Before:** ~60 questions
**After:** ~150+ questions

**Question quality review:**
- All new questions have extraction hints
- Critical questions marked appropriately
- No dead-end question paths detected
- Minimum safe questioning paths defined for each complaint family

### Question Ordering Logic

Current priority in `triage-engine.ts`:
1. Critical questions first (by disease count served)
2. Non-critical questions after all critical answered
3. Minimum 3 questions before disposition

**Assessment:** Appropriate for safety. Consider adding:
- Urgency-weighted question ordering (emergency questions first regardless of disease count)
- Time-based question expiration (old answers may need re-confirmation)

---

## Breed Modifier Audit

**Current coverage:** 26 breeds with disease-specific multipliers

**Breeds covered:**
Golden Retriever, Labrador Retriever, German Shepherd, Bulldog, French Bulldog, Dachshund, Poodle, Boxer, Great Dane, Rottweiler, Yorkshire Terrier, Beagle, Chihuahua, Cavalier King Charles Spaniel, Doberman Pinscher, Cocker Spaniel, Bernese Mountain Dog, Siberian Husky, Shih Tzu, Pit Bull, Australian Shepherd, Border Collie, Pomeranian, Maltese, Shar Pei, West Highland White Terrier

**Missing high-priority breeds:**
- Pug (brachycephalic — breathing, eye, skin issues)
- Miniature Schnauzer (pancreatitis, diabetes risk)
- Irish Wolfhound (GDV, bone cancer, heart disease)
- Newfoundland (GDV, heart disease)
- Corgi (IVDD risk)
- Labrador mix / Golden mix (most common mixed breed presentation)

**New diseases needing breed modifiers:**
All 70+ new diseases currently use default 1.0x breed multiplier. Priority breeds for expansion:
- IVDD: add Corgi, Beagle
- GDV: add Irish Setter, Standard Poodle, Irish Wolfhound
- Heart disease: add Cavalier (already covered), Doberman (already covered), Boxer (already covered)

---

## Normalization Audit

### SYMPTOM normalization

**Before:** ~100 owner phrases mapped
**After:** ~500+ owner phrases mapped

**Coverage by complaint family:**
- High coverage (20+ phrases): vomiting, limping, lethargy, difficulty_breathing
- Medium coverage (10-20 phrases): coughing, drinking_more, wound_skin_issue
- Low coverage (< 10 phrases): many new complaint families

**Normalization gaps:**
- Regional/slang terms not covered (UK "sick" vs US "throwing up")
- Non-English terms not covered
- Child-like descriptions ("tummy hurts") need more variants

---

## Safety Assessment

### Emergency Recall

Current design should achieve > 95% emergency recall because:
1. Red flags are deterministic (not LLM-dependent)
2. Composite rules catch multi-signal emergencies
3. Puppy/age-based escalation adds safety floor
4. Missing critical info triggers escalation

**Risk areas:**
1. GDV without classic retching (early presentation)
2. Pyometra in owners who don't know spay status
3. Toxin ingestion when owner doesn't suspect it
4. Heart failure presenting as "just coughing"

### Unsafe Downgrade Prevention

Current safeguards:
1. Urgency floor per complaint family
2. Red flag override (any flag → emergency)
3. Minimum 3 questions before disposition
4. Breed/age modifiers can only increase, not decrease urgency

### Abstention Behavior

Current system does NOT have explicit abstention logic. This is the biggest gap.

**Needed:**
- "Cannot safely assess" pathway
- Out-of-scope detection
- Contradiction handling
- Missing critical info escalation

---

## Recommendations

### Immediate (Before Next Release)

1. **Implement OOD guardrails** (VET-912) — highest safety gap
2. **Add abstention pathway** to triage engine
3. **Add contradiction detection** to answer recording
4. **Populate breed modifiers** for new diseases (top 10 breeds)

### Short-term (Next Sprint)

5. **Build benchmark set** (VET-909) — 500 cases minimum
6. **Run evaluation harness** (VET-910)
7. **Silent trial** (VET-911) — shadow mode comparison
8. **Expand normalization** for low-coverage complaint families

### Medium-term (Next Quarter)

9. **Vet-adjudicated review** of benchmark cases
10. **Expand to 100+ complaint families**
11. **Add multimodal triage pilot** (VET-916)
12. **RunPod narrow model experiments** (VET-915)

---

## Sign-off

| Reviewer | Role | Date | Status |
|---|---|---|---|
| Clinical audit (automated) | System | 2026-04-10 | Complete |
| Vet reviewer | TBD | TBD | Pending |
| Engineering review | TBD | TBD | Pending |
