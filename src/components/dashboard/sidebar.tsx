"use client";

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
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useAuth } from "@/hooks/useSupabase";

const navItems = [
  { href: "/dashboard", icon: Activity, label: "Dashboard" },
  { href: "/symptom-checker", icon: Stethoscope, label: "Symptom Checker" },
  { href: "/history", icon: Clock, label: "History" },
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

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300 z-40 ${
        sidebarOpen ? "w-64" : "w-20"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Heart className="w-6 h-6 text-white fill-white" />
        </div>
        {sidebarOpen && (
          <div>
            <span className="text-lg font-bold text-gray-900">PawVital</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium ml-1">
              AI
            </span>
          </div>
        )}
      </div>

      {/* Active Pet */}
      {activePet && sidebarOpen && (
        <div className="mx-4 mt-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-lg">
              🐕
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{activePet.name}</p>
              <p className="text-xs text-gray-500">
                {activePet.breed} · {activePet.age_years}y
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <item.icon
                className={`w-5 h-5 flex-shrink-0 ${
                  isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
                }`}
              />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 py-3 border-t border-gray-200">
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>

        {sidebarOpen && (
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-red-500 hover:bg-red-50 transition-colors mt-1"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
