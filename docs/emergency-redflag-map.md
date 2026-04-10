# Emergency Red-Flag Canonical Map — PawVital AI

> **Version:** 1.0.0
> **Date:** 2026-04-10
> **Scope:** Deterministic emergency detection for dog triage.
> **Rule:** These red flags trigger IMMEDIATE emergency escalation. No LLM decision overrides.

---

## Design Principles

1. **Deterministic only.** Red flags are code-level boolean checks — no LLM inference.
2. **Fail-safe.** If a flag is ambiguous, escalate.
3. **Composable.** Multiple weak flags can combine to trigger emergency.
4. **Provenance-tracked.** Every flag has an evidence source.

---

## Emergency Family 1: RESPIRATORY FAILURE

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `blue_gums` | gum_color === "blue" | Merck Vet Manual — Cyanosis = immediate emergency |
| `pale_gums` | gum_color === "pale_white" | Merck Vet Manual — Pale MM = shock/anemia |
| `breathing_difficulty` | difficulty_breathing symptom + any of: breathing_rate > 40/min, open-mouth breathing, orthopnea | Merck Vet Manual — Dyspnea triage |
| `breathing_onset_sudden` | breathing_onset === "sudden" | Sudden respiratory distress = acute life threat |
| `stridor_present` | noisy/stridor breathing reported | Upper airway obstruction |

### Escalation Reason
Respiratory failure kills in minutes. Any single flag triggers ER referral.

### Disposition
"EMERGENCY — Seek immediate veterinary care. Your dog is showing signs of respiratory distress that can be life-threatening within minutes."

---

## Emergency Family 2: COLLAPSE / LOSS OF CONSCIOUSNESS

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `collapse` | collapse reported as symptom or answer | Merck Vet Manual — Collapse = emergency |
| `unresponsive` | consciousness_level === "unresponsive" | Altered mentation = emergency |
| `sudden_paralysis` | non-weight-bearing all four limbs or inability to stand | Acute neurologic emergency |

### Escalation Reason
Collapse indicates cardiovascular, neurologic, or metabolic failure.

### Disposition
"EMERGENCY — Your dog has collapsed or lost consciousness. This is a life-threatening emergency. Go to the nearest emergency vet immediately."

---

## Emergency Family 3: SEIZURE ACTIVITY

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `seizure_activity` | seizure reported, paddling, foaming, uncontrolled shaking | Veterinary Emergency & Critical Care |
| `seizure_prolonged` | seizure duration > 5 minutes or multiple in 24h | Status epilepticus = immediate threat |
| `post_ictal_prolonged` | post-seizure confusion > 30 minutes | Abnormal recovery |

### Escalation Reason
Status epilepticus causes brain damage and death if untreated.

### Disposition
"EMERGENCY — Your dog is having or has had seizures. If the seizure is ongoing or has lasted more than 5 minutes, this is critical. Go to emergency vet now."

---

## Emergency Family 4: GDV (BLOAT / GASTRIC DILATATION-VOLVULUS)

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `unproductive_retching` | unproductive_retching === true | Pathognomonic for GDV — surgical emergency |
| `rapid_onset_distension` | swollen_abdomen + onset "sudden" or "today" | GDV progression timeline |
| `bloat_with_restlessness` | swollen_abdomen + restlessness === true | Classic GDV presentation |
| `distended_abdomen_painful` | swollen_abdomen + abdomen_pain === true | GDV causes severe pain |

### Escalation Reason
GDV kills in 2-6 hours without surgery. Unproductive retching + bloated abdomen = GDV until proven otherwise.

### Disposition
"EMERGENCY — Your dog may have GDV (bloat), a life-threatening condition where the stomach twists. Go to emergency vet IMMEDIATELY. Call ahead so they can prepare for surgery."

---

## Emergency Family 5: TOXIN / POISONING

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `toxin_confirmed` | Known exposure to: xylitol, chocolate, grapes/raisins, rodenticide, antifreeze, ibuprofen, acetaminophen, marijuana | ASPCA Poison Control |
| `rat_poison_confirmed` | rat_poison_access === true OR exposure text matches rodenticide keywords | Anticoagulant rodenticide = delayed but fatal bleeding |
| `toxin_with_symptoms` | toxin_exposure + (vomiting OR trembling OR seizure_activity) | Active toxicosis |

### Escalation Reason
Toxins have time-critical antidotes. Minutes to hours matter.

### Disposition
"EMERGENCY — Your dog may have ingested a toxic substance. Call your vet or ASPCA Poison Control (888-426-4435) immediately. Do NOT induce vomiting unless directed by a professional."

---

## Emergency Family 6: SEVERE BLEEDING

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `large_blood_volume` | blood_amount === "mostly_blood" in vomit or stool | Hemorrhagic shock risk |
| `wound_deep_bleeding` | wound + active bleeding not controlled by pressure | Hemorrhage |
| `vomit_blood` | vomit_blood === true | Upper GI hemorrhage |
| `cough_blood` | coughing up blood | Pulmonary hemorrhage |
| `stool_blood_large` | large volume blood in stool | Hemorrhagic GE or coagulopathy |
| `bloody_diarrhea_puppy` | puppy + bloody diarrhea | Parvovirus or HGE — rapid decompensation |

### Escalation Reason
Hemorrhage leads to hypovolemic shock and death.

### Disposition
"EMERGENCY — Your dog is bleeding significantly. Apply direct pressure to any external wounds and go to the nearest emergency vet immediately."

---

## Emergency Family 7: HEATSTROKE

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `heatstroke_signs` | (panting_excessive OR difficulty_breathing) + heat exposure + (collapse OR bright_red_gums OR vomiting) | Merck Vet Manual — Heatstroke |
| `brachycephalic_heat` | Bulldog/Frenchie/Pug + heat exposure + breathing difficulty | Breed-specific vulnerability |

### Escalation Reason
Heatstroke causes multi-organ failure. Rectal temp > 106°F is critical.

### Disposition
"EMERGENCY — Your dog may have heatstroke. Begin cooling with cool (not ice-cold) water and go to emergency vet immediately."

---

## Emergency Family 8: ANAPHYLAXIS / SEVERE ALLERGIC REACTION

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `face_swelling` | facial swelling reported | Angioedema — airway compromise risk |
| `hives_widespread` | widespread hives + any systemic sign | Anaphylaxis |
| `allergic_with_breathing` | face_swelling OR hives + difficulty_breathing | Airway compromise = immediate ER |

### Escalation Reason
Anaphylaxis progresses to airway closure and cardiovascular collapse.

### Disposition
"EMERGENCY — Your dog is showing signs of a severe allergic reaction. Go to emergency vet immediately."

---

## Emergency Family 9: URINARY BLOCKAGE

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `urinary_blockage` | straining_to_urinate + no_urine_output + male_dog | Urethral obstruction — bladder rupture risk |
| `no_urine_24h` | known no urination for > 24 hours | Renal failure imminent |

### Escalation Reason
Urinary blockage causes bladder rupture and acute kidney failure.

### Disposition
"EMERGENCY — Your dog appears unable to urinate. This is a life-threatening blockage. Go to emergency vet immediately."

---

## Emergency Family 10: DYSTOCIA (BIRTHING DIFFICULTY)

### Trigger Criteria
| Flag | Condition | Source |
|------|-----------|--------|
| `dystocia_active` | active straining > 30 min without puppy delivery | Veterinary Obstetrics |
| `dystocia_interval` | > 2 hours between puppies with active straining | Prolonged inter-puppy interval |
| `green_discharge_no_puppy` | green/black discharge without puppy delivery | Placental separation — puppies in distress |
| `eclampsia` | nursing dam + trembling/seizure + weakness | Hypocalcemia — fatal if untreated |

### Escalation Reason
Dystocia kills both dam and puppies without intervention.

### Disposition
"EMERGENCY — Your dog is having difficulty giving birth. Go to emergency vet immediately."

---

## Composite Emergency Rules

Some emergencies are triggered by COMBINATIONS of flags, not single flags:

| Composite Rule | Flags Required | Emergency Family |
|---|---|---|
| GDV Classic | swollen_abdomen + unproductive_retching | GDV |
| GDV Early | swollen_abdomen + rapid_onset_distension + restlessness | GDV |
| Toxicosis Active | toxin_confirmed + (vomiting OR trembling) | Toxin |
| Anaphylaxis | face_swelling + breathing_difficulty | Anaphylaxis |
| Hemorrhagic Shock | large_blood_volume + pale_gums | Bleeding |
| Respiratory Emergency | difficulty_breathing + blue_gums | Respiratory |
| Heatstroke Confirmed | heat_exposure + (collapse OR bright_red_gums) | Heatstroke |
| Septic Shock | lethargy + pale_gums + fever + any infection source | Sepsis |
| Pyometra Emergency | intact_female + drinking_more + lethargy + vaginal_discharge | Pyometra |
| Puppy Critical | age < 12 weeks + (not_eating OR diarrhea OR lethargy) | Puppy decompensation |

---

## Red Flag to SYMPTOM_MAP Mapping

| Red Flag Key | Triggering Symptom(s) | Answer Field | Trigger Condition |
|---|---|---|---|
| blue_gums | difficulty_breathing, coughing, lethargy | gum_color | "blue" |
| pale_gums | blood_in_stool, lethargy, difficulty_breathing | gum_color | "pale_white" |
| breathing_onset_sudden | difficulty_breathing | breathing_onset | "sudden" |
| unproductive_retching | swollen_abdomen, vomiting | unproductive_retching | true |
| toxin_confirmed | vomiting, trembling, seizure_collapse | toxin_exposure | keyword match |
| rat_poison_confirmed | blood_in_stool | rat_poison_access | true or keyword match |
| large_blood_volume | blood_in_stool, vomiting | blood_amount | "mostly_blood" |
| collapse | lethargy, seizure_collapse, difficulty_breathing | (symptom key) | present |
| unresponsive | lethargy, trembling, seizure_collapse | consciousness_level | "unresponsive" |
| seizure_activity | trembling, seizure_collapse | (symptom key) | present |
| sudden_paralysis | limping, abnormal_gait | (answer) | present |
| face_swelling | excessive_scratching, medication_reaction | (answer) | present |
| hives_widespread | excessive_scratching, medication_reaction | (answer) | present |
| wound_deep_bleeding | wound_skin_issue | wound_discharge | "active_blood" |
| wound_bone_visible | wound_skin_issue | wound_depth | "bone_visible" |
| rapid_onset_distension | swollen_abdomen | abdomen_onset | "sudden"/"today" |
| eye_swollen_shut | eye_discharge | eye_appearance | "swollen_shut" |
| eye_bulging | eye_discharge | eye_appearance | "bulging" |
| sudden_blindness | vision_loss | onset | "sudden" |
| head_tilt_sudden | ear_scratching, abnormal_gait | head_tilt | true |
| balance_loss | ear_scratching, abnormal_gait | balance_issues | true |
| no_water_24h | not_eating, drinking_more | water_intake | "not_drinking" |
| pyometra_signs | drinking_more, vaginal_discharge | spay_status + symptoms | false female + signs |
| puppy_critical | puppy_concern | age + symptoms | < 12 weeks + signs |
| urinary_blockage | urination_problem | straining + output | true + none |
| dystocia_active | pregnancy_birth | straining_duration | > 30 min |

---

## Non-Emergency Override Prevention

The following must NEVER be downgraded to non-emergency:
1. Any triggered red flag from the 10 families above
2. Any composite emergency rule match
3. Puppy < 8 weeks with any symptom
4. Known toxin ingestion within 24 hours
5. Unproductive retching (pathognomonic for GDV)

---

## Next Steps

1. Implement these flags in `clinical-matrix.ts` as `RED_FLAG_CANONICAL`
2. Wire into `triage-engine.ts` `isRedFlagTriggered()` function
3. Add composite rule engine
4. Build test cases for each emergency family
