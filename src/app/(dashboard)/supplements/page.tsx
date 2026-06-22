"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Pill,
  Sparkles,
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
      className="flex items-center gap-2.5 text-[13.5px] font-medium"
      style={{ color: on ? "#0b7a4d" : "#85867e" }}
      aria-pressed={on}
    >
      <span
        className="relative inline-flex shrink-0 items-center"
        style={{
          width: 46,
          height: 26,
          borderRadius: 13,
          background: on ? "#15a06a" : "#cfd0c8",
          transition: "background 150ms ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: on ? 23 : 3,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            transition: "left 150ms ease",
          }}
        />
      </span>
      <span>Check in after 7 days</span>
    </button>
  );
}

function SupplementCard({ item, tab }: { item: SupplementItem; tab: TabKey }) {
  const [reminder, setReminder] = useState(tab === "active");
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);

  const badgeLabel = tab === "active" ? "Active" : tab === "ask_vet" ? "Ask vet" : "Follow-up";
  const badgeBg =
    tab === "active" ? "#e9f6ef" : tab === "ask_vet" ? "#fdf3e3" : "#eef4fb";
  const badgeFg =
    tab === "active" ? "#0b7a4d" : tab === "ask_vet" ? "#b5740a" : "#3a5a82";

  return (
    <div
      className="overflow-hidden bg-white"
      style={{
        border: "1px solid #ebeae5",
        borderRadius: 14,
        borderLeft: tab === "active" ? "4px solid #15a06a" : "1px solid #ebeae5",
      }}
    >
      <div className="space-y-4 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex shrink-0 items-center justify-center"
              style={{ width: 46, height: 46, borderRadius: 12, background: "#f4f3ee" }}
            >
              <Pill className="h-5 w-5 text-[#0b7a4d]" aria-hidden />
            </span>
            <p className="text-[18px] font-bold leading-tight text-[#1d1d1b]">{item.name}</p>
          </div>
          <span
            className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{ background: badgeBg, color: badgeFg }}
          >
            {badgeLabel}
          </span>
        </div>

        {/* Detail grid — only fields the data actually has */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {item.purpose && (
            <div className="space-y-1">
              <p className="text-[13px] text-[#9a9b93]">Purpose</p>
              <p className="text-[14.5px] leading-snug text-[#3a3b34]">{item.purpose}</p>
            </div>
          )}
          {(item.dosage || item.frequency) && (
            <div className="space-y-1">
              <p className="text-[13px] text-[#9a9b93]">Evidence</p>
              <p className="text-[14.5px] leading-snug text-[#3a3b34]">
                {[item.dosage, item.frequency].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
          {item.brand && (
            <div className="space-y-1">
              <p className="text-[13px] text-[#9a9b93]">Brand</p>
              <p className="text-[14.5px] leading-snug text-[#3a3b34]">{item.brand}</p>
            </div>
          )}
          {item.price && (
            <div className="space-y-1">
              <p className="text-[13px] text-[#9a9b93]">Est. cost</p>
              <p className="text-[14.5px] leading-snug text-[#3a3b34]">{item.price}</p>
            </div>
          )}
        </div>

        {/* Reminder toggle */}
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: "1px solid #efeee9" }}
        >
          <ReminderToggle on={reminder} onToggle={() => setReminder((r) => !r)} />
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-[13px] font-medium text-[#85867e] transition-colors hover:text-[#3a3b34]"
          >
            Your notes
            <ChevronDown
              className="h-4 w-4 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>
      </div>

      {/* Expandable notes textarea */}
      {expanded && (
        <div className="px-5 pb-5" style={{ borderTop: "1px solid #efeee9" }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 250))}
            rows={3}
            placeholder="Side effects, changes noticed, questions for your vet…"
            className="mt-4 w-full resize-none rounded-xl border border-[#e6e5e0] px-3 py-2.5 text-sm text-[#1d1d1b] placeholder:text-[#b9c6bf] focus:border-[#15a06a] focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-[#9a9b93]">{notes.length}/250</p>
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
    <div
      className="bg-white px-6 py-10 text-center"
      style={{ border: "1px solid #ebeae5", borderRadius: 14 }}
    >
      <Pill className="mx-auto h-8 w-8 text-[#c8c9c0]" aria-hidden />
      <p className="mt-3 text-sm text-[#6f7069]">{messages[tab]}</p>
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
      <div
        className="bg-white p-5"
        style={{ border: "1px solid #ebeae5", borderRadius: 16 }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 10, background: "#e9f6ef" }}
          >
            <ShieldCheck className="h-[18px] w-[18px] text-[#0b7a4d]" aria-hidden />
          </span>
          <p className="text-[15px] font-bold text-[#1d1d1b]">Before you start anything</p>
        </div>
        <p className="mb-3 text-xs text-[#6f7069]">Safety first. These rules help keep {petName} safe.</p>
        <ul className="space-y-2.5">
          {SAFETY_RULES.map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-[13px] text-[#3a3b34]">
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c8c9c0]" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="bg-white p-5"
        style={{ border: "1px solid #ebeae5", borderRadius: 16 }}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 10, background: "#eef4fb" }}
          >
            <HelpCircle className="h-[18px] w-[18px] text-[#3a5a82]" aria-hidden />
          </span>
          <p className="text-[15px] font-bold text-[#1d1d1b]">Questions for your vet</p>
        </div>
        <p className="mb-3 text-xs text-[#6f7069]">Bring these to your next visit.</p>
        <ul className="space-y-2">
          {VET_QUESTIONS.map((q) => (
            <li key={q} className="text-[13px] leading-snug text-[#3a3b34]">• {q}</li>
          ))}
        </ul>
      </div>

      <div
        className="bg-white p-5"
        style={{ border: "1px solid #ebeae5", borderRadius: 16 }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 10, background: "#e9f6ef" }}
          >
            <Activity className="h-[18px] w-[18px] text-[#0b7a4d]" aria-hidden />
          </span>
          <p className="text-[15px] font-bold text-[#1d1d1b]">
            Brain evidence <span className="text-[13px] font-normal text-[#6f7069]">(connected to logs &amp; signals)</span>
          </p>
        </div>
        {signals.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {signals.slice(0, 4).map((s) => (
              <div
                key={s.dedupe_key}
                className="bg-[#f5f5f7] p-3"
                style={{ border: "1px solid #ebeae5", borderRadius: 12 }}
              >
                <p className="text-[11px] font-semibold capitalize text-[#1d1d1b]">{s.signal_type.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#6f7069]">{s.owner_message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[#6f7069]">No active patterns — keep logging to build evidence.</p>
        )}
      </div>

      {/* Evidence-linked follow-up loop: pending Brain follow-ups the owner can
          resolve better/same/worse (incl. supplement-trial check-ins). Reuses the
          shared panel; renders nothing until there is a pending follow-up. */}
      <FollowupsPanel petId={petId} />

      <div
        className="bg-white p-5"
        style={{ border: "1px solid #ebeae5", borderRadius: 16 }}
      >
        <p className="mb-1 text-[15px] font-bold text-[#1d1d1b]">Vet-safe summary</p>
        <p className="mb-4 text-xs text-[#6f7069]">
          Bring an organized recap of {petName}&apos;s plan and signals to your vet.
        </p>
        <a
          href="/analytics"
          target="_top"
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
        >
          <FileText className="h-4 w-4" aria-hidden />
          Create vet-safe summary
        </a>
        <div
          className="mt-4 p-3"
          style={{ border: "1px solid #d6e4f2", borderRadius: 12, background: "#eef4fb" }}
        >
          <p className="text-[11px] leading-relaxed text-[#3a5a82]">
            PawVital uses {petName}&apos;s history only to organize information. We don&apos;t provide
            dosing or treatment advice. Always follow your veterinarian&apos;s guidance.
          </p>
        </div>
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
          <h1 className="text-[29px] font-bold leading-tight text-[#1d1d1b]">Vet-safe supplement support</h1>
          <p className="mt-1 text-[15px] text-[#6f7069]">Track, follow up, and discuss with your vet.</p>
        </div>
        <div
          className="bg-white px-6 py-10 text-center"
          style={{ border: "1px solid #ebeae5", borderRadius: 16 }}
        >
          <Pill className="mx-auto h-10 w-10 text-[#c8c9c0]" aria-hidden />
          <p className="mt-3 text-sm text-[#6f7069]">
            Add a dog profile to generate a personalized supplement plan.
          </p>
          <Link
            href="/pets"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#0b7a4d] hover:underline"
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
          <h1 className="text-[29px] font-bold leading-tight text-[#1d1d1b]">Vet-safe supplement support</h1>
          <p className="mt-1 text-[15px] text-[#6f7069]">
            Track, follow up, and discuss with your vet.
          </p>
        </div>
        <button
          onClick={() => void fetchPlan()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(180deg,#17a06d,#0a7048)" }}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {loading ? "Generating…" : "Generate plan"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_352px]">
        <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Plan summary */}
      {plan?.summary && (
        <div
          className="px-4 py-3"
          style={{ border: "1px solid #cfe6da", borderRadius: 14, background: "#e9f6ef" }}
        >
          <p className="text-sm leading-relaxed text-[#0b7a4d]">{plan.summary}</p>
        </div>
      )}

      {/* Tabs — underline row with count badges */}
      <div className="flex gap-6" style={{ borderBottom: "1px solid #ebeae5" }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="relative -mb-px flex items-center gap-2 px-1 pb-3 text-sm transition-colors"
              style={{
                color: isActive ? "#0b7a4d" : "#85867e",
                fontWeight: isActive ? 600 : 500,
                borderBottom: isActive ? "2px solid #0b7a4d" : "2px solid transparent",
              }}
            >
              {tab.label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                style={{
                  background: isActive ? "#e9f6ef" : "#f0f0ec",
                  color: isActive ? "#0b7a4d" : "#85867e",
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="space-y-3">
        {loading ? (
          <div
            className="bg-white px-6 py-8 text-center text-sm text-[#6f7069]"
            style={{ border: "1px solid #ebeae5", borderRadius: 14 }}
          >
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
      <div
        className="px-5 py-4"
        style={{ border: "1px solid #ebeae5", borderRadius: 14, background: "#f5f5f7" }}
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#85867e]">
          Vet-first, always.
        </p>
        <p className="text-xs leading-relaxed text-[#6f7069]">
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
