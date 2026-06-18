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
      ? { background: "rgba(124,77,196,0.1)", color: "#7c4dc4", border: "1px solid rgba(124,77,196,0.25)" }
      : badge === "Clinic"
        ? { background: "rgba(0,168,120,0.1)", color: "#00a878", border: "1px solid rgba(0,168,120,0.25)" }
        : badge === "Pro"
          ? { background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.25)" }
          : { background: "#f0ede8", color: "#8a7f74", border: "1px solid #e8e2d8" };

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{
        background: "rgba(255,255,255,0.95)",
        borderBottom: "1px solid #e8e2d8",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 transition-colors lg:hidden"
            style={{ color: "#6b6057" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#f7f4ef";
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
              style={{ color: "#b8b0a6" }}
            />
            <input
              type="text"
              placeholder="Search..."
              className="w-full rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none transition-colors"
              style={{
                background: "#f7f4ef",
                border: "1px solid #e8e2d8",
                color: "#1c1814",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(0,168,120,0.5)";
                e.currentTarget.style.background = "#ffffff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e8e2d8";
                e.currentTarget.style.background = "#f7f4ef";
              }}
            />
          </div>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
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
              className="w-8 h-8 rounded-full flex items-center justify-center"
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
