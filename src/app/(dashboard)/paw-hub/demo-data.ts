export interface PawScoreDay {
  date: string;
  score: number;
  label: string;
}

export interface BehaviorLog {
  id: string;
  label: string;
  emoji: string;
  active: boolean;
}

export interface AICorrelation {
  id: string;
  insight: string;
  impact: "positive" | "negative" | "neutral";
  confidence: number;
  behavior: string;
  metric: string;
  delta: string;
}

export interface CareCircleMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  lastActive: string;
  color: string;
}

export interface ActivityFeedItem {
  id: string;
  memberId: string;
  memberName: string;
  action: string;
  time: string;
  icon: string;
}

export interface MonthlyReportData {
  month: string;
  avgScore: number;
  prevAvgScore: number;
  goodDays: number;
  toughDays: number;
  totalDays: number;
  medAdherence: number;
  topConcern: string;
  topInsight: string;
  symptomCount: number;
  vetVisits: number;
}

function generateScoreHistory(): PawScoreDay[] {
  const days: PawScoreDay[] = [];
  const now = new Date();
  const patterns = [72, 68, 75, 71, 65, 78, 80, 74, 69, 73, 76, 62, 70, 77,
    79, 72, 66, 74, 81, 73, 67, 75, 78, 71, 64, 76, 82, 70, 73, 68];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const score = patterns[29 - i];
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    days.push({ date: d.toISOString().split("T")[0], score, label });
  }
  return days;
}

export const DEMO_SCORE_HISTORY = generateScoreHistory();

export const DEMO_TODAY_SCORE = 74;

export const DEMO_BEHAVIORS: BehaviorLog[] = [
  { id: "walk", label: "Walk", emoji: "🚶", active: false },
  { id: "full_meal", label: "Ate full meal", emoji: "🍖", active: false },
  { id: "treats", label: "Treats", emoji: "🦴", active: false },
  { id: "meds_am", label: "AM meds given", emoji: "💊", active: false },
  { id: "meds_pm", label: "PM meds given", emoji: "💊", active: false },
  { id: "good_sleep", label: "Good sleep", emoji: "😴", active: false },
  { id: "pacing", label: "Pacing/restless", emoji: "🔄", active: false },
  { id: "limping", label: "Limping", emoji: "🦿", active: false },
  { id: "accident", label: "Bathroom accident", emoji: "💧", active: false },
  { id: "visitors", label: "Visitors/disruption", emoji: "🏠", active: false },
  { id: "car_ride", label: "Car ride", emoji: "🚗", active: false },
  { id: "playful", label: "Playful/engaged", emoji: "🎾", active: false },
  { id: "confused", label: "Seemed confused", emoji: "❓", active: false },
  { id: "rain", label: "Rainy/cold weather", emoji: "🌧️", active: false },
];

export const DEMO_CORRELATIONS: AICorrelation[] = [
  {
    id: "c1",
    insight: "Paw Score is 18% higher on days with a walk",
    impact: "positive",
    confidence: 87,
    behavior: "Walk",
    metric: "Overall Score",
    delta: "+13 pts",
  },
  {
    id: "c2",
    insight: "Appetite drops on days after visitors come over",
    impact: "negative",
    confidence: 72,
    behavior: "Visitors",
    metric: "Appetite",
    delta: "−2.1 pts",
  },
  {
    id: "c3",
    insight: "Sleep quality improves when PM meds are given before 7 PM",
    impact: "positive",
    confidence: 81,
    behavior: "PM Meds (early)",
    metric: "Sleep",
    delta: "+1.8 pts",
  },
  {
    id: "c4",
    insight: "Limping episodes are 3× more likely on rainy days",
    impact: "negative",
    confidence: 68,
    behavior: "Rain",
    metric: "Mobility",
    delta: "3× risk",
  },
  {
    id: "c5",
    insight: "Pacing at night occurs less on days with morning walks",
    impact: "positive",
    confidence: 76,
    behavior: "Walk",
    metric: "Night Rest",
    delta: "−40%",
  },
];

export const DEMO_CARE_CIRCLE: CareCircleMember[] = [
  { id: "m1", name: "You", role: "Primary caregiver", avatar: "👩", lastActive: "Just now", color: "bg-blue-500" },
  { id: "m2", name: "Mike", role: "Partner", avatar: "👨", lastActive: "2h ago", color: "bg-emerald-500" },
  { id: "m3", name: "Sarah", role: "Pet sitter", avatar: "👩‍🦰", lastActive: "Yesterday", color: "bg-purple-500" },
  { id: "m4", name: "Dr. Wilson", role: "Veterinarian", avatar: "👨‍⚕️", lastActive: "3 days ago", color: "bg-amber-500" },
];

export const DEMO_ACTIVITY_FEED: ActivityFeedItem[] = [
  { id: "a1", memberId: "m1", memberName: "You", action: "Updated Paw Score — 74", time: "10 min ago", icon: "📊" },
  { id: "a2", memberId: "m2", memberName: "Mike", action: "Confirmed AM Gabapentin ✓", time: "3h ago", icon: "💊" },
  { id: "a3", memberId: "m1", memberName: "You", action: "Logged: limping after walk", time: "5h ago", icon: "📝" },
  { id: "a4", memberId: "m3", memberName: "Sarah", action: "Viewed emergency card", time: "Yesterday", icon: "🆘" },
  { id: "a5", memberId: "m2", memberName: "Mike", action: "Confirmed PM Gabapentin ✓", time: "Yesterday", icon: "💊" },
  { id: "a6", memberId: "m4", memberName: "Dr. Wilson", action: "Viewed April Health Report", time: "3 days ago", icon: "📋" },
  { id: "a7", memberId: "m1", memberName: "You", action: "Shared Monthly Report with vet", time: "3 days ago", icon: "📤" },
];

export const DEMO_MONTHLY_REPORT: MonthlyReportData = {
  month: "April 2026",
  avgScore: 72,
  prevAvgScore: 76,
  goodDays: 18,
  toughDays: 5,
  totalDays: 30,
  medAdherence: 93,
  topConcern: "Mobility declined — limping noted 8× (up from 3× in March)",
  topInsight: "Appetite is 22% better on days with a morning walk",
  symptomCount: 12,
  vetVisits: 1,
};
