"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, ChevronDown, CheckCircle2, Stethoscope, Check, PawPrint } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useSubscription } from "@/contexts/subscription-context";
import { useAppStore } from "@/store/app-store";

function useLastLogStatus(petId: string | null) {
  const [lastLogDate, setLastLogDate] = useState<string | null>(null);

  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    fetch(`/api/health-log?pet_id=${petId}&limit=1`)
      .then((r) => r.json())
      .then((data: { data?: Array<{ log_date?: string; created_at?: string }> }) => {
        if (cancelled) return;
        const first = data?.data?.[0];
        const date = first?.log_date ?? first?.created_at ?? null;
        setLastLogDate(date);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [petId]);

  if (!lastLogDate) return null;
  const d = new Date(lastLogDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    const timeStr = d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
    return `Today, ${timeStr}`;
  }
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export default function TopBar() {
  const { user, activePet, pets, setActivePet, toggleSidebar } = useAppStore();
  const { plan, loading } = useSubscription();
  const lastLog = useLastLogStatus(activePet?.id ?? null);

  const [petMenuOpen, setPetMenuOpen] = useState(false);
  const petMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!petMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (petMenuRef.current && !petMenuRef.current.contains(e.target as Node)) {
        setPetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [petMenuOpen]);
  const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  const badge = !isSupabaseConfigured
    ? "Demo"
    : loading
      ? "…"
      : plan === "clinic"
        ? "Clinic"
        : plan === "pro"
          ? "Pro"
          : "Free";

  const badgeStyle: React.CSSProperties =
    badge === "Demo"
      ? { background: "#fbf0db", color: "#c1852a", border: "1px solid #f0e0bc" }
      : badge === "Clinic"
        ? { background: "rgba(0,168,120,0.1)", color: "#00a878", border: "1px solid rgba(0,168,120,0.25)" }
        : badge === "Pro"
          ? { background: "#e7f4ee", color: "#15795a", border: "1px solid #c0dfd0" }
          : { background: "#f0ede8", color: "#8a7f74", border: "1px solid #e8e2d8" };

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.95)", borderBottom: "1px solid #e8e2d8" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Left: hamburger + dog selector + last-log status */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 transition-colors lg:hidden"
            style={{ color: "#6b6057" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f7f4ef")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Dog selector dropdown (real pet switcher) */}
          {activePet && (
            <div ref={petMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setPetMenuOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={petMenuOpen}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors"
                style={{ background: "#f7f4ef", border: "1px solid #e8e2d8", color: "#1c1814" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f0ede8")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#f7f4ef")}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "#1f9d6b" }}
                  aria-hidden
                >
                  {activePet.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-[#1c1814]">{titleCase(activePet.name)}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-[#8a7f74] transition-transform ${petMenuOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {petMenuOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-[#e8e2d8] bg-white shadow-lg"
                >
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
                    Switch dog
                  </p>
                  <ul className="max-h-72 overflow-y-auto py-1">
                    {pets.map((p) => {
                      const selected = p.id === activePet.id;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setActivePet(p);
                              setPetMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#f3f9f6]"
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ background: selected ? "#1f9d6b" : "#b9c6bf" }}
                              aria-hidden
                            >
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[#1c2522]">
                                {titleCase(p.name)}
                              </span>
                              <span className="block truncate text-[11px] text-[#8a978f]">{p.breed}</span>
                            </span>
                            {selected && <Check className="h-4 w-4 shrink-0 text-[#1f9d6b]" aria-hidden />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <Link
                    href="/pets"
                    onClick={() => setPetMenuOpen(false)}
                    className="flex items-center gap-2 border-t border-[#eef1ef] px-3 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6]"
                  >
                    <PawPrint className="h-4 w-4" aria-hidden />
                    Manage dogs
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Last log status pill */}
          {lastLog && (
            <span
              className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: "#e7f4ee", color: "#15795a", border: "1px solid #c0dfd0" }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Last log: {lastLog} · Up to date
            </span>
          )}
        </div>

        {/* Right: symptom check CTA + notifications + user */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href="/symptom-checker"
            target="_top"
            className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-[#1f9d6b] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#15795a] transition-colors"
          >
            <Stethoscope className="h-4 w-4" aria-hidden />
            <span className="hidden md:inline">Start symptom check</span>
            <span className="md:hidden">Symptom check</span>
          </a>

          <NotificationBell />

          <div
            className="flex min-w-0 items-center gap-2 pl-2 sm:gap-3 sm:pl-3"
            style={{ borderLeft: "1px solid #e8e2d8" }}
          >
            <span
              className="inline-flex shrink-0 rounded-lg px-2 py-1 text-xs font-semibold sm:px-2.5"
              style={badgeStyle}
            >
              {badge}
            </span>
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,168,120,0.12)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "#00a878" }}>
                {user?.full_name?.charAt(0) || "U"}
              </span>
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium text-gray-900">
                {user?.full_name || "Pet Parent"}
              </p>
              <p className="text-xs" style={{ color: "#8a7f74" }}>
                {user?.subscription_status === "active" ? "Pro Member" : "Free Trial"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
