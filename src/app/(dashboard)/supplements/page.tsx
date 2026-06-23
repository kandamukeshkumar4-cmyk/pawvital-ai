"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Pill,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  FileText,
  MoreVertical,
  Bell,
  ChevronRight,
  Droplet,
  Zap,
  Info,
} from "lucide-react";
import type { DetectedSignal, SignalType } from "@/lib/dog-brain/types";
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

/** Reminder toggle — track 46x26 radius 13 (on #15a06a / off #cfd0c8), knob 20px white. */
function ReminderToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative inline-flex shrink-0 items-center"
      aria-pressed={on}
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
    </button>
  );
}

function SupplementCard({ item, tab }: { item: SupplementItem; tab: TabKey }) {
  const [reminder, setReminder] = useState(tab === "active");
  const [notes, setNotes] = useState("");

  const isActive = tab === "active";
  const statusLabel = isActive ? "Active" : "Ask vet about";
  const statusBg = isActive ? "#e9f6ef" : "#fdf3e3";
  const statusFg = isActive ? "#0b7a4d" : "#b5740a";
  const evidence = [item.dosage, item.frequency].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ebeae5",
        borderLeft: isActive ? "4px solid #15a06a" : "1px solid #ebeae5",
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 13 }}>
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: "#f4f3ee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#7a7b73",
              flex: "none",
            }}
          >
            <Pill className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1b" }}>{item.name}</div>
            <span
              style={{
                display: "inline-block",
                background: statusBg,
                color: statusFg,
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 13,
                marginTop: 6,
              }}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isActive ? (
            <span
              style={{
                background: "#fdf3e3",
                color: "#b5740a",
                fontSize: 13,
                fontWeight: 600,
                padding: "6px 13px",
                borderRadius: 9,
              }}
            >
              Ask vet
            </span>
          ) : (
            <button
              type="button"
              style={{
                background: "#fff",
                border: "1px solid #e3e2dd",
                color: "#3a3b34",
                borderRadius: 9,
                padding: "7px 14px",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              View details
            </button>
          )}
          <MoreVertical className="h-5 w-5 text-[#9a9b93]" aria-hidden />
        </div>
      </div>

      {/* Detail grid (gap 30, margin-top 18) — real fields only */}
      <div style={{ display: "flex", gap: 30, marginTop: 18 }}>
        {item.purpose && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#9a9b93", marginBottom: 5 }}>Purpose</div>
            <div style={{ fontSize: 14.5, color: "#3a3b34" }}>{item.purpose}</div>
          </div>
        )}
        {evidence && (
          <div style={{ flex: 1.2 }}>
            <div style={{ fontSize: 13, color: "#9a9b93", marginBottom: 5 }}>Evidence</div>
            <div style={{ fontSize: 14.5, color: "#c87d3e", fontWeight: 600 }}>{evidence}</div>
            <div style={{ fontSize: 13, color: "#9a9b93", marginTop: 8 }}>View related</div>
            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "#0b7a4d",
                marginTop: 2,
              }}
            >
              <Link href="/health-log" style={{ cursor: "pointer" }}>
                Daily logs
              </Link>
              <span style={{ color: "#cbccc3" }}>·</span>
              <Link href="/analytics" style={{ cursor: "pointer" }}>
                Health signals
              </Link>
            </div>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "#9a9b93", marginBottom: 5 }}>Suggested by PawVital</div>
          {item.brand ? (
            <div style={{ fontSize: 14.5, color: "#3a3b34" }}>{item.brand}</div>
          ) : (
            <div style={{ fontSize: 14.5, color: "#9a9b93" }}>Personalized for your dog</div>
          )}
          {item.price && (
            <div style={{ fontSize: 13, color: "#9a9b93", marginTop: 8 }}>Est. {item.price}</div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#f0efea", margin: "18px 0" }} />

      {/* Reminder toggle row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Bell className="h-5 w-5 text-[#7a7b73]" strokeWidth={1.7} aria-hidden />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: "#1d1d1b" }}>Reminder</div>
            <div style={{ fontSize: 12.5, color: "#85867e" }}>Check in after 7 days</div>
          </div>
        </div>
        <ReminderToggle on={reminder} onToggle={() => setReminder((r) => !r)} />
      </div>

      {/* Notes */}
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "#1d1d1b", marginTop: 18 }}>
        Your notes / side effects
      </div>
      <div style={{ fontSize: 12.5, color: "#85867e", marginTop: 2, marginBottom: 9 }}>
        How is {item.name} doing after starting this?
      </div>
      <div style={{ position: "relative" }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 250))}
          placeholder="Any changes, side effects, or notes..."
          style={{
            width: "100%",
            height: 62,
            resize: "none",
            border: "1px solid #e6e5e0",
            borderRadius: 9,
            padding: 11,
            fontSize: 13.5,
            color: "#1d1d1b",
            outline: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 10,
            bottom: 9,
            fontSize: 11.5,
            color: "#b6b7af",
          }}
        >
          {notes.length}/250
        </span>
      </div>
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

/** Stat tiles in "Brain evidence" map a real DetectedSignal to a labeled tile. */
const EVIDENCE_TILES: {
  key: string;
  label: string;
  types: SignalType[];
  icon: typeof Droplet;
  iconColor: string;
  link: { href: string; label: string };
}[] = [
  {
    key: "stool",
    label: "Stool",
    types: ["stool_change"],
    icon: Pill,
    iconColor: "#8a6a3c",
    link: { href: "/health-log", label: "View logs" },
  },
  {
    key: "hydration",
    label: "Hydration",
    types: ["water_urination_change"],
    icon: Droplet,
    iconColor: "#4d7cb5",
    link: { href: "/analytics", label: "View signals" },
  },
  {
    key: "energy",
    label: "Energy",
    types: ["energy_behavior_change"],
    icon: Zap,
    iconColor: "#e0890a",
    link: { href: "/analytics", label: "View signals" },
  },
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

  const hasSignals = signals.length > 0;

  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1) Before you start anything */}
      <div style={{ background: "#fff", border: "1px solid #ebeae5", borderRadius: 16, padding: "18px 20px" }}>
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "#eaf3ee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0b7a4d",
              flex: "none",
            }}
          >
            <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1d1d1b" }}>Before you start anything</div>
            <div style={{ fontSize: 12.5, color: "#85867e", marginTop: 2 }}>
              Safety first. These rules help keep {petName} safe.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {SAFETY_RULES.map((rule) => (
            <div key={rule} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "1.8px solid #cbccc3",
                  flex: "none",
                }}
              />
              <span style={{ fontSize: 13.5, color: "#44453f" }}>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2) Questions for your vet */}
      <div style={{ background: "#fff", border: "1px solid #ebeae5", borderRadius: 16, padding: "18px 20px" }}>
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "#eef4fb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4d7cb5",
              flex: "none",
            }}
          >
            <HelpCircle className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1d1d1b" }}>Questions for your vet</div>
            <div style={{ fontSize: 12.5, color: "#85867e", marginTop: 2 }}>Bring these to your next visit.</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 13 }}>
          {VET_QUESTIONS.map((q) => (
            <div key={q} style={{ display: "flex", gap: 9, fontSize: 13.5, color: "#44453f" }}>
              <span style={{ color: "#b6b7af" }}>•</span>
              {q}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 13,
            borderTop: "1px solid #f0efea",
          }}
        >
          <span style={{ fontSize: 12.5, color: "#85867e" }}>Add your own questions in your notes.</span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: "#0b7a4d",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add note
            <ChevronRight className="h-[13px] w-[13px]" strokeWidth={2.2} aria-hidden />
          </span>
        </div>
      </div>

      {/* 3) Brain evidence */}
      <div style={{ background: "#fff", border: "1px solid #ebeae5", borderRadius: 16, padding: "18px 20px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1d1d1b" }}>
          Brain evidence{" "}
          <span style={{ fontSize: 13, color: "#9a9b93", fontWeight: 400 }}>(connected to logs &amp; signals)</span>
        </div>
        {hasSignals ? (
          <div style={{ display: "flex", gap: 11, marginTop: 14 }}>
            {EVIDENCE_TILES.map((tile) => {
              const match = signals.find((s) => tile.types.includes(s.signal_type));
              const Icon = tile.icon;
              return (
                <div
                  key={tile.key}
                  style={{ flex: 1, border: "1px solid #efeee9", borderRadius: 11, padding: 12 }}
                >
                  <Icon style={{ color: tile.iconColor }} className="h-5 w-5" aria-hidden />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1d1d1b", marginTop: 7 }}>
                    {tile.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#85867e" }}>{match ? match.owner_message : "No change"}</div>
                  <Link
                    href={tile.link.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      color: "#0b7a4d",
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginTop: 8,
                      cursor: "pointer",
                    }}
                  >
                    {tile.link.label}
                    <ChevronRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#6f7069", marginTop: 14 }}>
            No active patterns — keep logging to build evidence.
          </p>
        )}
      </div>

      {/* Evidence-linked follow-up loop: pending Brain follow-ups the owner can
          resolve better/same/worse (incl. supplement-trial check-ins). Reuses the
          shared panel; renders nothing until there is a pending follow-up. */}
      <FollowupsPanel petId={petId} />

      {/* 4) Vet-safe summary CTA */}
      <div>
        <a
          href="/analytics"
          target="_top"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            background: "linear-gradient(180deg,#17a06d,#0a7048)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: 13,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <FileText className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
          Create vet-safe summary
        </a>
        <div style={{ fontSize: 12.5, color: "#85867e", marginTop: 8, textAlign: "center" }}>
          Share a summary of supplements, logs, and signals with your vet.
        </div>
      </div>

      {/* Blue info disclaimer panel */}
      <div
        style={{
          display: "flex",
          gap: 9,
          background: "#eef4fb",
          borderRadius: 12,
          padding: "13px 14px",
        }}
      >
        <Info
          className="h-[17px] w-[17px] text-[#4d7cb5]"
          strokeWidth={1.7}
          style={{ flex: "none", marginTop: 1 }}
          aria-hidden
        />
        <div style={{ fontSize: 12.5, color: "#5a7290", lineHeight: 1.5 }}>
          PawVital AI uses {petName}&apos;s history only to organize information. We don&apos;t provide dosing or
          treatment advice. Always follow your veterinarian&apos;s guidance.
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
          <h1 style={{ fontSize: 29, fontWeight: 700, letterSpacing: "-0.6px", color: "#1d1d1b" }}>
            Vet-safe supplement support
          </h1>
          <p style={{ fontSize: 14.5, color: "#6f7069", marginTop: 5 }}>
            Track, follow up, and discuss with your vet.
          </p>
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
    <div style={{ padding: "0 0 40px", maxWidth: 1360 }}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 style={{ fontSize: 29, fontWeight: 700, letterSpacing: "-0.6px", color: "#1d1d1b" }}>
            Vet-safe supplement support
          </h1>
          <p style={{ fontSize: 14.5, color: "#6f7069", marginTop: 5 }}>
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

      {/* Tabs — underline row with count badge pills */}
      <div style={{ display: "flex", borderBottom: "1px solid #ebeae5", margin: "20px 0 22px" }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "0 2px 11px",
                marginRight: 26,
                marginBottom: -1,
                fontSize: 15,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "#0b7a4d" : "#85867e",
                borderBottom: isActive ? "2px solid #0b7a4d" : "2px solid transparent",
                background: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
              <span
                style={{
                  background: isActive ? "#e9f6ef" : "#f0f0ec",
                  color: isActive ? "#0b7a4d" : "#85867e",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 11,
                  padding: "1px 8px",
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body: main column + right rail */}
      <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Plan summary */}
          {plan?.summary && (
            <div
              style={{ border: "1px solid #cfe6da", borderRadius: 14, background: "#e9f6ef", padding: "12px 16px" }}
            >
              <p className="text-sm leading-relaxed text-[#0b7a4d]">{plan.summary}</p>
            </div>
          )}

          {/* Tab content */}
          {loading ? (
            <div
              className="bg-white px-6 py-8 text-center text-sm text-[#6f7069]"
              style={{ border: "1px solid #ebeae5", borderRadius: 14 }}
            >
              Generating personalized plan for {activePet.name}…
            </div>
          ) : tabItems.length > 0 ? (
            tabItems.map((item, i) => <SupplementCard key={i} item={item} tab={activeTab} />)
          ) : (
            <EmptyTabState tab={activeTab} petName={activePet.name} />
          )}

          {/* Vet-first disclaimer */}
          <div
            className="px-5 py-4"
            style={{ border: "1px solid #ebeae5", borderRadius: 14, background: "#f5f5f7" }}
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#85867e]">
              Vet-first, always.
            </p>
            <p className="text-xs leading-relaxed text-[#6f7069]">
              Supplement suggestions are generated by AI based on {activePet.name}&apos;s profile. Always discuss
              with your veterinarian before starting any new supplement — especially if your dog has existing
              conditions or takes medications.
            </p>
          </div>
        </div>

        <div style={{ width: 352, flex: "none" }}>
          <SupplementRail petId={activePet.id ?? null} petName={activePet.name} />
        </div>
      </div>
    </div>
  );
}
