"use client";

import { useEffect, useState } from "react";
import { PET_ONBOARDING_DISMISSED_KEY } from "@/lib/demo-storage";
import { useAppStore } from "@/store/app-store";
import PetProfileModal from "@/components/onboarding/pet-profile-modal";

function readDismissedFromSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PET_ONBOARDING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function PetOnboardingHost() {
  const pets = useAppStore((s) => s.pets);
  const userDataLoaded = useAppStore((s) => s.userDataLoaded);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedResolved, setDismissedResolved] = useState(false);

  useEffect(() => {
    setDismissed(readDismissedFromSession());
    setDismissedResolved(true);
  }, []);

  const open = dismissedResolved && userDataLoaded && pets.length === 0 && !dismissed;

  return (
    <PetProfileModal
      open={open}
      onSkipped={() => setDismissed(true)}
    />
  );
}
