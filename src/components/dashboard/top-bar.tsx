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

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="relative min-w-0 flex-1 max-w-full sm:max-w-xs lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <NotificationBell />

          <div className="flex min-w-0 items-center gap-2 border-l border-gray-200 pl-2 sm:gap-3 sm:pl-3">
            <span
              className={`inline-flex shrink-0 rounded-lg border px-2 py-1 text-xs font-semibold sm:px-2.5 ${
                badge === "Demo"
                  ? "bg-violet-50 text-violet-700 border-violet-200"
                  : badge === "Clinic"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : badge === "Pro"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              {badge}
            </span>
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-blue-600">
                {user?.full_name?.charAt(0) || "U"}
              </span>
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium text-gray-900">
                {user?.full_name || "Pet Parent"}
              </p>
              <p className="text-xs text-gray-500">
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
