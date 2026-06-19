"use client";

import { useEffect, useState } from "react";
import { Menu, ChevronDown, CheckCircle2, Stethoscope } from "lucide-react";
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
  const { user, activePet, toggleSidebar } = useAppStore();
  const { plan, loading } = useSubscription();
  const lastLog = useLastLogStatus(activePet?.id ?? null);

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
      ? { background: "rgba(124,77,196,0.1)", color: "#7c4dc4", border: "1px solid rgba(124,77,196,0.25)" }
      : badge === "Clinic"
        ? { background: "rgba(0,168,120,0.1)", color: "#00a878", border: "1px solid rgba(0,168,120,0.25)" }
        : badge === "Pro"
          ? { background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.25)" }
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

          {/* Dog selector pill */}
          {activePet && (
            <a
              href="/pets"
              target="_top"
              className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors"
              style={{ background: "#f7f4ef", border: "1px solid #e8e2d8", color: "#1c1814" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f0ede8")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#f7f4ef")}
            >
              <span className="text-base leading-none">🐕</span>
              <span className="text-sm font-semibold text-[#1c1814]">{activePet.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#8a7f74]" aria-hidden />
            </a>
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
