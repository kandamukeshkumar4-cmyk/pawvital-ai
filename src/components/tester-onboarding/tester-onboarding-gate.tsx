"use client";

import { useEffect, useState } from "react";
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

export default function TesterOnboardingGate({
  children,
}: TesterOnboardingGateProps) {
  const { activePet, user, userDataLoaded } = useAppStore();
  const [acknowledgedSubjectId, setAcknowledgedSubjectId] = useState<
    string | null
  >(null);
  const [storedAcknowledged, setStoredAcknowledged] = useState(false);
  const [consentResolved, setConsentResolved] = useState(false);

  const consentSubjectId = getConsentSubjectId(user?.id);
  const ready = !isSupabaseConfigured || userDataLoaded;

  useEffect(() => {
    if (!ready) {
      setStoredAcknowledged(false);
      setConsentResolved(false);
      return;
    }

    setStoredAcknowledged(hasTesterConsent(user?.id));
    setConsentResolved(true);
  }, [ready, user?.id]);

  const acknowledged =
    ready &&
    consentResolved &&
    (storedAcknowledged || acknowledgedSubjectId === consentSubjectId);

  const handleAcknowledge = () => {
    recordTesterConsent(user?.id);
    setStoredAcknowledged(true);
    setConsentResolved(true);
    setAcknowledgedSubjectId(consentSubjectId);
  };

  if (!ready || !consentResolved) {
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
