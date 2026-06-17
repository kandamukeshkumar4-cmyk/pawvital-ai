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
import { filterPrivateTesterNavItems } from "@/lib/private-tester-scope";
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
  const collapseLabel = isDesktop ? "Collapse" : "Close menu";

  return (
    <>
      {showMobileSidebar ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 backdrop-blur-[1px] lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
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
          background: "#0a0a0a",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(0,200,150,0.15)" }}
          >
            <Heart className="h-6 w-6" style={{ color: "#00c896" }} />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <span className="text-lg font-bold text-white">PawVital</span>
              <span
                className="ml-1 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: "rgba(0,200,150,0.12)", color: "#00c896" }}
              >
                AI
              </span>
            </div>
          )}
        </div>

        {/* Active Pet */}
        {activePet && sidebarOpen && (
          <div
            className="mx-4 mt-4 rounded-xl p-3"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                🐕
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {activePet.name}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
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
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200"
                style={{
                  background: isActive ? "rgba(0,200,150,0.08)" : "transparent",
                  color: isActive ? "#00c896" : "rgba(255,255,255,0.55)",
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
                  }
                }}
              >
                <item.icon
                  className="h-5 w-5 flex-shrink-0"
                  style={{ color: isActive ? "#00c896" : "inherit" }}
                />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div
          className="px-3 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)";
            }}
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
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
              style={{ color: "#f43f5e" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.1)";
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
