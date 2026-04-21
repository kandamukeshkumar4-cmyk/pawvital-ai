"use client";

import { useState } from "react";
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

  const consentSubjectId = getConsentSubjectId(user?.id);
  const ready = !isSupabaseConfigured || userDataLoaded;
  const acknowledged =
    ready &&
    (hasTesterConsent(user?.id) || acknowledgedSubjectId === consentSubjectId);

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
          petName={activePet?.name ?? "your dog"}
          onAcknowledge={handleAcknowledge}
        />
      </div>
    );
  }

  return <>{children}</>;
}
