// =============================================================================
// VETERINARY ICD-10-CM CODE MAPPING
// Maps internal disease names to veterinary ICD-10-CM codes for clinical
// documentation, insurance claims, and professional referral reports.
// =============================================================================

export interface ICD10Mapping {
  code: string;
  description: string;
  category: string;
  urgency: "low" | "moderate" | "high" | "emergency";
  notes?: string;
}

export interface ICD10Result {
  disease: string;
  primary_code: ICD10Mapping;
  alternative_codes: ICD10Mapping[];
  confidence: number;
}

const REFERENCE_ONLY_NOTE =
  "Reference-only veterinary display mapping; does not drive clinical decisions.";

// Veterinary ICD-10-CM code mappings for common canine conditions
const DISEASE_TO_ICD10: Record<string, ICD10Mapping[]> = {
  // Wound & Skin Conditions
  wound_infection: [
    {
      code: "L03.90",
      description: "Acute lymphangitis, unspecified",
      category: "Skin and subcutaneous tissue infections",
      urgency: "moderate",
      notes: "Canine wound infections; veterinary adaptation",
    },
    {
      code: "T14.8",
      description: "Other injury of unspecified body region",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "moderate",
    },
  ],
  hot_spots: [
    {
      code: "L30.9",
      description: "Dermatitis, unspecified",
      category: "Dermatitis and eczema",
      urgency: "low",
      notes: "Acute moist dermatitis (pyoderma)",
    },
    {
      code: "L08.9",
      description: "Local infection of the skin and subcutaneous tissue, unspecified",
      category: "Skin and subcutaneous tissue infections",
      urgency: "moderate",
    },
  ],
  dermatitis: [
    {
      code: "L30.9",
      description: "Dermatitis, unspecified",
      category: "Dermatitis and eczema",
      urgency: "low",
    },
    {
      code: "L23.9",
      description: "Allergic contact dermatitis, unspecified cause",
      category: "Dermatitis and eczema",
      urgency: "low",
    },
  ],
  ringworm: [
    {
      code: "B35.9",
      description: "Dermatophytosis, unspecified",
      category: "Mycoses",
      urgency: "low",
    },
  ],
  abscess: [
    {
      code: "L02.90",
      description: "Cutaneous abscess, unspecified",
      category: "Skin and subcutaneous tissue infections",
      urgency: "moderate",
    },
  ],

  // Gastrointestinal
  gastroenteritis: [
    {
      code: "K52.9",
      description: "Noninfective gastroenteritis and colitis, unspecified",
      category: "Diseases of the digestive system",
      urgency: "moderate",
    },
    {
      code: "A09",
      description: "Infectious gastroenteritis and colitis, unspecified",
      category: "Certain infectious and parasitic diseases",
      urgency: "moderate",
    },
  ],
  gdv: [
    {
      code: "K56.69",
      description: "Other intestinal obstruction",
      category: "Diseases of the digestive system",
      urgency: "emergency",
      notes: "Gastric dilatation-volvulus (bloat) - life-threatening emergency",
    },
  ],
  pancreatitis: [
    {
      code: "K85.9",
      description: "Acute pancreatitis, unspecified",
      category: "Diseases of the digestive system",
      urgency: "high",
    },
  ],
  parvovirus: [
    {
      code: "B08.8",
      description: "Other specified viral infections",
      category: "Certain infectious and parasitic diseases",
      urgency: "emergency",
      notes: "Canine parvovirus enteritis",
    },
  ],
  food_allergy: [
    {
      code: "T78.1",
      description: "Other adverse food reactions, not elsewhere classified",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "moderate",
    },
  ],
  dietary_indiscretion: [
    {
      code: "K52.9",
      description: "Noninfective gastroenteritis and colitis, unspecified",
      category: "Diseases of the digestive system",
      urgency: "low",
    },
  ],
  hemorrhagic_gastroenteritis: [
    {
      code: "K52.89",
      description: "Other specified noninfective gastroenteritis and colitis",
      category: "Diseases of the digestive system",
      urgency: "high",
      notes: "HGE - acute bloody diarrhea",
    },
  ],

  // Respiratory
  kennel_cough: [
    {
      code: "J20.9",
      description: "Acute bronchitis, unspecified",
      category: "Diseases of the respiratory system",
      urgency: "moderate",
      notes: "Infectious tracheobronchitis",
    },
    {
      code: "J06.9",
      description: "Acute upper respiratory infection, unspecified",
      category: "Diseases of the respiratory system",
      urgency: "low",
    },
  ],
  pneumonia: [
    {
      code: "J18.9",
      description: "Pneumonia, unspecified organism",
      category: "Diseases of the respiratory system",
      urgency: "high",
    },
  ],
  collapsing_trachea: [
    {
      code: "J39.8",
      description: "Other specified diseases of upper respiratory tract",
      category: "Diseases of the respiratory system",
      urgency: "moderate",
    },
  ],

  // Musculoskeletal
  cruciate_ligament_rupture: [
    {
      code: "S83.51",
      description: "Sprain of anterior cruciate ligament of knee",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "high",
      notes: "CCL rupture - common in dogs",
    },
  ],
  hip_dysplasia: [
    {
      code: "M24.85",
      description: "Other specific joint derangements, hip",
      category: "Diseases of the musculoskeletal system and connective tissue",
      urgency: "moderate",
    },
    {
      code: "M16.9",
      description: "Osteoarthritis of hip, unspecified",
      category: "Diseases of the musculoskeletal system and connective tissue",
      urgency: "moderate",
    },
  ],
  arthritis: [
    {
      code: "M19.90",
      description: "Unspecified osteoarthritis, unspecified site",
      category: "Diseases of the musculoskeletal system and connective tissue",
      urgency: "low",
    },
  ],
  intervertebral_disc_disease: [
    {
      code: "M51.9",
      description: "Unspecified intervertebral disc disorder",
      category: "Diseases of the musculoskeletal system and connective tissue",
      urgency: "high",
    },
  ],
  patellar_luxation: [
    {
      code: "M22.0",
      description: "Recurrent dislocation of patella",
      category: "Diseases of the musculoskeletal system and connective tissue",
      urgency: "moderate",
    },
  ],
  osteosarcoma: [
    {
      code: "C40.9",
      description: "Malignant neoplasm of bone and articular cartilage of unspecified limb",
      category: "Neoplasms",
      urgency: "emergency",
    },
  ],

  // Ocular
  conjunctivitis: [
    {
      code: "H10.9",
      description: "Unspecified conjunctivitis",
      category: "Diseases of the eye and adnexa",
      urgency: "low",
    },
  ],
  corneal_ulcer: [
    {
      code: "H16.0",
      description: "Corneal ulcer",
      category: "Diseases of the eye and adnexa",
      urgency: "high",
    },
  ],
  cherry_eye: [
    {
      code: "H04.8",
      description: "Other disorders of lacrimal gland",
      category: "Diseases of the eye and adnexa",
      urgency: "moderate",
      notes: "Prolapsed gland of the third eyelid",
    },
  ],
  glaucoma: [
    {
      code: "H40.9",
      description: "Unspecified glaucoma",
      category: "Diseases of the eye and adnexa",
      urgency: "high",
    },
  ],
  cataracts: [
    {
      code: "H26.9",
      description: "Unspecified cataract",
      category: "Diseases of the eye and adnexa",
      urgency: "moderate",
    },
  ],

  // Aural
  otitis_externa: [
    {
      code: "H60.9",
      description: "Otitis externa, unspecified",
      category: "Diseases of the ear and mastoid process",
      urgency: "moderate",
    },
  ],
  aural_hematoma: [
    {
      code: "H61.8",
      description: "Other specified disorders of external ear",
      category: "Diseases of the ear and mastoid process",
      urgency: "moderate",
    },
  ],

  // Cardiac
  heart_disease: [
    {
      code: "I51.9",
      description: "Heart disease, unspecified",
      category: "Diseases of the circulatory system",
      urgency: "high",
    },
  ],
  heartworm: [
    {
      code: "B74.9",
      description: "Filariasis, unspecified",
      category: "Certain infectious and parasitic diseases",
      urgency: "high",
      notes: "Dirofilaria immitis infection",
    },
  ],
  mitral_valve_disease: [
    {
      code: "I34.0",
      description: "Mitral valve insufficiency",
      category: "Diseases of the circulatory system",
      urgency: "high",
    },
  ],
  dilated_cardiomyopathy: [
    {
      code: "I42.0",
      description: "Dilated cardiomyopathy",
      category: "Diseases of the circulatory system",
      urgency: "emergency",
    },
  ],

  // Endocrine
  diabetes: [
    {
      code: "E14.9",
      description: "Diabetes mellitus without complications",
      category: "Endocrine, nutritional and metabolic diseases",
      urgency: "moderate",
    },
  ],
  cushings_disease: [
    {
      code: "E24.9",
      description: "Cushing's syndrome, unspecified",
      category: "Endocrine, nutritional and metabolic diseases",
      urgency: "moderate",
    },
  ],
  hypothyroidism: [
    {
      code: "E03.9",
      description: "Hypothyroidism, unspecified",
      category: "Endocrine, nutritional and metabolic diseases",
      urgency: "moderate",
    },
  ],

  // Renal/Urinary
  kidney_disease: [
    {
      code: "N28.9",
      description: "Disorder of kidney and ureter, unspecified",
      category: "Diseases of the genitourinary system",
      urgency: "high",
    },
  ],
  bladder_stones: [
    {
      code: "N21.9",
      description: "Calculus of urinary tract, unspecified",
      category: "Diseases of the genitourinary system",
      urgency: "moderate",
    },
  ],
  uti: [
    {
      code: "N39.0",
      description: "Urinary tract infection, site not specified",
      category: "Diseases of the genitourinary system",
      urgency: "moderate",
    },
  ],

  // Neurological
  seizures: [
    {
      code: "R56.9",
      description: "Unspecified convulsions",
      category: "Symptoms, signs and abnormal clinical and laboratory findings",
      urgency: "high",
    },
  ],
  epilepsy: [
    {
      code: "G40.9",
      description: "Epilepsy, unspecified",
      category: "Diseases of the nervous system",
      urgency: "high",
    },
  ],
  vestibular_disease: [
    {
      code: "H81.9",
      description: "Peripheral vestibular disorder, unspecified",
      category: "Diseases of the ear and mastoid process",
      urgency: "moderate",
    },
  ],

  // Toxicology
  toxin_ingestion: [
    {
      code: "T65.9",
      description: "Toxic effect of unspecified substance",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "emergency",
    },
  ],
  rat_poison_toxicity: [
    {
      code: "T60.9",
      description: "Toxic effect of unspecified pesticide",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "emergency",
    },
  ],
  chocolate_toxicity: [
    {
      code: "T65.89",
      description: "Toxic effect of other specified substances",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "high",
    },
  ],

  // Hematologic
  immune_mediated_hemolytic_anemia: [
    {
      code: "D59.1",
      description: "Autoimmune hemolytic anemias",
      category: "Diseases of the blood and blood-forming organs",
      urgency: "emergency",
    },
  ],
  tick_borne_disease: [
    {
      code: "A77.9",
      description: "Spotted fever, unspecified",
      category: "Certain infectious and parasitic diseases",
      urgency: "high",
      notes: "Lyme disease, ehrlichiosis, anaplasmosis",
    },
  ],

  // Wave 2 audit additions (ranked by benchmark frequency)
  pain_general: [
    {
      code: "R52",
      description: "Pain, unspecified",
      category: "Symptoms, signs and abnormal clinical and laboratory findings",
      urgency: "moderate",
      notes: `Generalized pain presentation. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  allergic_dermatitis: [
    {
      code: "L23.9",
      description: "Allergic contact dermatitis, unspecified cause",
      category: "Dermatitis and eczema",
      urgency: "low",
      notes: `Canine allergic dermatitis. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  heart_failure: [
    {
      code: "I50.9",
      description: "Heart failure, unspecified",
      category: "Diseases of the circulatory system",
      urgency: "high",
      notes: `Canine heart failure umbrella mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  ccl_rupture: [
    {
      code: "S83.51",
      description: "Sprain of anterior cruciate ligament of knee",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "high",
      notes: `Alias for canine cranial cruciate ligament rupture. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  pyometra: [
    {
      code: "N71.9",
      description: "Inflammatory disease of uterus, unspecified",
      category: "Diseases of the genitourinary system",
      urgency: "emergency",
      notes: `Canine pyometra display mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  seizure_disorder: [
    {
      code: "G40.9",
      description: "Epilepsy, unspecified",
      category: "Diseases of the nervous system",
      urgency: "high",
      notes: `Alias for recurrent seizure disorder. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  ivdd: [
    {
      code: "M51.9",
      description: "Unspecified intervertebral disc disorder",
      category: "Diseases of the musculoskeletal system and connective tissue",
      urgency: "high",
      notes: `Alias for canine IVDD. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  skin_mass: [
    {
      code: "R22.9",
      description: "Localized swelling, mass and lump, unspecified",
      category: "Symptoms, signs and abnormal clinical and laboratory findings",
      urgency: "moderate",
      notes: `Generic cutaneous mass mapping pending histopathology. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  cognitive_dysfunction: [
    {
      code: "F03.90",
      description: "Unspecified dementia, unspecified severity, without behavioral disturbance",
      category: "Mental, Behavioral and Neurodevelopmental disorders",
      urgency: "moderate",
      notes: `Canine cognitive dysfunction display mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  pleural_effusion: [
    {
      code: "J90",
      description: "Pleural effusion, not elsewhere classified",
      category: "Diseases of the respiratory system",
      urgency: "emergency",
      notes: `Respiratory compromise risk. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  bloat: [
    {
      code: "K56.69",
      description: "Other intestinal obstruction",
      category: "Diseases of the digestive system",
      urgency: "emergency",
      notes: `Alias for canine gastric dilatation-volvulus (bloat). ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  oral_tumor: [
    {
      code: "D49.0",
      description: "Neoplasm of unspecified behavior of lip, oral cavity and pharynx",
      category: "Neoplasms",
      urgency: "high",
      notes: `Oral mass/tumor display mapping before histologic typing. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  dystocia: [
    {
      code: "O66.9",
      description: "Obstructed labor, unspecified",
      category: "Pregnancy, childbirth and the puerperium",
      urgency: "emergency",
      notes: `Canine dystocia display mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  hypoglycemia: [
    {
      code: "E16.2",
      description: "Hypoglycemia, unspecified",
      category: "Endocrine, nutritional and metabolic diseases",
      urgency: "high",
      notes: `Canine hypoglycemia display mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  urinary_infection: [
    {
      code: "N39.0",
      description: "Urinary tract infection, site not specified",
      category: "Diseases of the genitourinary system",
      urgency: "moderate",
      notes: `Alias for canine urinary tract infection. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  sudden_acquired_retinal_degeneration: [
    {
      code: "H53.9",
      description: "Visual disturbance, unspecified",
      category: "Diseases of the eye and adnexa",
      urgency: "high",
      notes: `SARDS reference mapping before ophthalmic confirmation. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  heat_stroke: [
    {
      code: "T67.0",
      description: "Heatstroke and sunstroke",
      category: "Injury, poisoning and certain other consequences of external causes",
      urgency: "emergency",
      notes: `Canine heat injury display mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  ear_infection_bacterial: [
    {
      code: "H60.9",
      description: "Otitis externa, unspecified",
      category: "Diseases of the ear and mastoid process",
      urgency: "moderate",
      notes: `Alias for canine bacterial otitis externa. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  urinary_stones: [
    {
      code: "N21.9",
      description: "Calculus of urinary tract, unspecified",
      category: "Diseases of the genitourinary system",
      urgency: "moderate",
      notes: `Alias for canine urinary stones. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
  megaesophagus: [
    {
      code: "K22.89",
      description: "Other specified disease of esophagus",
      category: "Diseases of the digestive system",
      urgency: "high",
      notes: `Canine megaesophagus display mapping. ${REFERENCE_ONLY_NOTE}`,
    },
  ],
};

// Lookup map for fast access
const ICD10_LOOKUP_CACHE = new Map<string, ICD10Result | null>();

export function getICD10CodesForDisease(diseaseName: string): ICD10Result | null {
  const normalized = diseaseName.toLowerCase().replace(/\s+/g, "_");

  if (ICD10_LOOKUP_CACHE.has(normalized)) {
    return ICD10_LOOKUP_CACHE.get(normalized)!;
  }

  const codes = DISEASE_TO_ICD10[normalized];
  if (!codes || codes.length === 0) {
    ICD10_LOOKUP_CACHE.set(normalized, null);
    return null;
  }

  const result: ICD10Result = {
    disease: diseaseName,
    primary_code: codes[0],
    alternative_codes: codes.slice(1),
    confidence: 0.85, // Default confidence for veterinary mapping
  };

  ICD10_LOOKUP_CACHE.set(normalized, result);
  return result;
}

export function getAllICD10Categories(): string[] {
  const categories = new Set<string>();
  for (const codes of Object.values(DISEASE_TO_ICD10)) {
    for (const mapping of codes) {
      categories.add(mapping.category);
    }
  }
  return Array.from(categories).sort();
}

export function searchICD10ByCode(code: string): ICD10Mapping[] {
  const results: ICD10Mapping[] = [];
  for (const codes of Object.values(DISEASE_TO_ICD10)) {
    for (const mapping of codes) {
      if (mapping.code === code || mapping.code.startsWith(code)) {
        results.push(mapping);
      }
    }
  }
  return results;
}

export function searchICD10ByDescription(query: string): ICD10Mapping[] {
  const lowerQuery = query.toLowerCase();
  const results: ICD10Mapping[] = [];

  for (const codes of Object.values(DISEASE_TO_ICD10)) {
    for (const mapping of codes) {
      if (
        mapping.description.toLowerCase().includes(lowerQuery) ||
        mapping.category.toLowerCase().includes(lowerQuery) ||
        (mapping.notes && mapping.notes.toLowerCase().includes(lowerQuery))
      ) {
        results.push(mapping);
      }
    }
  }

  return results;
}

export function generateICD10Summary(
  diseases: Array<{ name: string; probability: number }>
): Array<ICD10Result & { probability: number }> {
  return diseases
    .map(({ name, probability }) => {
      const icd10 = getICD10CodesForDisease(name);
      if (!icd10) return null;
      return { ...icd10, probability };
    })
    .filter((r): r is ICD10Result & { probability: number } => r !== null)
    .sort((a, b) => b.probability - a.probability);
}

export function getICD10Stats(): {
  total_diseases_mapped: number;
  total_codes: number;
  categories: number;
  emergency_codes: number;
} {
  let totalCodes = 0;
  let emergencyCodes = 0;
  const categories = new Set<string>();

  for (const codes of Object.values(DISEASE_TO_ICD10)) {
    totalCodes += codes.length;
    for (const mapping of codes) {
      categories.add(mapping.category);
      if (mapping.urgency === "emergency") emergencyCodes++;
    }
  }

  return {
    total_diseases_mapped: Object.keys(DISEASE_TO_ICD10).length,
    total_codes: totalCodes,
    categories: categories.size,
    emergency_codes: emergencyCodes,
  };
}
