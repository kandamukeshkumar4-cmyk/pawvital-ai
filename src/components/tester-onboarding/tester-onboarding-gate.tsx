"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Card from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  hasTesterConsent,
  recordTesterConsent,
  requiresTesterConsent,
} from "@/lib/tester-consent";
import { useAppStore } from "@/store/app-store";
import TesterBoundaryCard from "./tester-boundary-card";

interface TesterOnboardingGateProps {
  children: React.ReactNode;
}

export default function TesterOnboardingGate({
  children,
}: TesterOnboardingGateProps) {
  const pathname = usePathname();
  const { activePet, user, userDataLoaded } = useAppStore();
  const [ready, setReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const shouldGateRoute = requiresTesterConsent(pathname);

  useEffect(() => {
    if (!shouldGateRoute) {
      setReady(true);
      return;
    }

    if (isSupabaseConfigured && !userDataLoaded) {
      setReady(false);
      return;
    }

    setAcknowledged(hasTesterConsent(user?.id));
    setReady(true);
  }, [shouldGateRoute, user?.id, userDataLoaded]);

  const handleAcknowledge = () => {
    recordTesterConsent(user?.id);
    setAcknowledged(true);
    setReady(true);
  };

  if (!shouldGateRoute) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <Card className="mx-auto max-w-3xl p-6 text-sm text-gray-500">
        Loading tester onboarding…
      </Card>
    );
  }

  if (!acknowledged) {
    return (
      <div className="mx-auto max-w-5xl">
        <TesterBoundaryCard
          petName={activePet?.name ?? "your dog"}
          onAcknowledge={handleAcknowledge}
        />
      </div>
    );
  }

  return <>{children}</>;
}
