"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Stethoscope,
  Clock,
  Pill,
  Bell,
  BookOpen,
  Users,
  Settings,
  Heart,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  PawPrint,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useAuth } from "@/hooks/useSupabase";

const navItems = [
  { href: "/dashboard", icon: Activity, label: "Dashboard" },
  { href: "/pets", icon: PawPrint, label: "My Dogs" },
  { href: "/symptom-checker", icon: Stethoscope, label: "Symptom Checker" },
  { href: "/history", icon: Clock, label: "History" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/supplements", icon: Pill, label: "Supplements" },
  { href: "/reminders", icon: Bell, label: "Reminders" },
  { href: "/journal", icon: BookOpen, label: "Journal" },
  { href: "/community", icon: Users, label: "Paw Circle" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, activePet } = useAppStore();
  const { signOut } = useAuth();
  const [isDesktop, setIsDesktop] = useState(true);
  const previousIsDesktopRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      setIsDesktop(event ? event.matches : mediaQuery.matches);
    };

    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    const previousIsDesktop = previousIsDesktopRef.current;

    if (previousIsDesktop === null) {
      if (!isDesktop && sidebarOpen) {
        toggleSidebar();
      }
    } else if (previousIsDesktop && !isDesktop && sidebarOpen) {
      toggleSidebar();
    }

    previousIsDesktopRef.current = isDesktop;
  }, [isDesktop, sidebarOpen, toggleSidebar]);

  const showMobileSidebar = !isDesktop && sidebarOpen;
  const collapseLabel = isDesktop ? "Collapse" : "Close menu";

  return (
    <>
      {showMobileSidebar ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px] lg:hidden"
          onClick={toggleSidebar}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen max-w-[calc(100vw-1rem)] flex-col border-r border-gray-200 bg-white shadow-xl transition-all duration-300 lg:max-w-none lg:shadow-none ${
          sidebarOpen
            ? "w-[min(18rem,calc(100vw-1rem))] translate-x-0 lg:w-64"
            : "-translate-x-full lg:w-20 lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <Heart className="h-6 w-6 fill-white text-white" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <span className="text-lg font-bold text-gray-900">PawVital</span>
              <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                AI
              </span>
            </div>
          )}
        </div>

        {/* Active Pet */}
        {activePet && sidebarOpen && (
          <div className="mx-4 mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-lg">🐕</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {activePet.name}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {activePet.breed}
                  {" · "}
                  {activePet.age_months > 0
                    ? `${activePet.age_years}y ${activePet.age_months}m`
                    : `${activePet.age_years}y`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                  isActive
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 flex-shrink-0 ${
                    isActive
                      ? "text-blue-600"
                      : "text-gray-400 group-hover:text-gray-600"
                  }`}
                />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-gray-200 px-3 py-3">
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            {sidebarOpen ? (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm">{collapseLabel}</span>
              </>
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </button>

          {sidebarOpen && (
            <button
              onClick={signOut}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-red-500 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-sm">Sign Out</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
