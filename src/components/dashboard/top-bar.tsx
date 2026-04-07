"use client";

import { Bell, Search, Menu } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
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
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 w-64 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <span
              className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-lg border ${
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
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">
                {user?.full_name || "Pet Parent"}
              </p>
              <p className="text-xs text-gray-500">
                {user?.subscription_status === "active" ? "Pro Member" : "Free Trial"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
