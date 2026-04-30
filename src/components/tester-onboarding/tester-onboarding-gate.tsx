"use client";

import { useState, useSyncExternalStore } from "react";
import Card from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase";
import { hasTesterConsent, recordTesterConsent } from "@/lib/tester-consent";
import { useAppStore } from "@/store/app-store";
import TesterBoundaryCard from "./tester-boundary-card";

interface TesterOnboardingGateProps {
  children: React.ReactNode;
}

function getConsentSubjectId(userId?: string | null): string {
  if (typeof userId !== "string") {
    return "anonymous";
  }

  const trimmedUserId = userId.trim();
  return trimmedUserId ? `user:${trimmedUserId}` : "anonymous";
}

function subscribeToTesterConsent() {
  return () => {};
}

function subscribeToHydration() {
  return () => {};
}

export default function TesterOnboardingGate({
  children,
}: TesterOnboardingGateProps) {
  const { activePet, user, userDataLoaded } = useAppStore();
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
  const [acknowledgedSubjectId, setAcknowledgedSubjectId] = useState<
    string | null
  >(null);

  const consentSubjectId = getConsentSubjectId(user?.id);
  const ready = !isSupabaseConfigured || userDataLoaded;
  const storedAcknowledged = useSyncExternalStore(
    subscribeToTesterConsent,
    () => (ready && hasHydrated ? hasTesterConsent(user?.id) : false),
    () => false
  );

  const acknowledged =
    ready &&
    (storedAcknowledged || acknowledgedSubjectId === consentSubjectId);

  const handleAcknowledge = () => {
    recordTesterConsent(user?.id);
    setAcknowledgedSubjectId(consentSubjectId);
  };

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
          petName={hasHydrated ? activePet?.name ?? "your dog" : "your dog"}
          onAcknowledge={handleAcknowledge}
        />
      </div>
    );
  }

  return <>{children}</>;
}
