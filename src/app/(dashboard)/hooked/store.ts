const KEY = "pawvital_hooked";

export interface DayEntry {
  date: string;
  symptomChecks: string[];
  score: number;
  note: string;
  behaviors: string[];
}

export interface HookedState {
  streak: number;
  lastLogDate: string | null;
  insightsUnlocked: number;
  history: DayEntry[];
  vetReportStrength: number;
}

export const QUICK_SYMPTOMS = [
  { id: "panting", emoji: "😮‍💨", label: "Panting at rest" },
  { id: "not_eating", emoji: "🍽️", label: "Not eating" },
  { id: "limping", emoji: "🦿", label: "Limping" },
  { id: "pacing", emoji: "🔄", label: "Pacing / restless" },
  { id: "vomiting", emoji: "🤢", label: "Vomiting" },
  { id: "diarrhea", emoji: "💧", label: "Diarrhea" },
  { id: "hiding", emoji: "🫣", label: "Hiding / withdrawn" },
  { id: "confused", emoji: "❓", label: "Confused / disoriented" },
  { id: "drinking_more", emoji: "💦", label: "Drinking more water" },
  { id: "accidents", emoji: "🚿", label: "Bathroom accidents" },
  { id: "coughing", emoji: "😷", label: "Coughing" },
  { id: "shaking", emoji: "🫨", label: "Trembling / shaking" },
];

export const DAILY_BEHAVIORS = [
  { id: "walk", emoji: "🚶", label: "Walked", effect: 5 },
  { id: "ate_well", emoji: "🍖", label: "Ate full meals", effect: 4 },
  { id: "meds_given", emoji: "💊", label: "Meds given", effect: 4 },
  { id: "good_sleep", emoji: "😴", label: "Slept well", effect: 4 },
  { id: "playful", emoji: "🎾", label: "Playful", effect: 5 },
  { id: "calm", emoji: "☀️", label: "Calm day", effect: 3 },
  { id: "pain_signs", emoji: "😣", label: "Pain signs", effect: -5 },
  { id: "low_energy", emoji: "😶", label: "Low energy", effect: -3 },
  { id: "night_pacing", emoji: "🌙", label: "Paced at night", effect: -4 },
  { id: "accident", emoji: "💧", label: "Had accident", effect: -3 },
];

const INSIGHTS = [
  { day: 3, text: "Appetite pattern starting to emerge from your logs." },
  { day: 5, text: "First behavior correlation detected — walk days vs. rest days." },
  { day: 7, text: "Weekly summary ready. Cooper had 5 good days out of 7." },
  { day: 10, text: "Medication adherence is 90%. Missing PM doses affects next-day score." },
  { day: 14, text: "Baseline established! Deviations will now trigger alerts." },
  { day: 21, text: "3-week trend: mobility is stable but appetite dips on rainy days." },
  { day: 30, text: "Full monthly report ready to share with your vet." },
];

export function getInsightForDay(streak: number): string | null {
  const match = INSIGHTS.find((i) => i.day === streak);
  return match?.text ?? null;
}

export function getNextInsightDay(streak: number): number {
  const next = INSIGHTS.find((i) => i.day > streak);
  return next?.day ?? streak + 7;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function seedHistory(): DayEntry[] {
  const entries: DayEntry[] = [];
  const now = new Date();
  const sets = [
    { b: ["walk", "ate_well", "meds_given", "good_sleep"], s: ["panting"] },
    { b: ["ate_well", "meds_given", "calm"], s: [] },
    { b: ["walk", "ate_well", "meds_given", "good_sleep", "playful"], s: [] },
    { b: ["meds_given", "low_energy", "pain_signs"], s: ["limping"] },
    { b: ["walk", "ate_well", "meds_given", "good_sleep"], s: [] },
    { b: ["ate_well", "meds_given", "night_pacing"], s: ["pacing"] },
    { b: ["walk", "ate_well", "meds_given", "playful", "good_sleep"], s: [] },
  ];
  for (let i = 14; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const s = sets[i % sets.length];
    const score = 50 + s.b.reduce((sum, id) => {
      const beh = DAILY_BEHAVIORS.find((x) => x.id === id);
      return sum + (beh?.effect ?? 0);
    }, 0);
    entries.push({
      date: d.toISOString().split("T")[0],
      symptomChecks: s.s,
      score: Math.max(10, Math.min(100, score)),
      note: "",
      behaviors: s.b,
    });
  }
  return entries;
}

export function load(): HookedState {
  if (typeof window === "undefined") {
    return { streak: 14, lastLogDate: null, insightsUnlocked: 4, history: seedHistory(), vetReportStrength: 47 };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as HookedState;
      if (s.history?.length > 0) return s;
    }
  } catch { /* */ }
  const seed: HookedState = {
    streak: 14,
    lastLogDate: null,
    insightsUnlocked: 4,
    history: seedHistory(),
    vetReportStrength: 47,
  };
  save(seed);
  return seed;
}

export function save(s: HookedState): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
}

export function logToday(
  state: HookedState,
  behaviors: string[],
  symptoms: string[],
  note: string,
): HookedState {
  const d = today();
  const score = 50 + behaviors.reduce((sum, id) => {
    const beh = DAILY_BEHAVIORS.find((x) => x.id === id);
    return sum + (beh?.effect ?? 0);
  }, 0) - symptoms.length * 4;

  const entry: DayEntry = {
    date: d,
    symptomChecks: symptoms,
    score: Math.max(10, Math.min(100, score)),
    note,
    behaviors,
  };

  const hist = [...state.history.filter((e) => e.date !== d), entry].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const isNewDay = state.lastLogDate !== d;
  const newStreak = isNewDay ? state.streak + 1 : state.streak;
  const newInsights = getInsightForDay(newStreak)
    ? state.insightsUnlocked + 1
    : state.insightsUnlocked;

  const strength = Math.min(100, Math.round((hist.length / 30) * 100));

  const next: HookedState = {
    streak: newStreak,
    lastLogDate: d,
    insightsUnlocked: newInsights,
    history: hist,
    vetReportStrength: strength,
  };
  save(next);
  return next;
}

export function getIsNormalResponse(
  symptomId: string,
  petName: string,
  history: DayEntry[],
): { verdict: "normal" | "watch" | "concern" | "urgent"; message: string } {
  const sym = QUICK_SYMPTOMS.find((s) => s.id === symptomId);
  const label = sym?.label.toLowerCase() ?? symptomId;
  const recentDays = history.slice(-14);
  const prevOccurrences = recentDays.filter((d) =>
    d.symptomChecks.includes(symptomId),
  ).length;

  if (["vomiting", "shaking", "coughing"].includes(symptomId) && prevOccurrences >= 2) {
    return {
      verdict: "urgent",
      message: `${label} has occurred ${prevOccurrences + 1} times in 2 weeks for ${petName}. This pattern warrants a vet call today. Bring your PawVital vet report — it shows the full timeline.`,
    };
  }
  if (["confused", "hiding", "accidents"].includes(symptomId)) {
    return {
      verdict: "concern",
      message: `${label} in a senior dog can be connected to cognitive changes or pain. It's worth monitoring closely and mentioning at ${petName}'s next vet visit. Tap "Log Check-in" to add this to the timeline.`,
    };
  }
  if (prevOccurrences >= 3) {
    return {
      verdict: "watch",
      message: `${label} has come up ${prevOccurrences} times in the past 2 weeks for ${petName}. Individually each episode may not be alarming, but the frequency is worth tracking. Keep logging — the pattern will become clearer.`,
    };
  }
  if (["drinking_more", "not_eating"].includes(symptomId)) {
    return {
      verdict: "watch",
      message: `A single day of ${label} can be normal for ${petName}. But if it continues for 2+ days, it's worth a vet call — especially with a senior dog. Log today's check-in so the app can track the trend.`,
    };
  }
  return {
    verdict: "normal",
    message: `An occasional episode of ${label} is within normal range for a senior dog like ${petName}. Keep an eye on it today. If it happens again tomorrow, log it and the app will flag the pattern.`,
  };
}
