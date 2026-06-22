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
  Settings,
  Heart,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  BarChart3,
  ClipboardList,
  PawPrint,
  AlertTriangle,
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
  // Paw Circle (community) is quarantined from default nav until a separate
  // moderated-community ticket exists. The route still exists but is unlinked.
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
          borderRight: "1px solid #ececea",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-[22px] pt-[21px] pb-4">
          <div
            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center"
            style={{ background: "#e9f6ef", borderRadius: 10 }}
          >
            <Heart className="h-5 w-5" style={{ color: "#0e8a59" }} />
          </div>
          {sidebarOpen && (
            <div className="min-w-0 leading-none">
              <span
                className="text-[19px] font-bold"
                style={{ color: "#1d1d1b", letterSpacing: "-0.4px" }}
              >
                PawVital
              </span>
              <span className="text-[19px] font-bold" style={{ color: "#0e8a59" }}>
                {" "}AI
              </span>
            </div>
          )}
        </div>

        {/* Active Pet card */}
        {activePet && sidebarOpen && (
          <Link
            href="/pets"
            className="group mx-[14px] mb-[14px] mt-0.5 block rounded-[13px] p-[13px] transition-colors"
            style={{ background: "#fafaf7", border: "1px solid #eeede8" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f4f3ee")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#fafaf7")}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold"
                style={{ background: "#dcefe2", color: "#0b7a4d" }}
                aria-hidden
              >
                {activePet.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-bold" style={{ color: "#1d1d1b" }}>
                  {activePet.name.replace(/\b\p{L}/gu, (c) => c.toUpperCase())}
                </p>
                <p className="truncate text-[12.5px]" style={{ color: "#7a7b73" }}>
                  {[
                    activePet.breed,
                    activePet.age_years > 0
                      ? activePet.age_months > 0
                        ? `${activePet.age_years}y ${activePet.age_months}m`
                        : `${activePet.age_years}y`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <span
              className="mt-2.5 flex items-center gap-1 text-[12.5px] font-semibold"
              style={{ color: "#0b7a4d" }}
            >
              View profile
              <ChevronRightSmall className="h-3.5 w-3.5" aria-hidden />
            </span>
          </Link>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-[11px] rounded-[9px] px-3 py-[9px] transition-colors duration-150"
                style={{
                  background: isActive ? "#e9f6ef" : "transparent",
                  color: isActive ? "#0b7a4d" : "#46473f",
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "#f4f3ee";
                    (e.currentTarget as HTMLElement).style.color = "#1d1d1b";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#46473f";
                  }
                }}
              >
                <item.icon
                  className="h-[19px] w-[19px] flex-shrink-0"
                  style={{ color: "inherit" }}
                  strokeWidth={1.8}
                />
                {sidebarOpen && (
                  <span className="text-[14.5px]" style={{ letterSpacing: "-0.1px" }}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Emergency card */}
        {sidebarOpen && (
          <div
            className="mx-[14px] mb-3 mt-2 rounded-[13px] p-[14px]"
            style={{ background: "#fdeeec", border: "1px solid #f7dad6" }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: "#cf4338" }} strokeWidth={2} />
              <span className="text-[14px] font-bold" style={{ color: "#cf4338" }}>
                Emergency?
              </span>
            </div>
            <p className="mt-1.5 text-[12.8px] leading-snug" style={{ color: "#8a6a66" }}>
              Difficulty breathing, collapse, seizures, or severe bleeding need a vet now.
            </p>
            <Link
              href="/symptom-checker"
              className="mt-2.5 flex items-center justify-center rounded-[9px] py-2 text-[13px] font-semibold transition-colors"
              style={{ background: "#fff", border: "1px solid #ecc4bf", color: "#cf4338" }}
            >
              View emergency signs
            </Link>
          </div>
        )}

        {/* Collapse toggle */}
        <div
          className="px-3 py-3"
          style={{ borderTop: "1px solid #efeee9" }}
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

          {sidebarOpen && (
            <p className="px-3 pt-3 text-[12px]" style={{ color: "#b6b7af" }}>
              PawVital AI v1.0.0
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
