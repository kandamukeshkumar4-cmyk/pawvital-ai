const STORAGE_KEY = "pawvital_hub";

export interface BehaviorEntry {
  id: string;
  label: string;
  emoji: string;
  effect: number;
}

export interface DayLog {
  date: string;
  behaviors: string[];
  note: string;
  score: number;
  savedAt: string;
}

export interface FeedItem {
  id: string;
  who: string;
  action: string;
  time: string;
  icon: string;
}

export interface HubState {
  history: DayLog[];
  feed: FeedItem[];
}

export const ALL_BEHAVIORS: BehaviorEntry[] = [
  { id: "walk", label: "Walk", emoji: "🚶", effect: 6 },
  { id: "full_meal", label: "Ate full meal", emoji: "🍖", effect: 5 },
  { id: "treats", label: "Treats", emoji: "🦴", effect: 1 },
  { id: "meds_am", label: "AM meds given", emoji: "💊", effect: 4 },
  { id: "meds_pm", label: "PM meds given", emoji: "💊", effect: 4 },
  { id: "good_sleep", label: "Good sleep", emoji: "😴", effect: 5 },
  { id: "playful", label: "Playful / engaged", emoji: "🎾", effect: 6 },
  { id: "pacing", label: "Pacing / restless", emoji: "🔄", effect: -5 },
  { id: "limping", label: "Limping", emoji: "🦿", effect: -6 },
  { id: "accident", label: "Bathroom accident", emoji: "💧", effect: -4 },
  { id: "visitors", label: "Visitors / disruption", emoji: "🏠", effect: -2 },
  { id: "confused", label: "Seemed confused", emoji: "❓", effect: -5 },
  { id: "rain", label: "Rainy / cold weather", emoji: "🌧️", effect: -2 },
  { id: "vomit", label: "Vomited", emoji: "🤢", effect: -7 },
];

const BASE_SCORE = 50;
const MAX_SCORE = 100;
const MIN_SCORE = 10;

export function computeScore(activeIds: string[]): number {
  let score = BASE_SCORE;
  for (const id of activeIds) {
    const b = ALL_BEHAVIORS.find((x) => x.id === id);
    if (b) score += b.effect;
  }
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
}

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function generateSeedHistory(): DayLog[] {
  const days: DayLog[] = [];
  const now = new Date();
  const behaviorSets: string[][] = [
    ["walk", "full_meal", "meds_am", "meds_pm", "good_sleep"],
    ["full_meal", "meds_am", "meds_pm", "pacing"],
    ["walk", "full_meal", "meds_am", "meds_pm", "good_sleep", "playful"],
    ["full_meal", "meds_am", "limping", "rain"],
    ["meds_am", "meds_pm", "pacing", "confused", "accident"],
    ["walk", "full_meal", "meds_am", "meds_pm", "good_sleep", "playful", "treats"],
    ["full_meal", "meds_am", "meds_pm", "good_sleep"],
  ];
  for (let i = 29; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const set = behaviorSets[i % behaviorSets.length];
    days.push({
      date: d.toISOString().split("T")[0],
      behaviors: set,
      note: "",
      score: computeScore(set),
      savedAt: d.toISOString(),
    });
  }
  return days;
}

function generateSeedFeed(): FeedItem[] {
  return [
    { id: "s1", who: "Mike", action: "Confirmed AM Gabapentin ✓", time: "3h ago", icon: "💊" },
    { id: "s2", who: "You", action: "Logged: limping after walk", time: "5h ago", icon: "📝" },
    { id: "s3", who: "Sarah", action: "Viewed emergency card", time: "Yesterday", icon: "🆘" },
    { id: "s4", who: "Dr. Wilson", action: "Viewed April Health Report", time: "3 days ago", icon: "📋" },
  ];
}

export function loadState(): HubState {
  if (typeof window === "undefined") {
    return { history: generateSeedHistory(), feed: generateSeedFeed() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HubState;
      if (parsed.history && parsed.history.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const seed: HubState = { history: generateSeedHistory(), feed: generateSeedFeed() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

export function saveState(state: HubState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

export function getTodayLog(state: HubState): DayLog | null {
  const key = todayKey();
  return state.history.find((d) => d.date === key) ?? null;
}

export function saveTodayLog(
  state: HubState,
  behaviors: string[],
  note: string,
): HubState {
  const key = todayKey();
  const score = computeScore(behaviors);
  const entry: DayLog = {
    date: key,
    behaviors,
    note,
    score,
    savedAt: new Date().toISOString(),
  };

  const filtered = state.history.filter((d) => d.date !== key);
  const newHistory = [...filtered, entry].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const feedEntry: FeedItem = {
    id: `f-${Date.now()}`,
    who: "You",
    action: `Updated Paw Score — ${score}`,
    time: "Just now",
    icon: "📊",
  };
  const newFeed = [feedEntry, ...state.feed].slice(0, 20);

  const next: HubState = { history: newHistory, feed: newFeed };
  saveState(next);
  return next;
}

export function addFeedItem(
  state: HubState,
  who: string,
  action: string,
  icon: string,
): HubState {
  const item: FeedItem = {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    who,
    action,
    time: "Just now",
    icon,
  };
  const next: HubState = {
    ...state,
    feed: [item, ...state.feed].slice(0, 20),
  };
  saveState(next);
  return next;
}

export function getScoreHistory(
  state: HubState,
  days = 30,
): { date: string; label: string; score: number }[] {
  const slice = state.history.slice(-days);
  return slice.map((d) => ({
    date: d.date,
    label: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    score: d.score,
  }));
}

export function getStats(state: HubState) {
  const last30 = state.history.slice(-30);
  const scores = last30.map((d) => d.score);
  const avg =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  const last7 = last30.slice(-7);
  const prev7 = last30.slice(-14, -7);
  const avg7 =
    last7.length > 0
      ? Math.round(last7.reduce((s, d) => s + d.score, 0) / last7.length)
      : 0;
  const avgPrev7 =
    prev7.length > 0
      ? Math.round(prev7.reduce((s, d) => s + d.score, 0) / prev7.length)
      : avg7;

  const goodDays = last30.filter((d) => d.score >= 65).length;
  const toughDays = last30.filter((d) => d.score < 50).length;

  const allBehaviors = last30.flatMap((d) => d.behaviors);
  const medAm = allBehaviors.filter((b) => b === "meds_am").length;
  const medPm = allBehaviors.filter((b) => b === "meds_pm").length;
  const totalMedOpps = last30.length * 2;
  const medAdherence =
    totalMedOpps > 0
      ? Math.round(((medAm + medPm) / totalMedOpps) * 100)
      : 0;

  const negBehaviors = ["pacing", "limping", "accident", "confused", "vomit"];
  const symptomEpisodes = last30.filter((d) =>
    d.behaviors.some((b) => negBehaviors.includes(b)),
  ).length;

  return {
    avg30: avg,
    avg7,
    weekDelta: avg7 - avgPrev7,
    goodDays,
    toughDays,
    totalDays: last30.length,
    medAdherence,
    symptomEpisodes,
  };
}

export function getCorrelations(state: HubState) {
  const last30 = state.history.slice(-30);
  if (last30.length < 5) return [];

  const results: {
    id: string;
    insight: string;
    impact: "positive" | "negative";
    confidence: number;
    behavior: string;
    metric: string;
    delta: string;
  }[] = [];

  const checkBehavior = (
    id: string,
    label: string,
    emoji: string,
  ) => {
    const withB = last30.filter((d) => d.behaviors.includes(id));
    const withoutB = last30.filter((d) => !d.behaviors.includes(id));
    if (withB.length < 3 || withoutB.length < 3) return;

    const avgWith = withB.reduce((s, d) => s + d.score, 0) / withB.length;
    const avgWithout =
      withoutB.reduce((s, d) => s + d.score, 0) / withoutB.length;
    const diff = Math.round(avgWith - avgWithout);
    if (Math.abs(diff) < 2) return;

    const confidence = Math.min(95, 50 + withB.length * 3);
    const positive = diff > 0;

    results.push({
      id: `cor-${id}`,
      insight: positive
        ? `Paw Score is ${Math.abs(diff)} points higher on days with ${label.toLowerCase()}`
        : `Paw Score drops ${Math.abs(diff)} points on days with ${label.toLowerCase()}`,
      impact: positive ? "positive" : "negative",
      confidence,
      behavior: `${emoji} ${label}`,
      metric: "Paw Score",
      delta: `${diff >= 0 ? "+" : ""}${diff} pts`,
    });
  };

  for (const b of ALL_BEHAVIORS) {
    checkBehavior(b.id, b.label, b.emoji);
  }

  results.sort((a, b) => Math.abs(parseInt(b.delta)) - Math.abs(parseInt(a.delta)));
  return results.slice(0, 5);
}
