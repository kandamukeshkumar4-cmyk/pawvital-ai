"use client";

import Sidebar from "@/components/dashboard/sidebar";
import TopBar from "@/components/dashboard/top-bar";
import PetOnboardingHost from "@/components/onboarding/pet-onboarding-host";
import { SubscriptionProvider } from "@/contexts/subscription-context";
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
    <SubscriptionProvider>
      <div className="app-dark min-h-screen overflow-x-hidden">
        <PetOnboardingHost />
        <Sidebar />
        <div
          className={`min-w-0 transition-[margin] duration-300 ${
            sidebarOpen ? "lg:ml-64" : "lg:ml-20"
          }`}
        >
          <TopBar />
          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </SubscriptionProvider>
  );
}
