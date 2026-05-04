const KEY = "pawvital_care_v2";

/* ─── Baseline ─── */

export type BaselineCategory = "appetite" | "water" | "energy" | "mobility" | "bathroom" | "sleep" | "pacing" | "confusion" | "pain" | "mood";

export type DailyRating = "normal" | "slightly_worse" | "much_worse" | "better";

export interface BaselineEntry {
  date: string;
  ratings: Partial<Record<BaselineCategory, DailyRating>>;
  note: string;
}

/* ─── Care Plans ─── */

export type CarePlanStatus = "active" | "completed" | "escalated";

export interface CarePlanCheckIn {
  time: string;
  answers: Record<string, string>;
  verdict: "stable" | "improving" | "watch" | "call_vet";
}

export interface CarePlan {
  id: string;
  templateId: string;
  title: string;
  symptom: string;
  startedAt: string;
  durationHours: number;
  status: CarePlanStatus;
  checkIns: CarePlanCheckIn[];
  nextCheckInAt: string | null;
  redFlags: string[];
  questions: string[];
}

/* ─── Symptom Log ─── */

export interface SymptomLogEntry {
  id: string;
  date: string;
  symptom: string;
  verdict: "normal" | "watch" | "concern" | "urgent";
  note: string;
  carePlanId: string | null;
}

/* ─── Vet Packet ─── */

export interface VetPacket {
  id: string;
  type: "vet_visit" | "emergency" | "med_review" | "quality_of_life" | "sitter_handoff";
  createdAt: string;
  exported: boolean;
}

/* ─── Main State ─── */

export interface CareState {
  baseline: BaselineEntry[];
  plans: CarePlan[];
  symptomLog: SymptomLogEntry[];
  packets: VetPacket[];
  dogName: string;
}

/* ─── Care Plan Templates ─── */

export interface CarePlanTemplate {
  id: string;
  trigger: string;
  title: string;
  durationHours: number;
  checkIntervalHours: number;
  questions: string[];
  redFlags: string[];
}

export const CARE_PLAN_TEMPLATES: CarePlanTemplate[] = [
  {
    id: "vomiting_24h",
    trigger: "vomiting",
    title: "24-Hour Vomiting Watch",
    durationHours: 24,
    checkIntervalHours: 4,
    questions: ["Vomited again?", "Eating normally?", "Drinking water?", "Energy level normal?", "Any blood in vomit?"],
    redFlags: ["Repeated vomiting (3+ times)", "Blood in vomit", "Won't drink water", "Lethargy or collapse", "Swollen/hard belly"],
  },
  {
    id: "diarrhea_24h",
    trigger: "diarrhea",
    title: "24-Hour Diarrhea Watch",
    durationHours: 24,
    checkIntervalHours: 6,
    questions: ["Diarrhea again?", "Any blood in stool?", "Eating normally?", "Drinking water?", "Energy level?"],
    redFlags: ["Blood in stool", "More than 4 episodes", "Won't eat or drink", "Lethargy", "Vomiting too"],
  },
  {
    id: "limping_14d",
    trigger: "limping",
    title: "14-Day Mobility Watch",
    durationHours: 336,
    checkIntervalHours: 24,
    questions: ["Still limping?", "Worse after walks?", "Able to use stairs?", "Resting more than usual?", "Pain when touched?"],
    redFlags: ["Can't bear weight on leg", "Sudden worsening", "Swelling", "Crying out in pain", "Won't move at all"],
  },
  {
    id: "not_eating_48h",
    trigger: "not_eating",
    title: "48-Hour Appetite Watch",
    durationHours: 48,
    checkIntervalHours: 8,
    questions: ["Ate anything today?", "Interested in treats?", "Drinking water?", "Vomiting?", "Energy normal?"],
    redFlags: ["No food for 24+ hours", "Vomiting when eating", "Lethargy", "Weight loss visible", "Won't drink water"],
  },
  {
    id: "pacing_7d",
    trigger: "pacing",
    title: "7-Day Night Pacing Watch",
    durationHours: 168,
    checkIntervalHours: 24,
    questions: ["Paced at night?", "How long (minutes)?", "Panting too?", "Seemed confused?", "Settled eventually?"],
    redFlags: ["Pacing for hours without stopping", "Collapse or falling", "Not recognizing family", "Continuous panting", "Unable to settle at all"],
  },
  {
    id: "new_med_7d",
    trigger: "new_medication",
    title: "7-Day New Medication Watch",
    durationHours: 168,
    checkIntervalHours: 24,
    questions: ["Any vomiting or diarrhea?", "Appetite changed?", "Energy level different?", "Behavior changes?", "Sleep affected?"],
    redFlags: ["Severe vomiting", "Allergic reaction (swelling, hives)", "Extreme lethargy", "Seizure", "Breathing difficulty"],
  },
  {
    id: "post_vet_14d",
    trigger: "vet_visit",
    title: "Post-Vet Recovery Plan",
    durationHours: 336,
    checkIntervalHours: 24,
    questions: ["Following vet instructions?", "Improvement visible?", "Eating and drinking?", "Any new symptoms?", "Medication being given?"],
    redFlags: ["Symptoms getting worse", "Not responding to treatment", "New symptoms appeared", "Won't eat for 24+ hours", "Fever or lethargy"],
  },
];

export const BASELINE_CATEGORIES: { id: BaselineCategory; label: string; emoji: string }[] = [
  { id: "appetite", label: "Appetite", emoji: "🍖" },
  { id: "water", label: "Water Intake", emoji: "💧" },
  { id: "energy", label: "Energy", emoji: "⚡" },
  { id: "mobility", label: "Mobility", emoji: "🦮" },
  { id: "bathroom", label: "Bathroom", emoji: "🚿" },
  { id: "sleep", label: "Sleep", emoji: "😴" },
  { id: "pacing", label: "Pacing/Restless", emoji: "🔄" },
  { id: "confusion", label: "Confusion", emoji: "❓" },
  { id: "pain", label: "Pain Signs", emoji: "😣" },
  { id: "mood", label: "Mood/Joy", emoji: "🎾" },
];

const RATING_SCORES: Record<DailyRating, number> = { better: 3, normal: 2, slightly_worse: 1, much_worse: 0 };

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function seedBaseline(name: string): CareState {
  const entries: BaselineEntry[] = [];
  const now = new Date();
  const patterns: Partial<Record<BaselineCategory, DailyRating>>[] = [
    { appetite: "normal", water: "normal", energy: "normal", mobility: "slightly_worse", sleep: "normal", mood: "normal" },
    { appetite: "normal", water: "normal", energy: "slightly_worse", mobility: "normal", sleep: "normal", mood: "normal" },
    { appetite: "slightly_worse", water: "normal", energy: "normal", mobility: "normal", sleep: "slightly_worse", pacing: "slightly_worse", mood: "slightly_worse" },
    { appetite: "normal", water: "normal", energy: "normal", mobility: "normal", sleep: "normal", mood: "better" },
    { appetite: "normal", water: "slightly_worse", energy: "normal", mobility: "slightly_worse", sleep: "normal", pain: "slightly_worse", mood: "normal" },
    { appetite: "better", water: "normal", energy: "better", mobility: "normal", sleep: "normal", mood: "better" },
    { appetite: "normal", water: "normal", energy: "normal", mobility: "much_worse", sleep: "slightly_worse", pain: "slightly_worse", mood: "slightly_worse" },
  ];
  for (let i = 20; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    entries.push({ date: d.toISOString().split("T")[0], ratings: patterns[i % patterns.length], note: "" });
  }
  return { baseline: entries, plans: [], symptomLog: [], packets: [], dogName: name };
}

export function loadCare(petName: string): CareState {
  if (typeof window === "undefined") return seedBaseline(petName);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as CareState;
      if (s.baseline?.length > 0) return { ...s, dogName: petName };
    }
  } catch { /* */ }
  const seed = seedBaseline(petName);
  saveCare(seed);
  return seed;
}

export function saveCare(s: CareState): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
}

export function logBaseline(state: CareState, ratings: Partial<Record<BaselineCategory, DailyRating>>, note: string): CareState {
  const d = today();
  const entry: BaselineEntry = { date: d, ratings, note };
  const filtered = state.baseline.filter((e) => e.date !== d);
  const next = { ...state, baseline: [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date)) };
  saveCare(next);
  return next;
}

export function startCarePlan(state: CareState, templateId: string, symptom: string): CareState {
  const tpl = CARE_PLAN_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return state;
  const plan: CarePlan = {
    id: `cp-${Date.now()}`,
    templateId,
    title: tpl.title,
    symptom,
    startedAt: new Date().toISOString(),
    durationHours: tpl.durationHours,
    status: "active",
    checkIns: [],
    nextCheckInAt: new Date(Date.now() + tpl.checkIntervalHours * 3600000).toISOString(),
    redFlags: tpl.redFlags,
    questions: tpl.questions,
  };
  const next = { ...state, plans: [plan, ...state.plans] };
  saveCare(next);
  return next;
}

export function checkInPlan(state: CareState, planId: string, answers: Record<string, string>): CareState {
  const negativeWords = ["yes", "worse", "again", "more", "can't", "won't", "blood", "repeated"];
  const hasNegative = Object.values(answers).some((a) => negativeWords.some((w) => a.toLowerCase().includes(w)));
  const tpl = CARE_PLAN_TEMPLATES.find((t) => t.id === state.plans.find((p) => p.id === planId)?.templateId);
  const interval = tpl?.checkIntervalHours ?? 4;

  const checkIn: CarePlanCheckIn = {
    time: new Date().toISOString(),
    answers,
    verdict: hasNegative ? "watch" : "stable",
  };

  const next = {
    ...state,
    plans: state.plans.map((p) => {
      if (p.id !== planId) return p;
      const checkIns = [...p.checkIns, checkIn];
      const elapsed = Date.now() - new Date(p.startedAt).getTime();
      const done = elapsed >= p.durationHours * 3600000;
      return {
        ...p,
        checkIns,
        status: done ? "completed" as const : p.status,
        nextCheckInAt: done ? null : new Date(Date.now() + interval * 3600000).toISOString(),
      };
    }),
  };
  saveCare(next);
  return next;
}

export function logSymptom(state: CareState, symptom: string, verdict: SymptomLogEntry["verdict"], note: string, carePlanId: string | null): CareState {
  const entry: SymptomLogEntry = { id: `sl-${Date.now()}`, date: today(), symptom, verdict, note, carePlanId };
  const next = { ...state, symptomLog: [entry, ...state.symptomLog].slice(0, 200) };
  saveCare(next);
  return next;
}

export function getChangeScore(state: CareState): { score: number; trend: "improving" | "stable" | "declining"; changes: string[] } {
  const last7 = state.baseline.slice(-7);
  const prev7 = state.baseline.slice(-14, -7);
  if (last7.length < 3) return { score: 0, trend: "stable", changes: [] };

  const avg = (entries: BaselineEntry[]) => {
    let total = 0, count = 0;
    for (const e of entries) {
      for (const [, v] of Object.entries(e.ratings)) {
        total += RATING_SCORES[v as DailyRating] ?? 2;
        count++;
      }
    }
    return count > 0 ? total / count : 2;
  };

  const current = avg(last7);
  const previous = prev7.length >= 3 ? avg(prev7) : current;
  const delta = current - previous;
  const score = Math.round(current * 33.3);

  const changes: string[] = [];
  const cats = BASELINE_CATEGORIES.map((c) => c.id);
  for (const cat of cats) {
    const recentBad = last7.filter((e) => e.ratings[cat] === "much_worse" || e.ratings[cat] === "slightly_worse").length;
    if (recentBad >= 3) {
      const label = BASELINE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
      changes.push(`${label} has been below normal ${recentBad} of the last 7 days`);
    }
  }

  return { score, trend: delta > 0.15 ? "improving" : delta < -0.15 ? "declining" : "stable", changes };
}

export function generateVetPacketText(state: CareState, type: VetPacket["type"]): string {
  const lines: string[] = [];
  lines.push(`=== ${state.dogName}'s ${type === "sitter_handoff" ? "Care Handoff" : "Vet Packet"} ===`);
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push("");

  const cs = getChangeScore(state);
  lines.push(`Health Score: ${cs.score}/100 (${cs.trend})`);
  if (cs.changes.length > 0) {
    lines.push("Changes noticed:");
    cs.changes.forEach((c) => lines.push(`  • ${c}`));
  }
  lines.push("");

  const recent = state.symptomLog.slice(0, 10);
  if (recent.length > 0) {
    lines.push("Recent Symptoms:");
    recent.forEach((s) => lines.push(`  ${s.date} — ${s.symptom} (${s.verdict})`));
    lines.push("");
  }

  const active = state.plans.filter((p) => p.status === "active");
  if (active.length > 0) {
    lines.push("Active Care Plans:");
    active.forEach((p) => lines.push(`  ${p.title} — ${p.checkIns.length} check-ins done`));
    lines.push("");
  }

  lines.push("— Generated by PawVital AI · pawvital.com");
  return lines.join("\n");
}
