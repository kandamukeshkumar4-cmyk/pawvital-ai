/**
 * VET-1509 — Breed-aware modality priors + dog-only benchmark slice registry.
 *
 * Defines dog breed groups with documented modality-relevant elevated risk,
 * and provides the per-pack benchmark slice requirements from the VET-1501
 * scope manifest.
 *
 * Safety rules:
 *   - Breed priors are ADDITIVE context only. They never override deterministic
 *     clinical urgency.
 *   - Every prior must be provenance-backed (reference field is required).
 *   - No prior may lower the urgency below what the complaint + symptom matrix
 *     already established.
 *   - Breed group assignment is approximate; do not gate clinical decisions
 *     solely on breed group membership.
 */

// ---------------------------------------------------------------------------
// Dog breed groups (AKC functional groups + coat/body-type groupings used
// for modality priors — not the same as AKC show groups)
// ---------------------------------------------------------------------------

export type DogBreedGroup =
  | "brachycephalic"        // flat-faced: Bulldog, Pug, French Bulldog, Boston Terrier, Shih Tzu, Pekingese
  | "double_coat_dense"     // Husky, Malamute, Chow, Pomeranian, Samoyed
  | "sporting_retriever"    // Golden Retriever, Labrador, Cocker Spaniel
  | "sighthound"            // Greyhound, Whippet, Saluki, Afghan
  | "giant_breed"           // Great Dane, Mastiff, Saint Bernard, Irish Wolfhound, Bernese
  | "toy_breed"             // Chihuahua, Maltese, Yorkshire Terrier, Toy Poodle
  | "herding"               // Border Collie, Australian Shepherd, German Shepherd
  | "terrier"               // Bull Terrier, Pit Bull, Staffordshire, Jack Russell
  | "hound_scent"           // Basset, Beagle, Bloodhound
  | "working"               // Doberman, Rottweiler, Boxer, Cane Corso
  | "mixed_unknown";        // Unknown or mixed breed — no breed-specific prior applied

export type ModalityPriorStrength = "elevated" | "high" | "highest";

export interface BreedModalityPrior {
  group: DogBreedGroup;
  domain: string;
  risk: ModalityPriorStrength;
  rationale: string;
  reference: string;
}

// ---------------------------------------------------------------------------
// Breed group membership (representative breeds per group)
// ---------------------------------------------------------------------------

export const BREED_GROUP_MEMBERS: Record<DogBreedGroup, string[]> = {
  brachycephalic: [
    "English Bulldog",
    "French Bulldog",
    "Boston Terrier",
    "Pug",
    "Shih Tzu",
    "Pekingese",
    "Boxer",
    "Cavalier King Charles Spaniel",
    "Brussels Griffon",
  ],
  double_coat_dense: [
    "Siberian Husky",
    "Alaskan Malamute",
    "Chow Chow",
    "Pomeranian",
    "Samoyed",
    "Akita",
    "Keeshond",
  ],
  sporting_retriever: [
    "Golden Retriever",
    "Labrador Retriever",
    "Cocker Spaniel",
    "Springer Spaniel",
    "Irish Setter",
    "Flat-Coated Retriever",
    "Nova Scotia Duck Tolling Retriever",
  ],
  sighthound: [
    "Greyhound",
    "Whippet",
    "Italian Greyhound",
    "Saluki",
    "Afghan Hound",
    "Borzoi",
    "Irish Wolfhound",
  ],
  giant_breed: [
    "Great Dane",
    "Mastiff",
    "Saint Bernard",
    "Bernese Mountain Dog",
    "Newfoundland",
    "Irish Wolfhound",
    "Great Pyrenees",
  ],
  toy_breed: [
    "Chihuahua",
    "Maltese",
    "Yorkshire Terrier",
    "Toy Poodle",
    "Pomeranian",
    "Papillon",
    "Miniature Pinscher",
  ],
  herding: [
    "Border Collie",
    "Australian Shepherd",
    "German Shepherd",
    "Belgian Malinois",
    "Shetland Sheepdog",
    "Collie",
    "Cardigan Welsh Corgi",
    "Pembroke Welsh Corgi",
  ],
  terrier: [
    "Bull Terrier",
    "American Pit Bull Terrier",
    "American Staffordshire Terrier",
    "Staffordshire Bull Terrier",
    "Jack Russell Terrier",
    "Scottish Terrier",
    "West Highland White Terrier",
  ],
  hound_scent: [
    "Basset Hound",
    "Beagle",
    "Bloodhound",
    "Coonhound",
    "Dachshund",
  ],
  working: [
    "Doberman Pinscher",
    "Rottweiler",
    "Cane Corso",
    "Giant Schnauzer",
    "Boxer",
  ],
  mixed_unknown: [],
};

// ---------------------------------------------------------------------------
// Modality priors per breed group
// Provenance: veterinary dermatology, internal medicine, and breed-specific
// prevalence literature. References are abbreviated — full citations available
// on request from the clinical reviewer.
// ---------------------------------------------------------------------------

export const BREED_MODALITY_PRIORS: BreedModalityPrior[] = [
  // Skin/wound — dermatology priors
  {
    group: "sporting_retriever",
    domain: "skin_wound",
    risk: "highest",
    rationale: "Golden and Labrador Retrievers have 3× population rate of hot spots (acute moist dermatitis) due to dense coat moisture trapping. Cocker Spaniels have elevated seborrhea and ear disease.",
    reference: "Scott DW et al., Muller and Kirk's Small Animal Dermatology, 7th ed.",
  },
  {
    group: "double_coat_dense",
    domain: "skin_wound",
    risk: "elevated",
    rationale: "Dense double coats predispose to hot spots and hide lesions until severe. Chow Chow has high pyoderma risk.",
    reference: "Gross TL et al., Skin Diseases of the Dog and Cat, 2nd ed.",
  },
  {
    group: "terrier",
    domain: "skin_wound",
    risk: "elevated",
    rationale: "Bull Terrier and American Staffordshire have elevated rates of demodicosis and pyoderma. Pit Bull type dogs have high trauma wound rate in some populations.",
    reference: "Mauldin EA & Peters-Kennedy J, Integumentary System, Jubb Kennedy & Palmer, 6th ed.",
  },

  // Mass/swelling priors
  {
    group: "working",
    domain: "mass_swelling",
    risk: "highest",
    rationale: "Boxers have the highest canine prevalence of mast cell tumors (20–25% of cutaneous tumors). Rottweilers have elevated osteosarcoma risk.",
    reference: "London CA & Thamm DH, Mast Cell Tumors in Withrow & MacEwen's Small Animal Clinical Oncology, 6th ed.",
  },
  {
    group: "giant_breed",
    domain: "mass_swelling",
    risk: "highest",
    rationale: "Giant breeds have disproportionately high osteosarcoma rates (Great Dane, Irish Wolfhound, Saint Bernard). Any new swelling on a limb warrants X-ray.",
    reference: "Ehrhart N, Osteosarcoma in Withrow & MacEwen's Small Animal Clinical Oncology, 6th ed.",
  },
  {
    group: "sporting_retriever",
    domain: "mass_swelling",
    risk: "high",
    rationale: "Golden Retrievers have documented elevated rates of hemangiosarcoma and lymphoma. Any new mass warrants expedited vet evaluation.",
    reference: "Vascellari M et al., Incidence of mammary tumors in the dog. Vet J 2009.",
  },

  // Eye priors
  {
    group: "brachycephalic",
    domain: "eye",
    risk: "highest",
    rationale: "Brachycephalic breeds have exophthalmia (protruding eyes), predisposing to corneal ulceration, exposure keratitis, and proptosis. Any eye discharge or squinting warrants same-day evaluation.",
    reference: "Maggs DJ et al., Slatter's Fundamentals of Veterinary Ophthalmology, 6th ed.",
  },
  {
    group: "sporting_retriever",
    domain: "eye",
    risk: "elevated",
    rationale: "Cocker Spaniels have highest-risk for glaucoma and dry eye (KCS) in the retriever group. Labrador has elevated cataract rate.",
    reference: "Gelatt KN, Veterinary Ophthalmology, 5th ed.",
  },

  // Ear priors
  {
    group: "sporting_retriever",
    domain: "ear",
    risk: "highest",
    rationale: "Cocker Spaniels have highest canine rate of otitis externa due to pendulous pinnae and narrow canal. Labrador and Golden have elevated rates due to moisture exposure and swimming.",
    reference: "Gotthelf LN, Small Animal Ear Diseases, 2nd ed.",
  },
  {
    group: "hound_scent",
    domain: "ear",
    risk: "high",
    rationale: "Basset Hound and Bloodhound have pendulous ears with poor ventilation, predisposing to chronic otitis.",
    reference: "Gotthelf LN, Small Animal Ear Diseases, 2nd ed.",
  },

  // Respiratory audio priors
  {
    group: "brachycephalic",
    domain: "respiratory_cough",
    risk: "highest",
    rationale: "Brachycephalic obstructive airway syndrome (BOAS) creates chronic upper respiratory noise. Any change in baseline respiratory pattern — or new effort — warrants evaluation.",
    reference: "Liu NC et al., BOAS assessment grading — Vet Rec 2015.",
  },
  {
    group: "brachycephalic",
    domain: "respiratory_labored",
    risk: "highest",
    rationale: "Elongated soft palate, stenotic nares, and everted saccules create high obstruction risk. Labored breathing in a brachycephalic dog is an emergency until proven otherwise.",
    reference: "Meola SD, Brachycephalic airway syndrome. Top Companion Anim Med 2013.",
  },
  {
    group: "toy_breed",
    domain: "respiratory_cough",
    risk: "elevated",
    rationale: "Toy breeds, especially Yorkshire Terrier and Chihuahua, have elevated tracheal collapse rate, producing classic goose-honk cough. Pompeian and Maltese also at risk.",
    reference: "Johnson LR, Tracheal collapse, Vet Clin North Am Small Anim Pract 2000.",
  },

  // GI/abdominal priors
  {
    group: "giant_breed",
    domain: "abdominal_distension",
    risk: "highest",
    rationale: "Great Dane has highest GDV (gastric dilatation-volvulus) rate: 42% lifetime risk. Saint Bernard, Irish Wolfhound, Akita, Weimaraner also very high risk. Any abdominal distension + retching is emergency.",
    reference: "Glickman LT et al., Non-dietary risk factors for gastric dilatation-volvulus in large and giant breed dogs. JAVMA 2000.",
  },
  {
    group: "working",
    domain: "abdominal_distension",
    risk: "high",
    rationale: "Rottweiler and Doberman have elevated GDV risk. Standard Poodle also has above-average GDV rate.",
    reference: "Glickman LT et al., JAVMA 2000.",
  },
];

// ---------------------------------------------------------------------------
// Breed group lookup from breed name string
// ---------------------------------------------------------------------------

const BREED_NAME_TO_GROUP: Map<string, DogBreedGroup> = new Map();

for (const [group, breeds] of Object.entries(BREED_GROUP_MEMBERS) as Array<
  [DogBreedGroup, string[]]
>) {
  for (const breed of breeds) {
    BREED_NAME_TO_GROUP.set(breed.toLowerCase(), group);
  }
}

export function inferBreedGroup(breedName: string | null | undefined): DogBreedGroup {
  if (!breedName) return "mixed_unknown";
  return BREED_NAME_TO_GROUP.get(breedName.toLowerCase()) ?? "mixed_unknown";
}

export function getBreedPriorsForDomain(
  group: DogBreedGroup,
  domain: string
): BreedModalityPrior[] {
  if (group === "mixed_unknown") return [];
  return BREED_MODALITY_PRIORS.filter(
    (p) => p.group === group && p.domain === domain
  );
}

export function hasElevatedBreedRisk(
  group: DogBreedGroup,
  domain: string
): boolean {
  return getBreedPriorsForDomain(group, domain).length > 0;
}

// ---------------------------------------------------------------------------
// Benchmark slice manifest (from VET-1501 manifest Section 6)
// ---------------------------------------------------------------------------

export interface BenchmarkSliceRequirement {
  pack: string;
  ticket: string;
  sliceName: string;
  minimumCases: number;
  requiredTags: string[];
  coverageDimensions: string[];
  existingSliceFile: string | null;
}

export const MODALITY_BENCHMARK_SLICE_REQUIREMENTS: BenchmarkSliceRequirement[] = [
  {
    pack: "skin_wound + mass_swelling",
    ticket: "VET-1504",
    sliceName: "dog-triage/skin-wound",
    minimumCases: 40,
    requiredTags: ["modality", "image", "skin_wound"],
    coverageDimensions: [
      "lesion_type",
      "severity",
      "lighting_quality",
      "breed_group",
    ],
    existingSliceFile: "data/benchmarks/dog-triage/multimodal-slices/skin-lesion.jsonl",
  },
  {
    pack: "eye + ear + oral_gum",
    ticket: "VET-1505",
    sliceName: "dog-triage/eye-ear-oral",
    minimumCases: 40,
    requiredTags: ["modality", "image", "eye", "ear", "oral_gum"],
    coverageDimensions: [
      "region",
      "concern_type",
      "image_quality",
      "brachycephalic_vs_other",
    ],
    existingSliceFile: "data/benchmarks/dog-triage/multimodal-slices/gums-color.jsonl",
  },
  {
    pack: "gait_lameness",
    ticket: "VET-1506",
    sliceName: "dog-triage/gait-temporal",
    minimumCases: 20,
    requiredTags: ["modality", "temporal", "gait_lameness"],
    coverageDimensions: [
      "affected_limb",
      "weight_bearing_grade",
      "sequence_length",
      "neuro_vs_orthopedic",
    ],
    existingSliceFile: "data/benchmarks/dog-triage/multimodal-slices/gait-analysis.jsonl",
  },
  {
    pack: "respiratory_audio",
    ticket: "VET-1507",
    sliceName: "dog-triage/respiratory-audio",
    minimumCases: 30,
    requiredTags: ["modality", "audio", "respiratory"],
    coverageDimensions: [
      "sound_type",
      "severity",
      "background_noise",
      "brachycephalic_vs_other",
    ],
    existingSliceFile: "data/benchmarks/dog-triage/multimodal-slices/breathing-effort.jsonl",
  },
  {
    pack: "stool_vomit + abdominal_distension",
    ticket: "VET-1508",
    sliceName: "dog-triage/gi-visual",
    minimumCases: 30,
    requiredTags: ["modality", "image", "stool_vomit", "abdominal_distension"],
    coverageDimensions: [
      "presentation_type",
      "concern_level",
      "image_quality",
      "giant_breed_gdv_risk",
    ],
    existingSliceFile: "data/benchmarks/dog-triage/multimodal-slices/stool-analysis.jsonl",
  },
  {
    pack: "breed_modality_priors",
    ticket: "VET-1509",
    sliceName: "dog-triage/breed-modality",
    minimumCases: 20,
    requiredTags: ["modality", "breed", "breed_prior"],
    coverageDimensions: [
      "breed_group",
      "domain",
      "accuracy_delta_vs_no_prior",
    ],
    existingSliceFile: null,
  },
];
