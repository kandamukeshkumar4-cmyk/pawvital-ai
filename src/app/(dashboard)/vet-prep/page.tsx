"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import {
  ClipboardCheck,
  Calendar,
  Pill,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Printer,
  ChevronDown,
  ChevronRight,
  Stethoscope,
  MessageSquare,
  Camera,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import type { Pet } from "@/types";

interface VetPrepConcern {
  id: string;
  text: string;
  priority: "high" | "medium" | "low";
}

interface VetPrepSection {
  id: string;
  title: string;
  icon: typeof ClipboardCheck;
  content: string;
  items?: string[];
  badge?: { text: string; variant: "danger" | "warning" | "info" | "success" };
}

function buildPetSummary(pet: Pet): string {
  const age =
    pet.age_months > 0
      ? `${pet.age_years} years ${pet.age_months} months`
      : `${pet.age_years} years`;
  const parts = [
    `**${pet.name}** — ${pet.breed}, ${age}, ${pet.weight} ${pet.weight_unit}, ${pet.gender}${pet.is_neutered ? " (neutered)" : ""}`,
  ];
  if (pet.existing_conditions.length > 0) {
    parts.push(`Known conditions: ${pet.existing_conditions.join(", ")}`);
  }
  if (pet.medications.length > 0) {
    parts.push(`Current medications: ${pet.medications.join(", ")}`);
  }
  return parts.join("\n");
}

function buildSections(pet: Pet, concerns: VetPrepConcern[]): VetPrepSection[] {
  const sections: VetPrepSection[] = [
    {
      id: "profile",
      title: "Dog Profile",
      icon: FileText,
      content: buildPetSummary(pet),
    },
  ];

  if (pet.existing_conditions.length > 0) {
    sections.push({
      id: "conditions",
      title: "Known Conditions",
      icon: AlertCircle,
      content: `${pet.name} has the following known conditions that may be relevant to today's visit.`,
      items: pet.existing_conditions,
      badge: { text: `${pet.existing_conditions.length} conditions`, variant: "warning" },
    });
  }

  if (pet.medications.length > 0) {
    sections.push({
      id: "medications",
      title: "Current Medications",
      icon: Pill,
      content: "Current medications and supplements:",
      items: pet.medications,
      badge: { text: `${pet.medications.length} active`, variant: "info" },
    });
  }

  if (concerns.length > 0) {
    const highPriority = concerns.filter((c) => c.priority === "high");
    const others = concerns.filter((c) => c.priority !== "high");
    sections.push({
      id: "concerns",
      title: "Your Top Concerns",
      icon: MessageSquare,
      content:
        highPriority.length > 0
          ? `${highPriority.length} high-priority concern${highPriority.length > 1 ? "s" : ""} to discuss first.`
          : "Concerns to discuss with your vet:",
      items: [...highPriority, ...others].map(
        (c) => `[${c.priority.toUpperCase()}] ${c.text}`,
      ),
      badge:
        highPriority.length > 0
          ? { text: `${highPriority.length} urgent`, variant: "danger" as const }
          : undefined,
    });
  }

  return sections;
}

const SUGGESTED_VET_QUESTIONS = [
  "What could be causing these symptoms?",
  "Are there any tests you'd recommend?",
  "Could this be related to their current medications?",
  "What should I watch for at home?",
  "When should I bring them back if things don't improve?",
  "Are there any dietary changes that might help?",
  "Is this normal for their age/breed?",
  "Should we adjust any of their current medications?",
];

function CollapsibleSection({ section }: { section: VetPrepSection }) {
  const [open, setOpen] = useState(true);
  const Icon = section.icon;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <Icon className="h-5 w-5 text-gray-500 shrink-0" />
        <span className="flex-1 text-sm font-semibold text-gray-900">
          {section.title}
        </span>
        {section.badge && (
          <Badge variant={section.badge.variant}>{section.badge.text}</Badge>
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="mt-3 text-sm text-gray-600 whitespace-pre-line">
            {section.content}
          </p>
          {section.items && section.items.length > 0 && (
            <ul className="mt-2 space-y-1">
              {section.items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function buildPlainTextSummary(
  pet: Pet,
  concerns: VetPrepConcern[],
  selectedQuestions: string[],
): string {
  const lines: string[] = [];
  lines.push("=== VET VISIT PREP — PawVital ===");
  lines.push("");
  lines.push(`Dog: ${pet.name}`);
  lines.push(`Breed: ${pet.breed}`);
  const age =
    pet.age_months > 0
      ? `${pet.age_years}y ${pet.age_months}m`
      : `${pet.age_years}y`;
  lines.push(`Age: ${age}`);
  lines.push(`Weight: ${pet.weight} ${pet.weight_unit}`);
  lines.push(`Sex: ${pet.gender}${pet.is_neutered ? " (neutered)" : ""}`);

  if (pet.existing_conditions.length > 0) {
    lines.push("");
    lines.push("KNOWN CONDITIONS:");
    pet.existing_conditions.forEach((c) => lines.push(`  • ${c}`));
  }

  if (pet.medications.length > 0) {
    lines.push("");
    lines.push("CURRENT MEDICATIONS:");
    pet.medications.forEach((m) => lines.push(`  • ${m}`));
  }

  if (concerns.length > 0) {
    lines.push("");
    lines.push("CONCERNS TO DISCUSS:");
    concerns.forEach((c) =>
      lines.push(`  [${c.priority.toUpperCase()}] ${c.text}`),
    );
  }

  if (selectedQuestions.length > 0) {
    lines.push("");
    lines.push("QUESTIONS TO ASK THE VET:");
    selectedQuestions.forEach((q) => lines.push(`  • ${q}`));
  }

  lines.push("");
  lines.push(`Prepared: ${new Date().toLocaleDateString()}`);
  lines.push("Generated by PawVital AI — pawvital.com");

  return lines.join("\n");
}

export default function VetPrepPage() {
  const { activePet } = useAppStore();
  const [concerns, setConcerns] = useState<VetPrepConcern[]>([]);
  const [newConcern, setNewConcern] = useState("");
  const [newPriority, setNewPriority] = useState<VetPrepConcern["priority"]>("medium");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const pet: Pet = useMemo(
    () =>
      activePet ?? {
        id: "demo",
        user_id: "demo",
        name: "Your Dog",
        species: "dog",
        breed: "Unknown",
        age_years: 7,
        age_months: 0,
        weight: 50,
        weight_unit: "lbs",
        gender: "male",
        is_neutered: true,
        existing_conditions: ["Arthritis"],
        medications: ["Carprofen", "Glucosamine"],
        created_at: "",
        updated_at: "",
      },
    [activePet],
  );

  const sections = useMemo(
    () => buildSections(pet, concerns),
    [pet, concerns],
  );

  const addConcern = useCallback(() => {
    const text = newConcern.trim();
    if (!text) return;
    setConcerns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, priority: newPriority },
    ]);
    setNewConcern("");
  }, [newConcern, newPriority]);

  const removeConcern = useCallback((id: string) => {
    setConcerns((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleQuestion = useCallback((q: string) => {
    setSelectedQuestions((prev) =>
      prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q],
    );
  }, []);

  const handleCopy = useCallback(async () => {
    const text = buildPlainTextSummary(pet, concerns, selectedQuestions);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [pet, concerns, selectedQuestions]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addConcern();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Vet Visit Prep
            </h1>
            <p className="text-sm text-gray-500">
              Prepare everything your vet needs for {pet.name}&apos;s visit
            </p>
          </div>
        </div>
        <p className="text-gray-600 text-sm mt-2">
          Build a vet-ready summary with {pet.name}&apos;s profile, conditions,
          medications, your concerns, and questions to ask — then copy or print
          it.
        </p>
      </div>

      {/* Add concerns */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          What do you want to discuss?
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Add your concerns — what&apos;s changed, what worries you, what you
          want the vet to check.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newConcern}
            onChange={(e) => setNewConcern(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`e.g. "${pet.name} has been limping more after walks"`}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select
            value={newPriority}
            onChange={(e) =>
              setNewPriority(e.target.value as VetPrepConcern["priority"])
            }
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <Button onClick={addConcern} disabled={!newConcern.trim()}>
            Add
          </Button>
        </div>

        {concerns.length > 0 && (
          <ul className="mt-3 space-y-2">
            {concerns.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <Badge
                  variant={
                    c.priority === "high"
                      ? "danger"
                      : c.priority === "medium"
                        ? "warning"
                        : "info"
                  }
                >
                  {c.priority}
                </Badge>
                <span className="flex-1 text-sm text-gray-800">{c.text}</span>
                <button
                  onClick={() => removeConcern(c.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                  aria-label="Remove concern"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Questions to ask */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Stethoscope className="h-4 w-4 text-emerald-600" />
          Questions to Ask Your Vet
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Select the questions you want to remember to ask during the
          appointment.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {SUGGESTED_VET_QUESTIONS.map((q) => {
            const selected = selectedQuestions.includes(q);
            return (
              <button
                key={q}
                onClick={() => toggleQuestion(q)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
                  selected
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-emerald-200 hover:bg-emerald-50/50"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                    selected
                      ? "border-emerald-600 bg-emerald-600"
                      : "border-gray-300"
                  }`}
                >
                  {selected && <Check className="h-3 w-3 text-white" />}
                </span>
                {q}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Generated summary */}
      <div ref={summaryRef}>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Vet-Ready Summary
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-1 h-3 w-3" />
                Print
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {sections.map((s) => (
              <CollapsibleSection key={s.id} section={s} />
            ))}

            {selectedQuestions.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Questions to Ask
                </h3>
                <ul className="space-y-1">
                  {selectedQuestions.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Tips */}
      <Card className="p-5 border-emerald-200 bg-emerald-50">
        <h3 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Pro Tips for Your Visit
        </h3>
        <ul className="space-y-1.5 text-sm text-emerald-800">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
            Take photos or short videos of symptoms before the visit — limping,
            skin issues, odd behavior
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
            Note when symptoms started and how often they happen
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
            Bring all medication bottles — including supplements and CBD
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
            Write down your top 3 concerns so you don&apos;t forget in the moment
          </li>
        </ul>
      </Card>
    </div>
  );
}
