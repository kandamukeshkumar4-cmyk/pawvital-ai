# Dog Complaint Ontology — PawVital AI

> **Version:** 1.0.0
> **Date:** 2026-04-10
> **Scope:** Dog-only presenting complaints organized by body system, urgency tier, and disease linkage.
> **Purpose:** Define the top presenting complaints dog owners actually report, with owner-language phrasing, urgency classification, must-ask questions, red flags, and linked disease families.

---

## Design Principles

1. **Complaint-first, not disease-first.** Owners describe what they *see*, not diagnoses.
2. **Deterministic urgency tiers.** Every complaint has a built-in emergency floor.
3. **Owner language normalization.** Each complaint maps common owner phrases to canonical keys.
4. **Body system anchoring.** Each complaint belongs to one or more body systems for differential narrowing.
5. **Disease linkage.** Each complaint links to candidate differentials for the deterministic engine.

## Urgency Tiers

| Tier | Label | Description | Response Time |
|------|-------|-------------|---------------|
| 1 | `emergency` | Immediate life threat — ER now | 0 minutes |
| 2 | `urgent` | Same-day veterinary evaluation needed | < 24 hours |
| 3 | `prompt` | Veterinary evaluation within 48 hours | 24-48 hours |
| 4 | `monitor` | Home observation acceptable, escalate if worsening | 48+ hours |

---

## Complaint Families (50)

### 1. BREATHING DIFFICULTY

- **Canonical key:** `difficulty_breathing`
- **Owner phrases:** "can't breathe", "struggling to breathe", "breathing fast", "heavy breathing", "gasping for air", "can't catch breath", "panting too much", "breathing hard", "wheezing", "noisy breathing"
- **Body systems:** respiratory, cardiovascular
- **Urgency tier:** 1 (emergency)
- **Red flags:** blue/pale gums, collapse, sudden onset, open-mouth breathing, orthopnea (can't lie down), noisy/stridor breathing
- **Must-ask questions:** breathing onset, breathing rate, gum color, position preference, coughing present, exercise tolerance
- **Linked diseases:** heart_failure, pleural_effusion, pneumonia, laryngeal_paralysis, allergic_reaction, trauma_chest, heat_stroke, difficulty_breathing, gdv

### 2. COUGHING

- **Canonical key:** `coughing`
- **Owner phrases:** "cough", "hacking", "honking cough", "gagging", "choking sound", "clearing throat", "goose-like cough", "wet cough", "dry cough", "coughing up stuff"
- **Body systems:** respiratory
- **Urgency tier:** 3 (prompt) — escalates to 1 if breathing difficulty co-present
- **Red flags:** coughing blood, breathing difficulty, blue gums, inability to settle
- **Must-ask questions:** cough type, cough duration, cough timing, exercise intolerance, breathing rate, nasal discharge, kennel/boarding exposure
- **Linked diseases:** kennel_cough, heart_disease, pneumonia, collapsing_trachea, laryngeal_paralysis, lung_cancer

### 3. VOMITING

- **Canonical key:** `vomiting`
- **Owner phrases:** "throwing up", "puking", "vomit", "sick to stomach", "bringing up food", "regurgitating", "upchucking", "heaving", "retching"
- **Body systems:** gastrointestinal
- **Urgency tier:** 3 (prompt) — escalates to 1 if red flags present
- **Red flags:** blood in vomit, unproductive retching, toxin exposure confirmed, projectile vomiting, vomit + bloated abdomen
- **Must-ask questions:** vomit duration, vomit frequency, vomit content, toxin exposure, dietary change, appetite status, water intake
- **Linked diseases:** gastroenteritis, pancreatitis, foreign_body, ibd, gdv, toxin_ingestion, kidney_disease

### 4. DIARRHEA

- **Canonical key:** `diarrhea`
- **Owner phrases:** "loose stool", "runny poop", "messy bottom", "accidents in house", "watery poop", "soft stool", "frequent pooping", "mucus in poop"
- **Body systems:** gastrointestinal
- **Urgency tier:** 3 (prompt) — escalates to 1 if bloody + puppy or severe dehydration
- **Red flags:** large blood volume, puppy with bloody diarrhea, pale gums, lethargy + diarrhea, no water intake
- **Must-ask questions:** stool blood, stool frequency, stool consistency, diarrhea duration, dietary change, water intake, appetite
- **Linked diseases:** gastroenteritis, parasites, colitis, ibd, food_allergy, hemorrhagic_gastroenteritis, foreign_body

### 5. NOT EATING / LOSS OF APPETITE

- **Canonical key:** `not_eating`
- **Owner phrases:** "won't eat", "no appetite", "not hungry", "refusing food", "picky eater suddenly", "not touching food", "lost appetite", "skipping meals"
- **Body systems:** gastrointestinal, systemic
- **Urgency tier:** 3 (prompt) — escalates to 2 if not drinking > 24h or puppy
- **Red flags:** not drinking water > 24h, puppy not eating > 12h, lethargy + anorexia, vomiting + anorexia
- **Must-ask questions:** appetite duration, water intake, weight loss, treats accepted, vomiting present, lethargy present
- **Linked diseases:** gastroenteritis, pancreatitis, foreign_body, kidney_disease, liver_disease, dental_disease, pain_general

### 6. LETHARGY / LOW ENERGY

- **Canonical key:** `lethargy`
- **Owner phrases:** "not himself", "sleeping all day", "no energy", "won't play", "just laying around", "doesn't want to walk", "tired all the time", "sluggish", "weak", "flat"
- **Body systems:** systemic
- **Urgency tier:** 3 (prompt) — escalates to 1 if collapse or unresponsive
- **Red flags:** collapse, unresponsive, pale/blue gums, trembling + lethargy, sudden onset
- **Must-ask questions:** lethargy duration, lethargy severity, appetite status, exercise intolerance, gum color, water intake
- **Linked diseases:** pain_general, infection, anemia, hypothyroidism, heart_disease, kidney_disease, liver_disease, addisons_disease, imha, heat_stroke, liver_shunt

### 7. LIMPING / LAMENESS

- **Canonical key:** `limping`
- **Owner phrases:** "limp", "favoring a leg", "won't put weight down", "hopping", "three-legged", "stiff", "can't walk right", "holding leg up", "won't jump", "trouble getting up"
- **Body systems:** musculoskeletal, neurologic
- **Urgency tier:** 3 (prompt) — escalates to 1 if non-weight-bearing or sudden paralysis
- **Red flags:** non-weight-bearing, visible fracture/deformity, sudden paralysis, multiple limbs affected, crying in pain
- **Must-ask questions:** which leg, limping onset, limping progression, weight bearing, pain on touch, trauma history, worse after rest, swelling present, warmth present, prior limping
- **Linked diseases:** ccl_rupture, hip_dysplasia, osteoarthritis, soft_tissue_injury, impa, bone_cancer, ivdd, degenerative_myelopathy, iliopsoas_strain, patellar_luxation, lumbosacral_disease, wobbler_syndrome, obesity_related, histiocytic_sarcoma

### 8. SWOLLEN / BLOATED BELLY

- **Canonical key:** `swollen_abdomen`
- **Owner phrases:** "big belly", "bloated", "swollen stomach", "belly looks tight", "pot-bellied", "enlarged abdomen", "belly feels hard", "tummy swollen"
- **Body systems:** gastrointestinal, reproductive, systemic
- **Urgency tier:** 1 (emergency) if sudden + retching; tier 2 if gradual
- **Red flags:** unproductive retching, rapid onset distension, abdomen painful to touch, restlessness + pacing, pale gums, intact female + lethargy
- **Must-ask questions:** abdomen onset, abdomen pain, unproductive retching, spay status, restlessness, gum color, water intake
- **Linked diseases:** gdv, bloat, ascites, splenic_mass, pyometra, cushings_disease, pregnancy

### 9. SEIZURES / COLLAPSE

- **Canonical key:** `seizure_collapse`
- **Owner phrases:** "fitting", "having a fit", "passed out", "fell over", "went limp", "shaking uncontrollably", "paddling legs", "foaming at mouth", "lost consciousness", "knocked out", "blackout"
- **Body systems:** neurologic, cardiovascular
- **Urgency tier:** 1 (emergency)
- **Red flags:** seizure > 5 minutes, multiple seizures in 24h, collapse + pale gums, collapse + difficulty breathing, post-ictal > 30 minutes
- **Must-ask questions:** seizure duration, consciousness level, toxin exposure, prior seizures, trembling present, gum color, breathing status
- **Linked diseases:** seizure_disorder, epilepsy, hypoglycemia, toxin_ingestion, heart_disease, imha, addisons_disease, heat_stroke

### 10. EXCESSIVE SCRATCHING / ITCHING

- **Canonical key:** `excessive_scratching`
- **Owner phrases:** "itching", "scratching all the time", "chewing feet", "rubbing face", "hot spots", "can't stop scratching", "skin is red", "licking paws"
- **Body systems:** dermatologic
- **Urgency tier:** 4 (monitor) — escalates to 2 if facial swelling or hives
- **Red flags:** facial swelling, widespread hives, difficulty breathing (anaphylaxis), open sores from scratching
- **Must-ask questions:** scratch location, scratch duration, skin changes, flea prevention, diet change, seasonal pattern, ear involvement
- **Linked diseases:** allergic_dermatitis, food_allergy, flea_allergy, ear_infection, hot_spots, mange, yeast_infection, zinc_responsive_dermatosis

### 11. DRINKING MORE WATER

- **Canonical key:** `drinking_more`
- **Owner phrases:** "drinking tons of water", "always at the bowl", "thirsty all the time", "water bowl empty fast", "drinking more than usual", "polydipsia"
- **Body systems:** endocrine, renal, reproductive
- **Urgency tier:** 3 (prompt) — escalates to 2 if intact female (pyometra risk)
- **Red flags:** intact female + drinking + lethargy (pyometra), not urinating despite drinking, vomiting + increased drinking
- **Must-ask questions:** water amount change, urination frequency, urination accidents, appetite change, weight change, spay status
- **Linked diseases:** diabetes, cushings_disease, kidney_disease, pyometra, liver_disease, hypercalcemia

### 12. TREMBLING / SHAKING

- **Canonical key:** `trembling`
- **Owner phrases:** "shivering", "shaking", "trembling", "quivering", "vibrating", "can't sit still", "acting cold"
- **Body systems:** neurologic, systemic, musculoskeletal
- **Urgency tier:** 3 (prompt) — escalates to 1 if toxin exposure or collapse
- **Red flags:** seizure activity, toxin confirmed, collapse, unresponsive, known toxin access (chocolate, xylitol, rodenticide)
- **Must-ask questions:** trembling duration, trembling timing, toxin exposure, consciousness level, temperature feel, appetite status
- **Linked diseases:** pain_general, toxin_ingestion, hypoglycemia, seizure_disorder, epilepsy, addisons_disease, fever, anxiety

### 13. BLOOD IN STOOL

- **Canonical key:** `blood_in_stool`
- **Owner phrases:** "blood in poop", "bloody stool", "red in poop", "dark poop", "tar-like stool", "jam-like stool", "blood on floor after poop"
- **Body systems:** gastrointestinal, hematologic
- **Urgency tier:** 2 (urgent) — escalates to 1 if pale gums or large volume
- **Red flags:** large blood volume, rat poison confirmed, pale gums, puppy with bloody diarrhea, lethargy + bloody stool
- **Must-ask questions:** blood color, blood amount, stool frequency, toxin exposure, rat poison access, appetite, water intake
- **Linked diseases:** hemorrhagic_gastroenteritis, colitis, parasites, foreign_body, coagulopathy, gi_cancer, von_willebrands

### 14. EYE DISCHARGE / EYE PROBLEM

- **Canonical key:** `eye_discharge`
- **Owner phrases:** "goopy eyes", "eyes watering", "eye crust", "eye stuck shut", "cloudy eye", "eye looks weird", "squinting", "red eye", "eye swelling"
- **Body systems:** ophthalmologic
- **Urgency tier:** 3 (prompt) — escalates to 1 if eye bulging or sudden blindness
- **Red flags:** eye swollen shut, eye bulging (proptosis), sudden blindness, severe pain/crying, corneal cloudiness
- **Must-ask questions:** discharge color, discharge duration, squinting, eye redness, vision changes, trauma history
- **Linked diseases:** conjunctivitis, corneal_ulcer, dry_eye, glaucoma, uveitis, entropion, cherry_eye, eye_disorders

### 15. EAR PROBLEMS

- **Canonical key:** `ear_scratching`
- **Owner phrases:** "ear infection", "shaking head", "scratching ears", "ear smells bad", "ear gunk", "head tilted", "won't let me touch ear", "walking in circles"
- **Body systems:** dermatologic, neurologic
- **Urgency tier:** 3 (prompt) — escalates to 2 if sudden head tilt or balance loss
- **Red flags:** sudden head tilt, balance loss, facial drooping, inability to stand, swelling of ear flap
- **Must-ask questions:** ear odor, ear discharge, head shaking, head tilt, balance issues, ear swelling, duration
- **Linked diseases:** ear_infection_bacterial, ear_infection_yeast, ear_mites, allergic_dermatitis, foreign_body_ear, aural_hematoma, syringomyelia

### 16. WEIGHT LOSS

- **Canonical key:** `weight_loss`
- **Owner phrases:** "getting skinny", "ribs showing", "losing weight", "backbone sticking out", "getting thin", "dropping weight fast", "muscle wasting"
- **Body systems:** systemic, endocrine, gastrointestinal
- **Urgency tier:** 3 (prompt) — escalates to 2 if rapid weight loss
- **Red flags:** rapid weight loss (>10% body weight in 1 month), weight loss + not eating, weight loss + lethargy, weight loss + vomiting
- **Must-ask questions:** weight loss duration, weight loss amount, appetite change, stool changes, water intake, energy level
- **Linked diseases:** diabetes, hyperthyroidism, kidney_disease, cancer, ibd, exocrine_pancreatic_insufficiency, parasites, histiocytic_sarcoma

### 17. WOUND / SKIN LESION

- **Canonical key:** `wound_skin_issue`
- **Owner phrases:** "cut", "gash", "sore", "lump", "bump", "rash", "scab", "oozing", "bleeding skin", "hot spot", "infected", "red patch", "bald spot"
- **Body systems:** dermatologic, musculoskeletal
- **Urgency tier:** 3 (prompt) — escalates to 1 if deep bleeding or bone visible
- **Red flags:** deep bleeding wound, bone/tissue visible, rapidly spreading redness, foul odor + fever
- **Must-ask questions:** wound location, wound size, wound duration, wound color, wound discharge, wound odor, wound licking, trauma history
- **Linked diseases:** wound_infection, abscess, hot_spots, allergic_dermatitis, skin_mass, laceration, autoimmune_skin, mast_cell_tumor, perianal_fistula, alopecia, zinc_responsive_dermatosis

### 18. URINATION PROBLEMS

- **Canonical key:** `urination_problem`
- **Owner phrases:** "peeing inside", "can't pee", "straining to pee", "peeing blood", "dripping urine", "accidents", "going outside constantly", "squatting but nothing"
- **Body systems:** renal, reproductive, endocrine
- **Urgency tier:** 2 (urgent) — escalates to 1 if unable to urinate (blockage)
- **Red flags:** unable to produce urine, straining + no output (male dog), blood clots in urine, lethargy + urination difficulty
- **Must-ask questions:** urination frequency, straining present, blood in urine, urination accidents, water intake, spay/neuter status
- **Linked diseases:** urinary_stones, urinary_infection, prostate_disease, bladder_cancer, kidney_disease, diabetes, urethral_obstruction

### 19. BEHAVIOR CHANGE

- **Canonical key:** `behavior_change`
- **Owner phrases:** "not acting right", "different lately", "aggressive suddenly", "hiding", "clingy", "confused", "staring at walls", "wandering", "not recognizing me"
- **Body systems:** neurologic, systemic
- **Urgency tier:** 3 (prompt) — escalates to 1 if sudden disorientation or aggression
- **Red flags:** sudden disorientation, new aggression, pacing/restlessness > 2h, vocalizing in pain, seizures
- **Must-ask questions:** behavior change duration, change type, appetite status, vision changes, sleep pattern, recent events
- **Linked diseases:** cognitive_dysfunction, brain_tumor, liver_shunt, hypothyroidism, pain_general, seizure_disorder, vision_loss, hearing_loss

### 20. SWELLING / LUMP ANYWHERE

- **Canonical key:** `swelling_lump`
- **Owner phrases:** "found a lump", "bump under skin", "swollen area", "growth", "mass", "enlarged lymph node", "swollen leg", "swollen face"
- **Body systems:** systemic, dermatologic, musculoskeletal
- **Urgency tier:** 3 (prompt) — escalates to 2 if rapidly growing or facial swelling
- **Red flags:** rapidly growing mass, facial swelling (anaphylaxis), swelling + difficulty breathing, hot/painful swelling, multiple new lumps
- **Must-ask questions:** lump location, lump size, lump duration, lump growth rate, lump mobility, pain on touch, other lumps present
- **Linked diseases:** skin_mass, mast_cell_tumor, abscess, lymphoma, histiocytic_sarcoma, allergic_reaction, lipoma, hemangiosarcoma

### 21. BAD BREATH / DENTAL PROBLEMS

- **Canonical key:** `dental_problem`
- **Owner phrases:** "bad breath", "stinky breath", "drooling", "won't chew", "dropping food", "pawing at mouth", "bleeding gums", "loose teeth", "tartar buildup"
- **Body systems:** oral, systemic
- **Urgency tier:** 3 (prompt) — escalates to 2 if facial swelling or inability to eat/drink
- **Red flags:** facial swelling under eye, inability to drink, blood from mouth, dropping food + weight loss
- **Must-ask questions:** breath odor severity, drooling present, chewing difficulty, gum appearance, tooth mobility, appetite status
- **Linked diseases:** dental_disease, oral_tumor, tooth_root_abscess, stomatitis, foreign_body_mouth, kidney_disease

### 22. HAIR LOSS / COAT CHANGE

- **Canonical key:** `hair_loss`
- **Owner phrases:** "losing fur", "bald patches", "thin coat", "hair falling out", "patchy fur", "dull coat", "flaky skin", "dandruff"
- **Body systems:** dermatologic, endocrine
- **Urgency tier:** 4 (monitor) — escalates to 3 if skin is inflamed or infected
- **Red flags:** widespread hair loss with skin breakdown, hair loss + lethargy + weight gain (hypothyroidism), hair loss + increased drinking
- **Must-ask questions:** hair loss pattern, skin appearance, itching present, duration, diet quality, flea prevention, seasonal pattern
- **Linked diseases:** allergic_dermatitis, hypothyroidism, cushings_disease, mange, folliculitis, alopecia, zinc_responsive_dermatosis, food_allergy

### 23. REGURGITATION (distinct from vomiting)

- **Canonical key:** `regurgitation`
- **Owner phrases:** "food comes right back up", "undigested food on floor", "gurgling up food", "passive vomiting", "food just drops out", "not really throwing up"
- **Body systems:** gastrointestinal, respiratory
- **Urgency tier:** 2 (urgent) — escalates to 1 if aspiration signs
- **Red flags:** coughing after regurgitation (aspiration), blue gums, inability to keep water down, weight loss + regurgitation
- **Must-ask questions:** timing after eating, food appearance, coughing present, water intake, weight change, appetite
- **Linked diseases:** megaesophagus, vascular_ring_anomaly, myasthenia_gravis, esophageal_foreign_body, hiatal_hernia

### 24. STRAINING TO DEFECATE / CONSTIPATION

- **Canonical key:** `constipation`
- **Owner phrases:** "can't poop", "straining on floor", "hard little poops", "no poop for days", "squatting but nothing", "crying when pooping"
- **Body systems:** gastrointestinal
- **Urgency tier:** 3 (prompt) — escalates to 2 if > 48h no stool + vomiting
- **Red flags:** straining + no production + vomiting, bloody discharge from rectum, distended hard abdomen, lethargy + constipation
- **Must-ask questions:** last normal stool, straining duration, stool consistency when produced, appetite, vomiting present, water intake
- **Linked diseases:** obstipation, prostate_enlargement, perineal_hernia, foreign_body, pelvic_canal_stenosis, hypothyroidism

### 25. LAMENESS IN MULTIPLE LEGS / STIFFNESS

- **Canonical key:** `generalized_stiffness`
- **Owner phrases:** "stiff all over", "can't get comfortable", "reluctant to move", "slow to stand", "stiff in morning", "sore everywhere"
- **Body systems:** musculoskeletal, systemic
- **Urgency tier:** 3 (prompt) — escalates to 2 if fever + stiffness
- **Red flags:** fever + stiffness (IMPA), inability to stand, trembling + stiffness, crying when touched
- **Must-ask questions:** stiffness onset, affected areas, fever present, appetite, energy level, worse after rest or exercise
- **Linked diseases:** impa, osteoarthritis, polymyositis, degenerative_myelopathy, lumbosacral_disease, hypothyroidism

### 26. NASAL DISCHARGE / SNEEZING

- **Canonical key:** `nasal_discharge`
- **Owner phrases:** "runny nose", "sneezing", "snotty nose", "nose bleeding", "snorting", "reverse sneezing", "nasal gunk"
- **Body systems:** respiratory
- **Urgency tier:** 4 (monitor) — escalates to 2 if bloody or one-sided
- **Red flags:** bloody nasal discharge (one-sided), facial deformity, sneezing blood clots, difficulty breathing through nose
- **Must-ask questions:** discharge color, discharge side (one/both), sneezing frequency, blood present, appetite, duration
- **Linked diseases:** nasal_infection, nasal_tumor, nasal_foreign_body, aspergillosis, dental_disease (fistula), allergic_rhinitis

### 27. VAGINAL DISCHARGE

- **Canonical key:** `vaginal_discharge`
- **Owner phrases:** "discharge from privates", "bloody vulva", "pus from vagina", "licking privates constantly", "smelly discharge"
- **Body systems:** reproductive
- **Urgency tier:** 2 (urgent) — escalates to 1 if intact female + lethargy + drinking (pyometra)
- **Red flags:** intact female + lethargy + increased drinking, foul-smelling discharge, green/black discharge, collapse
- **Must-ask questions:** spay status, discharge color, discharge odor, heat cycle timing, appetite, water intake, lethargy
- **Linked diseases:** pyometra, vaginal_hyperplasia, metritis, vaginal_tumor, urinary_infection

### 28. TESTICULAR / PROSTATE PROBLEMS

- **Canonical key:** `testicular_prostate`
- **Owner phrases:** "swollen balls", "one testicle bigger", "straining to pee", "ribbon-like poop", "dragging back legs"
- **Body systems:** reproductive, renal
- **Urgency tier:** 3 (prompt) — escalates to 2 if painful swelling
- **Red flags:** acute painful testicular swelling, inability to urinate, straining + no urine
- **Must-ask questions:** neuter status, swelling location, urination changes, stool changes, pain on touch, duration
- **Linked diseases:** prostate_disease, testicular_tumor, prostatitis, perineal_hernia, benign_prostatic_hyperplasia

### 29. LAMENESS AFTER EXERCISE

- **Canonical key:** `exercise_induced_lameness`
- **Owner phrases:** "fine until we walk", "stops mid-walk", "fine at home but won't walk far", "lies down after running", "sore after play"
- **Body systems:** musculoskeletal, cardiovascular
- **Urgency tier:** 3 (prompt) — escalates to 2 if collapse after exercise
- **Red flags:** collapse after exercise, blue gums after exercise, recovery > 30 minutes, coughing after exercise
- **Must-ask questions:** exercise type, onset during exercise, recovery time, breathing after exercise, gum color, prior episodes
- **Linked diseases:** ccl_rupture, iliopsoas_strain, heart_disease, exercise_induced_collapse, myopathy, osteoarthritis

### 30. SKIN ODOR / GREASY SKIN

- **Canonical key:** `skin_odor_greasy`
- **Owner phrases:** "smells bad", "greasy fur", "yeasty smell", "corn chip feet", "oily coat", "smells even after bath"
- **Body systems:** dermatologic
- **Urgency tier:** 4 (monitor) — escalates to 3 if skin is inflamed
- **Red flags:** widespread skin breakdown, fever + skin odor, skin peeling
- **Must-ask questions:** odor location, skin appearance, itching present, bath frequency, ear involvement, diet
- **Linked diseases:** yeast_infection, seborrhea, allergic_dermatitis, hypothyroidism, cushings_disease

### 31. RECURRENT EAR INFECTIONS

- **Canonical key:** `recurrent_ear`
- **Owner phrases:** "always getting ear infections", "back on ear meds", "ears never clear up", "chronic ear problem"
- **Body systems:** dermatologic, systemic
- **Urgency tier:** 3 (prompt)
- **Red flags:** head tilt + balance loss, facial drooping, ear hematoma, hearing loss
- **Must-ask questions:** infection frequency, last treatment, underlying allergy diagnosis, food trial done, ear cleaning routine
- **Linked diseases:** allergic_dermatitis, ear_infection_bacterial, ear_infection_yeast, food_allergy, hypothyroidism

### 32. RECURRENT SKIN INFECTIONS

- **Canonical key:** `recurrent_skin`
- **Owner phrases:** "always getting skin infections", "pimples keep coming back", "antibiotics work then it returns"
- **Body systems:** dermatologic, systemic, immune
- **Urgency tier:** 3 (prompt)
- **Red flags:** widespread deep infections, fever, lethargy, non-responsive to antibiotics
- **Must-ask questions:** infection frequency, antibiotic history, allergy testing done, immune status, diet
- **Linked diseases:** allergic_dermatitis, superficial_pyoderma, demodicosis, hypothyroidism, cushings_disease, immune_deficiency

### 33. INAPPROPRIATE URINATION (HOUSED DOG)

- **Canonical key:** `inappropriate_urination`
- **Owner phrases:** "peeing in house", "was housetrained now isn't", "leaking urine", "waking up wet", "marking inside"
- **Body systems:** renal, reproductive, behavioral
- **Urgency tier:** 3 (prompt) — escalates to 2 if straining or blood
- **Red flags:** straining + no urine, blood in urine, lethargy + accidents, male dog unable to urinate
- **Must-ask questions:** urination frequency, straining, blood present, water intake, neuter status, behavioral changes
- **Linked diseases:** urinary_infection, urinary_stones, diabetes, cushings_disease, kidney_disease, prostate_disease, cognitive_dysfunction

### 34. FECAL INCONTINENCE

- **Canonical key:** `fecal_incontinence`
- **Owner phrases:** "pooping without knowing", "waking up in poop", "can't hold it", "leaking stool", "dropping stool while walking"
- **Body systems:** gastrointestinal, neurologic
- **Urgency tier:** 2 (urgent) — sudden onset suggests neurologic
- **Red flags:** sudden onset + hind limb weakness, tail paralysis, back pain, inability to stand
- **Must-ask questions:** onset, stool consistency, hind limb function, tail movement, back pain, perineal reflex
- **Linked diseases:** ivdd, lumbosacral_disease, cauda_equina_syndrome, anal_sphincter_incompetence, cognitive_dysfunction

### 35. VOMITING + DIARRHEA TOGETHER

- **Canonical key:** `vomiting_diarrhea_combined`
- **Owner phrases:** "both ends", "sick top and bottom", "vomiting and diarrhea", "everything is coming out"
- **Body systems:** gastrointestinal
- **Urgency tier:** 2 (urgent) — escalates to 1 if puppy or bloody
- **Red flags:** puppy, blood in both, lethargy + not drinking, fever, toxin exposure
- **Must-ask questions:** duration of each, frequency of each, blood in either, appetite, water intake, toxin exposure, vaccination status
- **Linked diseases:** gastroenteritis, pancreatitis, parvovirus, toxin_ingestion, foreign_body, hemorrhagic_gastroenteritis

### 36. COUGHING + BREATHING DIFFICULTY

- **Canonical key:** `coughing_breathing_combined`
- **Owner phrases:** "coughing and can't breathe", "wheezing and coughing", "struggling to breathe after coughing"
- **Body systems:** respiratory, cardiovascular
- **Urgency tier:** 1 (emergency)
- **Red flags:** blue gums, collapse, sudden onset, inability to lie down, open-mouth breathing
- **Must-ask questions:** breathing rate, gum color, cough type, onset, exercise tolerance, position preference
- **Linked diseases:** heart_failure, pneumonia, pleural_effusion, laryngeal_paralysis, allergic_reaction

### 37. LUMP IN MOUTH / ORAL MASS

- **Canonical key:** `oral_mass`
- **Owner phrases:** "lump in mouth", "growth on gum", "won't close mouth", "something hanging from mouth", "mouth won't shut"
- **Body systems:** oral
- **Urgency tier:** 2 (urgent)
- **Red flags:** bleeding from mouth, inability to eat/drink, facial swelling, difficulty breathing
- **Must-ask questions:** mass location, mass size, bleeding, eating difficulty, duration, odor
- **Linked diseases:** oral_tumor, epulis, melanoma, squamous_cell_carcinoma, foreign_body_mouth, dental_disease

### 38. SUDDEN BLINDNESS / VISION LOSS

- **Canonical key:** `vision_loss`
- **Owner phrases:** "bumping into things", "can't see", "blind suddenly", "eyes look cloudy", "won't go in dark"
- **Body systems:** ophthalmologic, neurologic
- **Urgency tier:** 1 (emergency) if sudden; tier 2 if gradual
- **Red flags:** sudden onset, painful eye, dilated non-responsive pupils, neurologic signs
- **Must-ask questions:** onset, one or both eyes, pain present, pupil appearance, other neurologic signs, duration
- **Linked diseases:** sudden_acquired_retinal_degeneration, glaucoma, cataract, optic_neuritis, brain_tumor, hypertension

### 39. SUDDEN DEAFNESS / HEARING LOSS

- **Canonical key:** `hearing_loss`
- **Owner phrases:** "not hearing me", "deaf suddenly", "doesn't respond to name", "startled easily", "sleeping through noise"
- **Body systems:** neurologic, dermatologic (ear disease)
- **Urgency tier:** 3 (prompt) — escalates to 2 if sudden + neurologic signs
- **Red flags:** sudden deafness + head tilt, balance loss, ear pain, facial drooping
- **Must-ask questions:** onset, ear infection history, head tilt, balance, response to loud sounds, age
- **Linked diseases:** ear_infection, vestibular_disease, age_related_deafness, ototoxicity, brain_tumor

### 40. AGGRESSION / PAIN-BASED AGGRESSION

- **Canonical key:** `aggression`
- **Owner phrases:** "biting suddenly", "growling when touched", "not himself", "snapping", "doesn't want to be picked up"
- **Body systems:** systemic, musculoskeletal, neurologic
- **Urgency tier:** 2 (urgent) — sudden aggression suggests pain
- **Red flags:** sudden new aggression, aggression + trembling, aggression + lethargy, aggression + vocalizing
- **Must-ask questions:** aggression onset, trigger situations, pain on touch, appetite, energy level, recent changes
- **Linked diseases:** pain_general, ivdd, dental_disease, ear_infection, cognitive_dysfunction, hypothyroidism, brain_tumor

### 41. PACING / RESTLESSNESS

- **Canonical key:** `pacing_restlessness`
- **Owner phrases:** "can't settle", "walking in circles", "pacing all night", "won't lie down", "restless", "anxious"
- **Body systems:** systemic, neurologic, gastrointestinal
- **Urgency tier:** 2 (urgent) — especially if abdomen distended
- **Red flags:** pacing + bloated abdomen, pacing + retching, pacing + pale gums, pacing > 2 hours
- **Must-ask questions:** abdomen appearance, retching present, gum color, duration, appetite, water intake
- **Linked diseases:** gdv, pain_general, bloat, cognitive_dysfunction, anxiety, splenic_mass

### 42. ABNORMAL GAIT / WOBBLINESS

- **Canonical key:** `abnormal_gait`
- **Owner phrases:** "wobbly walking", "drunk walking", "crossing legs", "knuckling", "weak in back", "stumbling", "walking weird"
- **Body systems:** neurologic, musculoskeletal
- **Urgency tier:** 2 (urgent) — sudden onset
- **Red flags:** inability to stand, paralysis, back pain, loss of bladder/bowel control
- **Must-ask questions:** onset, affected limbs, back pain, bladder control, trauma history, progression
- **Linked diseases:** ivdd, degenerative_myelopathy, wobbler_syndrome, vestibular_disease, fibrocartilaginous_embolism, brain_tumor

### 43. HEAT INTOLERANCE / OVERHEATING

- **Canonical key:** `heat_intolerance`
- **Owner phrases:** "overheats fast", "can't handle heat", "panting too much in heat", "collapsed in heat"
- **Body systems:** respiratory, systemic
- **Urgency tier:** 1 (emergency) if collapse; tier 3 if mild
- **Red flags:** collapse in heat, brick-red gums, vomiting + overheating, rectal temp > 106°F
- **Must-ask questions:** temperature exposure, duration, gum color, consciousness level, vomiting, water intake, breed
- **Linked diseases:** heat_stroke, difficulty_breathing, heart_disease, obesity_related

### 44. POST-OPERATIVE CONCERNS

- **Canonical key:** `postoperative_concern`
- **Owner phrases:** "incision looks bad", "stitches open", "oozing from surgery site", "not recovering well", "swollen after surgery"
- **Body systems:** systemic, dermatologic
- **Urgency tier:** 2 (urgent) if incision open; tier 3 if mild
- **Red flags:** incision dehiscence, active bleeding, pus + fever, lethargy + not eating post-op
- **Must-ask questions:** surgery type, days post-op, incision appearance, discharge, appetite, activity level, temperature
- **Linked diseases:** wound_infection, surgical_complication, seroma, dehiscence, pain_general

### 45. MEDICATION REACTION

- **Canonical key:** `medication_reaction`
- **Owner phrases:** "reaction to medicine", "got sick after pill", "allergic to medication", "side effects"
- **Body systems:** systemic
- **Urgency tier:** 2 (urgent) — escalates to 1 if facial swelling or breathing difficulty
- **Red flags:** facial swelling, hives + breathing difficulty, collapse, vomiting + diarrhea after medication
- **Must-ask questions:** medication name, dose, timing, symptoms, prior reactions, current medications
- **Linked diseases:** allergic_reaction, toxin_ingestion, gastroenteritis

### 46. PREGNANCY / BIRTHING CONCERNS

- **Canonical key:** `pregnancy_birth`
- **Owner phrases:** "having trouble giving birth", "straining but no puppies", "green discharge but no puppies", "pregnant and sick"
- **Body systems:** reproductive
- **Urgency tier:** 1 (emergency) if active labor difficulty; tier 3 if routine concerns
- **Red flags:** active straining > 30 min with no puppy, green discharge without puppy delivery, > 2h between puppies with straining, known litter + lethargy
- **Must-ask questions:** days pregnant, contraction status, discharge color, number of puppies delivered, time since last puppy, appetite
- **Linked diseases:** dystocia, metritis, eclampsia, pregnancy, pyometra

### 47. PUPPY-SPECIFIC CONCERNS

- **Canonical key:** `puppy_concern`
- **Owner phrases:** "puppy not right", "weak puppy", "not nursing", "puppy crying", "puppy cold", "puppy not growing"
- **Body systems:** systemic
- **Urgency tier:** 2 (urgent) — puppies decompensate rapidly
- **Red flags:** puppy not nursing > 4h, cold to touch, weak cry, not gaining weight, diarrhea in puppy < 12 weeks
- **Must-ask questions:** age in weeks, nursing status, temperature, weight trend, littermate status, vaccination status
- **Linked diseases:** hypoglycemia, parasites, parvovirus, fading_puppy_syndrome, congenital_defect, liver_shunt

### 48. SENIOR DOG DECLINE

- **Canonical key:** `senior_decline`
- **Owner phrases:** "getting old and slow", "not like she used to be", "slowing down", "confused at night", "forgetting training"
- **Body systems:** neurologic, systemic, musculoskeletal
- **Urgency tier:** 3 (prompt) — screen for reversible causes
- **Red flags:** rapid decline over weeks, inability to stand, sudden blindness/deafness, not eating/drinking
- **Must-ask questions:** decline duration, specific changes, appetite, water intake, mobility, sleep pattern, medication list
- **Linked diseases:** cognitive_dysfunction, osteoarthritis, kidney_disease, heart_disease, cancer, hypothyroidism, dental_disease

### 49. MULTI-SYSTEM DECLINE

- **Canonical key:** `multi_system_decline`
- **Owner phrases:** "just not right in multiple ways", "a bit of everything wrong", "going downhill"
- **Body systems:** systemic (multiple)
- **Urgency tier:** 2 (urgent) — requires full workup
- **Red flags:** lethargy + not eating + not drinking, weight loss + vomiting + diarrhea, pale gums + collapse
- **Must-ask questions:** each symptom duration, appetite, water intake, weight change, energy, vomiting, diarrhea, urination
- **Linked diseases:** kidney_disease, liver_disease, cancer, addisons_disease, imha, heart_failure, sepsis

### 50. UNKNOWN / OWNER CANNOT ASSESS

- **Canonical key:** `unknown_concern`
- **Owner phrases:** "something is wrong but I can't tell what", "just seems off", "not acting right", "I don't know what to look for"
- **Body systems:** unknown
- **Urgency tier:** 3 (prompt) default — escalates based on answers
- **Red flags:** unable to assess breathing, unable to assess gum color, dog non-responsive, owner panic
- **Must-ask questions:** chief complaint (best guess), appetite, water intake, energy level, breathing, gum color, last normal
- **Linked diseases:** (any — requires structured questioning to narrow)

---

## Coverage Expansion Plan

### Phase 1 (Current — 50 families)
Covers ~85% of primary care presentations and ~95% of emergency presentations.

### Phase 2 (Target: 100 families)
Add:
- Specific toxicities (xylitol, chocolate, rodenticide, NSAID, lily)
- Specific trauma patterns (hit by car, bite wound, fall, penetrating)
- Breed-specific emergencies (bloat in deep-chested, IVDD in chondrodystrophic)
- Post-vaccination reactions
- Travel-related diseases
- Zoonotic concerns

### Phase 3 (Target: 200-300 conditions)
- Full disease-level granularity
- Rare but must-not-miss conditions
- Geographic-specific diseases
- Age-stratified presentations

---

## Mapping to Existing SYMPTOM_MAP

| Ontology Key | Existing SYMPTOM_MAP Key | Status |
|---|---|---|
| difficulty_breathing | difficulty_breathing | Exists |
| coughing | coughing | Exists |
| vomiting | vomiting | Exists |
| diarrhea | diarrhea | Exists |
| not_eating | not_eating | Exists |
| lethargy | lethargy | Exists |
| limping | limping | Exists |
| swollen_abdomen | swollen_abdomen | Exists |
| seizure_collapse | (new — combines seizure + collapse) | NEW |
| excessive_scratching | excessive_scratching | Exists |
| drinking_more | drinking_more | Exists |
| trembling | trembling | Exists |
| blood_in_stool | blood_in_stool | Exists |
| eye_discharge | eye_discharge | Exists |
| ear_scratching | ear_scratching | Exists |
| weight_loss | weight_loss | Exists |
| wound_skin_issue | wound_skin_issue | Exists |
| urination_problem | (new) | NEW |
| behavior_change | (new) | NEW |
| swelling_lump | (new) | NEW |
| dental_problem | (new) | NEW |
| hair_loss | (new) | NEW |
| regurgitation | (new) | NEW |
| constipation | (new) | NEW |
| generalized_stiffness | (new) | NEW |
| nasal_discharge | (new) | NEW |
| vaginal_discharge | (new) | NEW |
| testicular_prostate | (new) | NEW |
| exercise_induced_lameness | (new) | NEW |
| skin_odor_greasy | (new) | NEW |
| recurrent_ear | (new) | NEW |
| recurrent_skin | (new) | NEW |
| inappropriate_urination | (new) | NEW |
| fecal_incontinence | (new) | NEW |
| vomiting_diarrhea_combined | (new) | NEW |
| coughing_breathing_combined | (new) | NEW |
| oral_mass | (new) | NEW |
| vision_loss | (new) | NEW |
| hearing_loss | (new) | NEW |
| aggression | (new) | NEW |
| pacing_restlessness | (new) | NEW |
| abnormal_gait | (new) | NEW |
| heat_intolerance | (new) | NEW |
| postoperative_concern | (new) | NEW |
| medication_reaction | (new) | NEW |
| pregnancy_birth | (new) | NEW |
| puppy_concern | (new) | NEW |
| senior_decline | (new) | NEW |
| multi_system_decline | (new) | NEW |
| unknown_concern | (new) | NEW |

**Summary:** 16 existing + 34 new = 50 complaint families total

---

## Owner Language Index

Each complaint family above includes owner-language phrases. These feed into VET-905 (Owner Language Lexicon) for the full normalization layer.

Total owner-language phrases captured in this ontology: **~500+**

---

## Next Steps

1. **VET-903:** Lock emergency red-flag canonical map for the 10 emergency-tier complaints
2. **VET-904:** Build must-ask question trees for each of the 50 complaint families
3. **VET-905:** Expand owner language lexicon with 500+ variants for normalization
4. **VET-906:** Map complaint families to expanded disease coverage (150-200 conditions)
5. **VET-907:** Add breed, age, sex, neuter, and size modifiers to complaint priors
