import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { HealthLog } from "@/lib/health-log/types";

/** Stable id for Biscuit in analytics demo data. */
export const DEMO_PET_VET821_ID = "demo-pet-vet-821";

const PET2_ID = "demo-pet-vet-821-scout";

/** Rich demo set for the analytics dashboard (multiple pets, varied dates). */
export const DEMO_ANALYTICS_SYMPTOM_ENTRIES: SymptomCheckEntry[] = [
  {
    id: "demo-an-1",
    pet_id: DEMO_PET_VET821_ID,
    pet_name: "Biscuit",
    created_at: new Date(2026, 3, 5, 10, 30).toISOString(),
    primary_symptom: "Vomiting and lethargy",
    severity: "serious",
    urgency: "urgent",
    top_diagnosis: "Gastroenteritis",
    confidence: 0.82,
    report_summary:
      "Acute vomiting with reduced energy — monitor hydration and seek vet if vomiting persists beyond 12h.",
  },
  {
    id: "demo-an-2",
    pet_id: DEMO_PET_VET821_ID,
    pet_name: "Biscuit",
    created_at: new Date(2026, 3, 1, 14, 0).toISOString(),
    primary_symptom: "Excessive scratching",
    severity: "moderate",
    urgency: "schedule",
    top_diagnosis: "Seasonal allergies",
    confidence: 0.71,
    report_summary: "Pruritus with ear redness — parasite control and vet visit if otitis signs develop.",
  },
  {
    id: "demo-an-3",
    pet_id: DEMO_PET_VET821_ID,
    pet_name: "Biscuit",
    created_at: new Date(2026, 2, 20, 9, 15).toISOString(),
    primary_symptom: "Mild limp after play",
    severity: "mild",
    urgency: "monitor",
    top_diagnosis: "Soft tissue strain",
    confidence: 0.68,
    report_summary: "Brief lameness after exercise — rest and recheck gait within 48 hours.",
  },
  {
    id: "demo-an-4",
    pet_id: DEMO_PET_VET821_ID,
    pet_name: "Biscuit",
    created_at: new Date(2026, 2, 8, 16, 45).toISOString(),
    primary_symptom: "Loose stool",
    severity: "moderate",
    urgency: "schedule",
    top_diagnosis: "Dietary indiscretion",
    confidence: 0.64,
    report_summary: "Intermittent soft stools — bland diet transition and watch for blood or dehydration.",
  },
  {
    id: "demo-an-5",
    pet_id: PET2_ID,
    pet_name: "Scout",
    created_at: new Date(2026, 3, 4, 11, 0).toISOString(),
    primary_symptom: "Coughing after running",
    severity: "moderate",
    urgency: "schedule",
    top_diagnosis: "Collapsing trachea",
    confidence: 0.59,
    report_summary:
      "Episodic cough after activity — reduce exertion and discuss airway evaluation with your veterinarian.",
  },
  {
    id: "demo-an-6",
    pet_id: PET2_ID,
    pet_name: "Scout",
    created_at: new Date(2026, 2, 25, 8, 20).toISOString(),
    primary_symptom: "Sneezing and watery eyes",
    severity: "mild",
    urgency: "monitor",
    top_diagnosis: "Seasonal environmental irritation",
    confidence: 0.55,
    report_summary:
      "Mild upper-airway irritation — monitor discharge and discuss a vet visit if signs worsen.",
  },
  {
    id: "demo-an-7",
    pet_id: DEMO_PET_VET821_ID,
    pet_name: "Biscuit",
    created_at: new Date(2026, 1, 12, 13, 30).toISOString(),
    primary_symptom: "Ear shaking",
    severity: "moderate",
    urgency: "schedule",
    top_diagnosis: "Otitis externa",
    confidence: 0.61,
    report_summary: "Head shake and ear odor — cytology and cleaning per vet; avoid cotton swabs deep in canal.",
  },
  {
    id: "demo-an-8",
    pet_id: PET2_ID,
    pet_name: "Scout",
    created_at: new Date(2026, 1, 5, 17, 0).toISOString(),
    primary_symptom: "Not eating for 24h",
    severity: "serious",
    urgency: "urgent",
    top_diagnosis: "Gastrointestinal upset",
    confidence: 0.73,
    report_summary:
      "A dog refusing food for 24 hours warrants prompt veterinary evaluation, especially if vomiting or lethargy is also present.",
  },
  {
    id: "demo-an-9",
    pet_id: DEMO_PET_VET821_ID,
    pet_name: "Biscuit",
    created_at: new Date(2025, 11, 18, 10, 0).toISOString(),
    primary_symptom: "Pale gums after hike",
    severity: "critical",
    urgency: "emergency",
    top_diagnosis: "Heat exhaustion",
    confidence: 0.77,
    report_summary: "Possible heat stress — cool gradually and seek emergency care if collapse or vomiting.",
  },
];

function dateNDaysAgo(now: Date, n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Demo daily logs for the analytics board, built relative to `now` so the
 * 7-day grid, trends, and timeline always populate regardless of the calendar
 * date. Tells a realistic "gut upset, slowly worsening, vet-worthy" story for
 * Biscuit so the redesigned Health Signals page is fully exercised in demo mode.
 */
export function buildDemoHealthLogs(petId: string, now: Date = new Date()): HealthLog[] {
  const base = (n: number, over: Partial<HealthLog>): HealthLog => ({
    id: `demo-log-${n}`,
    user_id: "demo-user",
    pet_id: petId,
    log_date: dateNDaysAgo(now, n),
    appetite: "normal",
    water: "normal",
    stool: "normal",
    urination: "normal",
    vomiting_count: 0,
    energy: "normal",
    weight_kg: 12.4,
    meds_given: false,
    notes: null,
    photo_urls: [],
    context_signals: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    ...over,
  });

  return [
    base(6, { weight_kg: 12.5 }),
    base(5, { weight_kg: 12.4 }),
    base(4, { stool: "soft", appetite: "reduced", weight_kg: 12.4, notes: "Less playful this evening." }),
    base(3, { stool: "diarrhea", appetite: "reduced", energy: "low", weight_kg: 12.3 }),
    base(2, {
      stool: "soft",
      appetite: "reduced",
      energy: "low",
      vomiting_count: 1,
      meds_given: true,
      weight_kg: 12.3,
      photo_urls: ["demo://stool-photo"],
      context_signals: { medication: { name: "Probiotic", time_given: "18:30" } },
    }),
    base(1, {
      stool: "diarrhea",
      appetite: "reduced",
      energy: "low",
      meds_given: true,
      weight_kg: 12.3,
      context_signals: { medication: { name: "Probiotic", time_given: "08:30" } },
    }),
    base(0, { stool: "diarrhea", appetite: "reduced", energy: "low", weight_kg: 12.4 }),
  ];
}
