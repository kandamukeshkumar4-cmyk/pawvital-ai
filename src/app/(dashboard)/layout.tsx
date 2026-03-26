"use client";

import Sidebar from "@/components/dashboard/sidebar";
import TopBar from "@/components/dashboard/top-bar";
import { useAppStore } from "@/store/app-store";
import { useLoadUserData } from "@/hooks/useSupabase";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen } = useAppStore();

  // Load real user + pets from Supabase on mount (no-op in demo mode)
  useLoadUserData();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div
        className={`transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}
      >
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
