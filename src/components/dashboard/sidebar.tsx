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
  ClipboardList,
  PawPrint,
} from "lucide-react";
import { filterPrivateTesterNavItems } from "@/lib/private-tester-scope";
import { useAppStore } from "@/store/app-store";
import { useAuth } from "@/hooks/useSupabase";

const navItems = [
  { href: "/dashboard", icon: Activity, label: "Dashboard" },
  { href: "/pets", icon: PawPrint, label: "My Dogs" },
  { href: "/symptom-checker", icon: Stethoscope, label: "Symptom Checker" },
  { href: "/health-log", icon: ClipboardList, label: "Daily Log" },
  { href: "/history", icon: Clock, label: "History" },
  { href: "/analytics", icon: BarChart3, label: "Health Signals" },
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
  const visibleNavItems = filterPrivateTesterNavItems(navItems);

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

  return (
    <>
      {showMobileSidebar ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 backdrop-blur-[1px] lg:hidden"
          style={{ background: "rgba(0,0,0,0.3)" }}
          onClick={toggleSidebar}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen max-w-[calc(100vw-1rem)] flex-col transition-all duration-300 lg:max-w-none ${
          sidebarOpen
            ? "w-[min(18rem,calc(100vw-1rem))] translate-x-0 lg:w-64"
            : "-translate-x-full lg:w-20 lg:translate-x-0"
        }`}
        style={{
          background: "#ffffff",
          borderRight: "1px solid #e8e2d8",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid #e8e2d8" }}
        >
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(0,168,120,0.12)" }}
          >
            <Heart className="h-6 w-6" style={{ color: "#00a878" }} />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <span className="text-lg font-bold text-gray-900">PawVital</span>
              <span
                className="ml-1 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: "rgba(0,168,120,0.1)", color: "#00a878" }}
              >
                AI
              </span>
            </div>
          )}
        </div>

        {/* Active Pet card */}
        {activePet && sidebarOpen && (
          <div
            className="mx-3 mt-4 rounded-2xl overflow-hidden"
            style={{ border: "1px solid #e8e2d8" }}
          >
            {/* Dog avatar header */}
            <div
              className="flex flex-col items-center py-5 px-4"
              style={{ background: "linear-gradient(to bottom, #e7f4ee, #f7f4ef)" }}
            >
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl mb-2 shadow-sm"
                style={{ background: "#fff", border: "2px solid #c0dfd0" }}
              >
                🐕
              </div>
              <p className="text-[15px] font-bold text-[#1c1814]">{activePet.name}</p>
              <p className="text-xs mt-0.5" style={{ color: "#8a7f74" }}>
                {activePet.breed}
              </p>
            </div>
            {/* Stats row */}
            <div
              className="flex items-center divide-x divide-[#e8e2d8] px-0"
              style={{ background: "#f7f4ef", borderTop: "1px solid #e8e2d8" }}
            >
              <div className="flex-1 py-2 text-center">
                <p className="text-xs font-semibold text-[#1c1814]">
                  {activePet.age_months > 0
                    ? `${activePet.age_years}y ${activePet.age_months}m`
                    : `${activePet.age_years}y`}
                </p>
                <p className="text-[10px]" style={{ color: "#8a7f74" }}>Age</p>
              </div>
              <a
                href="/pets"
                target="_top"
                className="flex-1 py-2 text-center text-xs font-medium transition-colors"
                style={{ color: "#1f9d6b" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#15795a")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#1f9d6b")}
              >
                View profile
              </a>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200"
                style={{
                  background: isActive ? "rgba(0,168,120,0.08)" : "transparent",
                  color: isActive ? "#00a878" : "#6b6057",
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "#f7f4ef";
                    (e.currentTarget as HTMLElement).style.color = "#1c1814";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#6b6057";
                  }
                }}
              >
                <item.icon
                  className="h-5 w-5 flex-shrink-0"
                  style={{ color: isActive ? "#00a878" : "inherit" }}
                />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div
          className="px-3 py-3"
          style={{ borderTop: "1px solid #e8e2d8" }}
        >
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
            style={{ color: "#b8b0a6" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#f7f4ef";
              (e.currentTarget as HTMLElement).style.color = "#6b6057";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#b8b0a6";
            }}
          >
            {sidebarOpen ? (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm">Collapse</span>
              </>
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </button>

          {sidebarOpen && (
            <button
              onClick={signOut}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
              style={{ color: "#dc2626" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
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
