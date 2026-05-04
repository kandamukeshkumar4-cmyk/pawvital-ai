"use client";

import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { AlertTriangle, ChevronRight, Shield, Sparkles, Zap } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import {
  loadCare, logSymptom, startCarePlan,
  CARE_PLAN_TEMPLATES,
  type CareState, type SymptomLogEntry,
} from "@/lib/care-engine/store";

const hydrate = useSyncExternalStore.bind(null, () => () => {}, () => true, () => false);

const SYMPTOMS = [
  { id: "vomiting", emoji: "🤢", label: "Vomiting" },
  { id: "not_eating", emoji: "🍽️", label: "Not eating" },
  { id: "limping", emoji: "🦿", label: "Limping" },
  { id: "diarrhea", emoji: "💧", label: "Diarrhea" },
  { id: "pacing", emoji: "🔄", label: "Pacing / restless" },
  { id: "panting", emoji: "😮‍💨", label: "Panting at rest" },
  { id: "hiding", emoji: "🫣", label: "Hiding" },
  { id: "confused", emoji: "❓", label: "Confused" },
  { id: "drinking_more", emoji: "💦", label: "Drinking more" },
  { id: "coughing", emoji: "😷", label: "Coughing" },
  { id: "shaking", emoji: "🫨", label: "Trembling" },
  { id: "accidents", emoji: "🚿", label: "Bathroom accidents" },
];

function getVerdict(symptomId: string, history: SymptomLogEntry[]): { verdict: SymptomLogEntry["verdict"]; message: string } {
  const recent = history.filter((e) => e.symptom === symptomId).length;
  if (["vomiting", "shaking", "coughing"].includes(symptomId) && recent >= 2)
    return { verdict: "urgent", message: "This has occurred multiple times recently. Call your vet today." };
  if (["confused", "hiding", "accidents"].includes(symptomId))
    return { verdict: "concern", message: "Worth monitoring closely and mentioning at the next vet visit." };
  if (recent >= 3)
    return { verdict: "watch", message: "Frequency is increasing. Keep tracking — the pattern matters." };
  if (["drinking_more", "not_eating"].includes(symptomId))
    return { verdict: "watch", message: "One day can be normal. If it continues 2+ days, call your vet." };
  return { verdict: "normal", message: "A single episode is within normal range for a senior dog. Keep watching." };
}

const VERDICT_STYLES = {
  normal: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "success" as const, label: "Likely Normal" },
  watch: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", badge: "warning" as const, label: "Worth Watching" },
  concern: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", badge: "warning" as const, label: "Monitor Closely" },
  urgent: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", badge: "danger" as const, label: "Call Your Vet" },
};

export default function CheckNowPage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "Cooper";
  const ready = hydrate();

  const [care, setCare] = useState<CareState>(() => loadCare(petName));
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ verdict: SymptomLogEntry["verdict"]; message: string } | null>(null);
  const [planStarted, setPlanStarted] = useState(false);

  const matchingTemplate = useMemo(
    () => selected ? CARE_PLAN_TEMPLATES.find((t) => t.trigger === selected) : null,
    [selected],
  );

  const handleTap = useCallback((id: string) => {
    setSelected(id);
    setPlanStarted(false);
    const v = getVerdict(id, care.symptomLog);
    setResult(v);
    const next = logSymptom(care, id, v.verdict, "", null);
    setCare(next);
  }, [care]);

  const handleStartPlan = useCallback(() => {
    if (!matchingTemplate || !selected) return;
    const next = startCarePlan(care, matchingTemplate.id, selected);
    setCare(next);
    setPlanStarted(true);
  }, [care, matchingTemplate, selected]);

  if (!ready) return <div className="flex items-center justify-center py-24 text-gray-400">Loading...</div>;

  const vs = result ? VERDICT_STYLES[result.verdict] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div className="text-center pt-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg mb-3">
          <Zap className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Is this normal?</h1>
        <p className="text-sm text-gray-500 mt-1">Tap what you&apos;re seeing. Get an instant answer for {petName}.</p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>If {petName} has <strong>collapsed</strong>, is <strong>struggling to breathe</strong>, or you suspect <strong>poisoning</strong> — skip this and go to the emergency vet now.</span>
        </div>
      </div>

      <Card className="p-5">
        <p className="text-sm font-semibold text-gray-700 mb-3">What are you seeing right now?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SYMPTOMS.map((s) => (
            <button key={s.id} onClick={() => handleTap(s.id)}
              className={`flex items-center gap-2.5 rounded-xl border-2 px-3.5 py-3.5 text-left transition-all ${
                selected === s.id
                  ? "border-indigo-500 bg-indigo-50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-indigo-200"
              }`}
            >
              <span className="text-xl">{s.emoji}</span>
              <span className="text-sm font-medium text-gray-800">{s.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {result && vs && (
        <Card className={`p-5 ${vs.bg} ${vs.border} border-2`}>
          <Badge variant={vs.badge} className="mb-2 text-sm px-3 py-1">{vs.label}</Badge>
          <p className={`text-sm leading-relaxed ${vs.text}`}>{result.message}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Shield className="h-3 w-3" />
            <span>Based on {petName}&apos;s recent history. Not a diagnosis.</span>
          </div>
        </Card>
      )}

      {matchingTemplate && !planStarted && (
        <Card className="p-5 border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-sm font-bold text-gray-900">{matchingTemplate.title}</p>
              <p className="text-xs text-gray-500">PawVital will guide you through the next {matchingTemplate.durationHours < 48 ? `${matchingTemplate.durationHours} hours` : `${Math.round(matchingTemplate.durationHours / 24)} days`}</p>
            </div>
          </div>
          <ul className="space-y-1.5 mb-4">
            {matchingTemplate.questions.slice(0, 3).map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                {q}
              </li>
            ))}
            {matchingTemplate.questions.length > 3 && (
              <li className="text-xs text-gray-400 pl-6">+ {matchingTemplate.questions.length - 3} more check-in questions</li>
            )}
          </ul>
          <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-red-800 mb-1">Red flags to watch for:</p>
              <ul className="text-xs text-red-700 space-y-0.5">
                {matchingTemplate.redFlags.slice(0, 3).map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          </div>
          <Button onClick={handleStartPlan}>
            Start Monitoring Plan <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Card>
      )}

      {planStarted && (
        <Card className="p-5 border-2 border-emerald-300 bg-emerald-50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">✅</span>
            <p className="text-sm font-bold text-emerald-800">Care plan started!</p>
          </div>
          <p className="text-sm text-emerald-700">
            Go to <strong>Today</strong> to see your active plan and complete check-ins.
            PawVital will remind you when the next check-in is due.
          </p>
          <a href="/today" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900">
            Go to Today <ChevronRight className="h-4 w-4" />
          </a>
        </Card>
      )}
    </div>
  );
}
