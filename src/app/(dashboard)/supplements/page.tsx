"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Pill,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ShieldCheck,
  Circle,
  HelpCircle,
  FileText,
  Activity,
} from "lucide-react";
import type { DetectedSignal } from "@/lib/dog-brain/types";
import { PrivateTesterQuarantinedSurface } from "@/components/private-tester/quarantined-surface";
import { getPrivateTesterQuarantinedSurface } from "@/lib/private-tester-scope";
import { useAppStore } from "@/store/app-store";
import { FollowupsPanel } from "@/components/dog-brain/followups-panel";

interface SupplementItem {
  name: string;
  purpose: string;
  dosage: string;
  frequency: string;
  brand: string;
  price: string;
  priority: "essential" | "recommended" | "optional";
}

interface SupplementPlan {
  supplements: SupplementItem[];
  nutrition_grade: string;
  monthly_cost: string;
  summary: string;
}

type TabKey = "active" | "ask_vet" | "followups";

function classifySupplements(supplements: SupplementItem[]) {
  return {
    active: supplements.filter((s) => s.priority === "essential"),
    ask_vet: supplements.filter((s) => s.priority === "recommended"),
    followups: supplements.filter((s) => s.priority === "optional"),
  };
}

function ReminderToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 text-sm"
      style={{ color: on ? "#1f9d6b" : "#8a7f74" }}
    >
      {on ? (
        <ToggleRight className="h-5 w-5" aria-hidden />
      ) : (
        <ToggleLeft className="h-5 w-5" aria-hidden />
      )}
      <span>Check in after 7 days</span>
    </button>
  );
}

function SupplementCard({ item, tab }: { item: SupplementItem; tab: TabKey }) {
  const [reminder, setReminder] = useState(tab === "active");
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);

  const badgeLabel =
    tab === "active" ? "Active" : tab === "ask_vet" ? "Ask vet" : "Follow-up";
  const badgeBg =
    tab === "active" ? "#e7f4ee" : tab === "ask_vet" ? "#fbf0db" : "#e9f1fa";
  const badgeFg =
    tab === "active" ? "#15795a" : tab === "ask_vet" ? "#c1852a" : "#4f7fb8";

  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-white overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "#f3f9f6" }}
            >
              <Pill className="h-[18px] w-[18px] text-[#1f9d6b]" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-[#1c2522]">{item.name}</p>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: badgeBg, color: badgeFg }}
          >
            {badgeLabel}
          </span>
        </div>

        {/* Purpose */}
        <p className="text-sm leading-relaxed text-[#6f8579]">{item.purpose}</p>

        {/* Evidence chip (from dosage as proxy) */}
        {item.dosage && (
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: "#fbf0db", color: "#c1852a", border: "1px solid #f5d8a0" }}
            >
              {item.dosage} · {item.frequency}
            </span>
          </div>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8a978f]">
          <span>Brand: {item.brand || "Any quality brand"}</span>
          <span className="font-medium text-[#4a5a55]">{item.price}</span>
        </div>

        {/* Reminder toggle */}
        <div
          className="flex items-center justify-between pt-1"
          style={{ borderTop: "1px solid #f0f4f2" }}
        >
          <ReminderToggle on={reminder} onToggle={() => setReminder((r) => !r)} />
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-[#8a978f] hover:text-[#4a5a55] transition-colors"
          >
            Your notes
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>
      </div>

      {/* Expandable notes textarea */}
      {expanded && (
        <div
          className="px-4 pb-4"
          style={{ borderTop: "1px solid #f0f4f2" }}
        >
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 250))}
            rows={3}
            placeholder="Side effects, changes noticed, questions for your vet…"
            className="mt-3 w-full resize-none rounded-xl border border-[#e8e2d8] px-3 py-2.5 text-sm text-[#1c2522] placeholder:text-[#b9c6bf] focus:border-[#1f9d6b] focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-[#8a978f]">{notes.length}/250</p>
        </div>
      )}
    </div>
  );
}

function EmptyTabState({ tab, petName }: { tab: TabKey; petName: string }) {
  const messages: Record<TabKey, string> = {
    active: `No active supplements for ${petName} yet. Generate a plan above to get personalized recommendations.`,
    ask_vet: `No vet discussion items for ${petName} yet. Recommendations from the AI plan will appear here.`,
    followups: `No follow-up supplements for ${petName} yet. Optional items from the AI plan will appear here.`,
  };
  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-white px-6 py-8 text-center">
      <Pill className="mx-auto h-8 w-8 text-[#c0dfd0]" aria-hidden />
      <p className="mt-3 text-sm text-[#8a978f]">{messages[tab]}</p>
    </div>
  );
}

const SAFETY_RULES = [
  "Always ask your vet before starting anything new",
  "Never use human supplements for pets",
  "Look for vet-quality products from trusted brands",
  "Watch for any new or changing symptoms",
  "Stop and contact your vet if concerned",
];

const VET_QUESTIONS = [
  "Is this supplement appropriate for my dog?",
  "Are there any interactions with current health or history?",
  "What changes should we watch for?",
];

/** Right rail (mockup #5): vet-safety guidance + real Dog Brain evidence. */
function SupplementRail({ petId, petName }: { petId: string | null; petName: string }) {
  const [signals, setSignals] = useState<DetectedSignal[]>([]);
  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    fetch(`/api/dog-brain/signals?pet_id=${petId}`)
      .then((r) => r.json())
      .then((j: { signals?: DetectedSignal[] }) => {
        if (!cancelled) setSignals(Array.isArray(j?.signals) ? j.signals : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [petId]);

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-[#eef1ef] bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#1f9d6b]" aria-hidden />
          <p className="text-sm font-bold text-[#1c2522]">Before you start anything</p>
        </div>
        <p className="mb-3 text-xs text-[#8a978f]">Safety first. These rules help keep {petName} safe.</p>
        <ul className="space-y-2.5">
          {SAFETY_RULES.map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-[13px] text-[#3f4a45]">
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c3cfc9]" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[#eef1ef] bg-white p-5">
        <div className="mb-2 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-[#1f9d6b]" aria-hidden />
          <p className="text-sm font-bold text-[#1c2522]">Questions for your vet</p>
        </div>
        <p className="mb-3 text-xs text-[#8a978f]">Bring these to your next visit.</p>
        <ul className="space-y-2">
          {VET_QUESTIONS.map((q) => (
            <li key={q} className="text-[13px] leading-snug text-[#3f4a45]">• {q}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[#eef1ef] bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#1f9d6b]" aria-hidden />
          <p className="text-sm font-bold text-[#1c2522]">
            Brain evidence <span className="font-normal text-[#8a978f]">(connected to logs &amp; signals)</span>
          </p>
        </div>
        {signals.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {signals.slice(0, 4).map((s) => (
              <div key={s.dedupe_key} className="rounded-xl border border-[#eef1ef] bg-[#f9fbfa] p-3">
                <p className="text-[11px] font-semibold text-[#1c2522]">{s.signal_type.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#8a978f]">{s.owner_message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[#8a978f]">No active patterns — keep logging to build evidence.</p>
        )}
      </div>

      {/* Evidence-linked follow-up loop: pending Brain follow-ups the owner can
          resolve better/same/worse (incl. supplement-trial check-ins). Reuses the
          shared panel; renders nothing until there is a pending follow-up. */}
      <FollowupsPanel petId={petId} />

      <a
        href="/analytics"
        target="_top"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f9d6b] py-3 text-sm font-semibold text-white hover:bg-[#15795a] transition-colors"
      >
        <FileText className="h-4 w-4" aria-hidden />
        Create vet-safe summary
      </a>
      <div className="rounded-xl border border-[#d6e4f2] bg-[#f0f5fb] p-3">
        <p className="text-[11px] leading-relaxed text-[#5a6f86]">
          PawVital uses {petName}&apos;s history only to organize information. We don&apos;t provide
          dosing or treatment advice. Always follow your veterinarian&apos;s guidance.
        </p>
      </div>
    </aside>
  );
}

export default function SupplementsPage() {
  const quarantinedSurface = getPrivateTesterQuarantinedSurface("/supplements");
  const { activePet } = useAppStore();
  const [plan, setPlan] = useState<SupplementPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("active");

  const fetchPlan = useCallback(async () => {
    if (!activePet) return;
    setLoading(true);
    setError(null);
    try {
      const petPayload = {
        name: activePet.name,
        breed: activePet.breed,
        species: activePet.species,
        age_years: activePet.age_years,
        age_months: activePet.age_months,
        weight: activePet.weight,
        weight_unit: activePet.weight_unit,
        gender: activePet.gender,
        is_neutered: activePet.is_neutered,
        existing_conditions: activePet.existing_conditions ?? [],
        medications: activePet.medications ?? [],
      };
      const res = await fetch("/api/ai/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pet: petPayload }),
      });
      if (!res.ok) throw new Error("Failed to load plan");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const normalized: SupplementPlan = {
        ...data,
        supplements: (data.supplements || []).map((s: SupplementItem) => ({
          name: s.name || "Supplement",
          purpose: s.purpose || "",
          dosage: s.dosage || "",
          frequency: s.frequency || "",
          brand: s.brand || "",
          price: s.price || "",
          priority: (s.priority || "optional") as "essential" | "recommended" | "optional",
        })),
      };
      setPlan(normalized);
    } catch {
      setError("Unable to load personalized plan right now.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [activePet]);

  useEffect(() => {
    if (activePet) void fetchPlan();
    else setPlan(null);
  }, [activePet, fetchPlan]);

  if (quarantinedSurface) {
    return <PrivateTesterQuarantinedSurface {...quarantinedSurface} />;
  }

  if (!activePet) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-[#1c2522]">Vet-safe supplement support</h1>
          <p className="mt-1 text-sm text-[#8a978f]">Track, follow up, and discuss with your vet.</p>
        </div>
        <div className="rounded-2xl border border-[#eef1ef] bg-white px-6 py-10 text-center">
          <Pill className="mx-auto h-10 w-10 text-[#c0dfd0]" aria-hidden />
          <p className="mt-3 text-sm text-[#8a978f]">
            Add a dog profile to generate a personalized supplement plan.
          </p>
          <Link
            href="/pets"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#1f9d6b] hover:underline"
          >
            Go to pet profiles →
          </Link>
        </div>
      </div>
    );
  }

  const supplements = plan?.supplements ?? [];
  const classified = classifySupplements(supplements);
  const tabItems = classified[activeTab];

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "active", label: "Active", count: classified.active.length },
    { key: "ask_vet", label: "Ask vet about", count: classified.ask_vet.length },
    { key: "followups", label: "Follow-ups", count: classified.followups.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#1c2522]">Vet-safe supplement support</h1>
          <p className="mt-1 text-[15px] text-[#8a978f]">
            Track, follow up, and discuss with your vet.
          </p>
        </div>
        <button
          onClick={() => void fetchPlan()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[#cfe6da] bg-white px-4 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6] disabled:opacity-50 transition-colors"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {loading ? "Generating…" : "Generate plan"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Plan summary */}
      {plan?.summary && (
        <div className="rounded-xl border border-[#cfe6da] bg-[#f3f9f6] px-4 py-3">
          <p className="text-sm leading-relaxed text-[#15795a]">{plan.summary}</p>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: "#f3f4f6" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className="relative flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.key ? "#fff" : "transparent",
              color: activeTab === tab.key ? "#1c2522" : "#8a978f",
              boxShadow: activeTab === tab.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: activeTab === tab.key ? "#1f9d6b" : "#d1d5db",
                  color: "#fff",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-[#eef1ef] bg-white px-6 py-8 text-center text-sm text-[#8a978f]">
            Generating personalized plan for {activePet.name}…
          </div>
        ) : tabItems.length > 0 ? (
          tabItems.map((item, i) => (
            <SupplementCard key={i} item={item} tab={activeTab} />
          ))
        ) : (
          <EmptyTabState tab={activeTab} petName={activePet.name} />
        )}
      </div>

      {/* Vet-first disclaimer */}
      <div className="rounded-2xl border border-[#eef1ef] bg-[#f9fafb] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8a978f] mb-1">
          Vet-first, always.
        </p>
        <p className="text-xs leading-relaxed text-[#8a978f]">
          Supplement suggestions are generated by AI based on {activePet.name}&apos;s profile.
          Always discuss with your veterinarian before starting any new supplement — especially
          if your dog has existing conditions or takes medications.
        </p>
      </div>
        </div>

        <SupplementRail petId={activePet.id ?? null} petName={activePet.name} />
      </div>
    </div>
  );
}
