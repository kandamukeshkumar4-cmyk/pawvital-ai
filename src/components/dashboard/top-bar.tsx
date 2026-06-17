"use client";

import { Search, Menu } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useSubscription } from "@/contexts/subscription-context";
import { useAppStore } from "@/store/app-store";

export default function TopBar() {
  const { user, toggleSidebar } = useAppStore();
  const { plan, loading } = useSubscription();

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
      ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }
      : badge === "Clinic"
        ? { background: "rgba(0,200,150,0.12)", color: "#00c896", border: "1px solid rgba(0,200,150,0.25)" }
        : badge === "Pro"
          ? { background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }
          : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{
        background: "rgba(10,10,10,0.92)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 transition-colors lg:hidden"
            style={{ color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="relative min-w-0 flex-1 max-w-full sm:max-w-xs lg:max-w-sm">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "rgba(255,255,255,0.3)" }}
            />
            <input
              type="text"
              placeholder="Search..."
              className="w-full rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.9)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(0,200,150,0.4)";
                e.currentTarget.style.background = "rgba(255,255,255,0.07)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
            />
          </div>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <NotificationBell />

          <div
            className="flex min-w-0 items-center gap-2 pl-2 sm:gap-3 sm:pl-3"
            style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}
          >
            <span
              className="inline-flex shrink-0 rounded-lg px-2 py-1 text-xs font-semibold sm:px-2.5"
              style={badgeStyle}
            >
              {badge}
            </span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,200,150,0.15)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "#00c896" }}>
                {user?.full_name?.charAt(0) || "U"}
              </span>
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium text-white">
                {user?.full_name || "Pet Parent"}
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                {user?.subscription_status === "active"
                  ? "Pro Member"
                  : "Free Trial"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
