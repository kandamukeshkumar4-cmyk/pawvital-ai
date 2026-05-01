"use client";

import { useState, useCallback } from "react";
import {
  AlertTriangle,
  Moon,
  Phone,
  MapPin,
  Clock,
  Heart,
  ChevronRight,
  RotateCcw,
  Stethoscope,
  CheckCircle2,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";

type TriageOutcome = "go_now" | "call_today" | "book_soon" | "monitor";

interface TriageQuestion {
  id: string;
  text: string;
  why: string;
  options: { label: string; value: string; weight: number }[];
}

const TRIAGE_QUESTIONS: TriageQuestion[] = [
  {
    id: "breathing",
    text: "How is their breathing right now?",
    why: "Labored breathing or fast panting at rest can signal a heart, lung, or pain emergency.",
    options: [
      { label: "Normal / calm", value: "normal", weight: 0 },
      { label: "Faster than usual", value: "fast", weight: 2 },
      { label: "Labored or struggling", value: "labored", weight: 5 },
    ],
  },
  {
    id: "gums",
    text: "Check their gum color — gently lift the lip.",
    why: "Pale, blue, or white gums can indicate shock, blood loss, or oxygen deprivation — all emergencies.",
    options: [
      { label: "Pink and moist", value: "pink", weight: 0 },
      { label: "Pale or white", value: "pale", weight: 5 },
      { label: "Blue or gray", value: "blue", weight: 6 },
      { label: "Bright red", value: "red", weight: 3 },
      { label: "Can't check right now", value: "unknown", weight: 1 },
    ],
  },
  {
    id: "collapse",
    text: "Can they stand and walk?",
    why: "Inability to stand or walk can indicate a spinal issue, severe pain, toxin ingestion, or neurological emergency.",
    options: [
      { label: "Walking normally", value: "normal", weight: 0 },
      { label: "Wobbly or weak", value: "weak", weight: 3 },
      { label: "Cannot stand / collapsed", value: "collapsed", weight: 6 },
    ],
  },
  {
    id: "pain",
    text: "Are they showing signs of pain?",
    why: "Whimpering, shaking, guarding a body part, or snapping when touched can all signal pain that needs attention.",
    options: [
      { label: "No obvious pain signs", value: "none", weight: 0 },
      { label: "Restless, pacing, or panting", value: "mild", weight: 2 },
      { label: "Whimpering, trembling, or crying", value: "moderate", weight: 3 },
      { label: "Guarding or snapping when touched", value: "severe", weight: 5 },
    ],
  },
  {
    id: "vomiting",
    text: "Any vomiting or diarrhea?",
    why: "Frequency and blood in vomit/stool can differentiate a mild upset from something serious like a blockage or toxin.",
    options: [
      { label: "None", value: "none", weight: 0 },
      { label: "Once or twice", value: "mild", weight: 1 },
      { label: "Repeated (3+ times)", value: "repeated", weight: 3 },
      { label: "Blood in vomit or stool", value: "bloody", weight: 5 },
    ],
  },
  {
    id: "bloat",
    text: "Is their belly hard or swollen? Trying to vomit with nothing coming up?",
    why: "Bloat (GDV) is a life-threatening emergency in dogs. A hard, distended belly with unproductive retching needs immediate ER care.",
    options: [
      { label: "Belly seems normal", value: "normal", weight: 0 },
      { label: "Seems a bit swollen", value: "mild", weight: 2 },
      { label: "Hard belly / trying to retch but can't", value: "bloat", weight: 6 },
    ],
  },
  {
    id: "seizure",
    text: "Any seizure activity?",
    why: "A single brief seizure may be monitored, but clusters or seizures lasting more than 3 minutes need emergency care.",
    options: [
      { label: "No seizures", value: "none", weight: 0 },
      { label: "Had one, now alert", value: "single", weight: 3 },
      { label: "Multiple seizures or still seizing", value: "cluster", weight: 6 },
    ],
  },
  {
    id: "toxin",
    text: "Could they have eaten something toxic?",
    why: "Many household items (chocolate, xylitol, grapes, medications, antifreeze) are toxic to dogs and require fast action.",
    options: [
      { label: "No — nothing unusual", value: "no", weight: 0 },
      { label: "Possibly — something was within reach", value: "possible", weight: 3 },
      { label: "Yes — I know what they ate", value: "yes", weight: 5 },
    ],
  },
];

function getOutcome(answers: Record<string, number>): TriageOutcome {
  const total = Object.values(answers).reduce((a, b) => a + b, 0);
  const max = Math.max(...Object.values(answers), 0);

  if (max >= 6 || total >= 15) return "go_now";
  if (max >= 4 || total >= 10) return "call_today";
  if (total >= 5) return "book_soon";
  return "monitor";
}

const OUTCOME_CONFIG: Record<
  TriageOutcome,
  {
    title: string;
    subtitle: string;
    description: string;
    actions: string[];
    color: string;
    bgColor: string;
    borderColor: string;
    icon: typeof AlertTriangle;
    badgeVariant: "danger" | "warning" | "info" | "success";
  }
> = {
  go_now: {
    title: "Go to Emergency Vet Now",
    subtitle: "Based on what you've described, your dog needs emergency care right away.",
    description:
      "These signs suggest a potentially life-threatening situation. Time matters — please head to the nearest emergency vet clinic now.",
    actions: [
      "Call ahead to the emergency vet so they can prepare",
      "Keep your dog as calm and still as possible during transport",
      "Don't give any food, water, or medication unless the vet says to",
      "Bring a list of any medications your dog is taking",
    ],
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-300",
    icon: AlertTriangle,
    badgeVariant: "danger",
  },
  call_today: {
    title: "Call Your Vet Today",
    subtitle: "These symptoms deserve prompt veterinary attention.",
    description:
      "While likely not a life-or-death emergency, your dog should be seen by a vet today. Call your regular vet as soon as they open, or use an emergency clinic if symptoms worsen before then.",
    actions: [
      "Call your regular vet when they open — describe all the symptoms you've noted",
      "Monitor your dog closely for worsening signs",
      "If breathing difficulty, collapse, or seizures happen, go to ER immediately",
      "Note the time symptoms started and any changes",
    ],
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    icon: Phone,
    badgeVariant: "warning",
  },
  book_soon: {
    title: "Book a Vet Visit Soon",
    subtitle: "These symptoms should be checked, but they're not likely an emergency tonight.",
    description:
      "Your dog's symptoms are worth investigating but don't appear to need immediate emergency care. Book a vet appointment within the next 1–2 days.",
    actions: [
      "Schedule a vet appointment within 1–2 days",
      "Keep a log of symptoms — when they started, how often, and any changes",
      "Watch for red flags: difficulty breathing, collapse, repeated vomiting, or bleeding",
      "If new or worsening symptoms appear, re-run this triage or call your vet",
    ],
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-300",
    icon: Clock,
    badgeVariant: "info",
  },
  monitor: {
    title: "Monitor at Home",
    subtitle: "Things look okay for now — keep a close eye on them.",
    description:
      "Based on your answers, your dog's current symptoms don't suggest an emergency. You know your dog best though — if your gut says something's off, trust yourself and call your vet.",
    actions: [
      "Watch for any changes over the next 12–24 hours",
      "Make sure they're drinking water and able to eat",
      "Note anything unusual — you can log it in PawVital's journal",
      "If symptoms get worse or new ones appear, re-run this triage",
    ],
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-300",
    icon: CheckCircle2,
    badgeVariant: "success",
  },
};

function OutcomePanel({
  outcome,
  petName,
  onStartOver,
}: {
  outcome: TriageOutcome;
  petName: string;
  onStartOver: () => void;
}) {
  const config = OUTCOME_CONFIG[outcome];
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      <Card className={`p-6 ${config.bgColor} ${config.borderColor} border-2`}>
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${config.bgColor} ring-4 ring-white`}
          >
            <Icon className={`h-6 w-6 ${config.color}`} />
          </div>
          <div>
            <Badge variant={config.badgeVariant} className="mb-2">
              {config.title}
            </Badge>
            <h2 className={`text-xl font-bold ${config.color}`}>
              {config.title}
            </h2>
            <p className={`mt-1 text-sm ${config.color} opacity-80`}>
              {config.subtitle}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-gray-700">
          {config.description}
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          What to do right now for {petName}:
        </h3>
        <ul className="space-y-2">
          {config.actions.map((action, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700">{action}</span>
            </li>
          ))}
        </ul>
      </Card>

      {outcome === "go_now" && (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                Find an emergency vet near you
              </p>
              <a
                href="https://www.google.com/maps/search/emergency+veterinarian+near+me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-red-700 underline hover:text-red-900"
              >
                Search &ldquo;emergency vet near me&rdquo; on Google Maps →
              </a>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 border-gray-200">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong>Remember:</strong> This triage tool provides urgency guidance,
          not a diagnosis. It does not replace professional veterinary care. If
          you feel something is seriously wrong, trust your instinct and contact
          a vet — you know your dog best.
        </p>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={onStartOver} className="w-full sm:w-auto">
          <RotateCcw className="mr-2 h-4 w-4" />
          Start Over
        </Button>
        <a
          href="/symptom-checker"
          className="inline-flex items-center justify-center rounded-xl border-2 border-blue-600 px-5 py-2.5 text-base font-semibold text-blue-600 transition-all duration-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto"
        >
          <Stethoscope className="mr-2 h-4 w-4" />
          Full Symptom Check
        </a>
      </div>
    </div>
  );
}

export default function TriagePage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "your dog";

  const [currentStep, setCurrentStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<TriageOutcome | null>(null);

  const handleStart = useCallback(() => setCurrentStep(0), []);

  const handleAnswer = useCallback(
    (questionId: string, weight: number) => {
      const newAnswers = { ...answers, [questionId]: weight };
      setAnswers(newAnswers);

      if (weight >= 6) {
        setOutcome("go_now");
        setCurrentStep(TRIAGE_QUESTIONS.length);
        return;
      }

      const nextStep = currentStep + 1;
      if (nextStep >= TRIAGE_QUESTIONS.length) {
        setOutcome(getOutcome(newAnswers));
        setCurrentStep(TRIAGE_QUESTIONS.length);
      } else {
        setCurrentStep(nextStep);
      }
    },
    [answers, currentStep],
  );

  const handleStartOver = useCallback(() => {
    setCurrentStep(-1);
    setAnswers({});
    setOutcome(null);
  }, []);

  const question = currentStep >= 0 && currentStep < TRIAGE_QUESTIONS.length
    ? TRIAGE_QUESTIONS[currentStep]
    : null;

  const progress = currentStep >= 0
    ? Math.min((currentStep / TRIAGE_QUESTIONS.length) * 100, 100)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-900 text-white">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Late-Night Triage
            </h1>
            <p className="text-sm text-gray-500">
              Quick urgency check for {petName}
            </p>
          </div>
        </div>
        <p className="text-gray-600 text-sm mt-2">
          Answer a few quick questions to help decide if {petName} needs
          emergency care right now, or if it can wait until morning.
        </p>
      </div>

      {/* Emergency banner */}
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            If your dog has <strong>collapsed</strong>, is{" "}
            <strong>struggling to breathe</strong>, having{" "}
            <strong>continuous seizures</strong>, or you suspect{" "}
            <strong>poisoning</strong> — skip this tool and go to the emergency
            vet now.
          </span>
        </div>
      </div>

      {/* Pre-start state */}
      {currentStep === -1 && (
        <Card className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
            <Heart className="h-8 w-8 text-indigo-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Take a breath — let&apos;s figure this out together
          </h2>
          <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
            This quick check takes about 60 seconds. I&apos;ll ask about
            {" "}{petName}&apos;s current state and tell you whether to go to the
            ER, call your vet in the morning, or safely monitor at home.
          </p>
          <Button onClick={handleStart} className="mt-6">
            Start Triage Check
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      )}

      {/* Progress bar */}
      {currentStep >= 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              Question {Math.min(currentStep + 1, TRIAGE_QUESTIONS.length)} of{" "}
              {TRIAGE_QUESTIONS.length}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Active question */}
      {question && (
        <Card className="overflow-hidden">
          <div className="bg-indigo-50 px-5 py-3 border-b border-indigo-100">
            <p className="text-xs font-medium text-indigo-700">
              Why I&apos;m asking: {question.why}
            </p>
          </div>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {question.text}
            </h2>
            <div className="space-y-2">
              {question.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleAnswer(question.id, opt.weight)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-800 transition-all hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-300">
                    <span className="h-2 w-2 rounded-full" />
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Outcome */}
      {outcome && (
        <OutcomePanel
          outcome={outcome}
          petName={petName}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}
