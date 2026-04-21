"use client";

import { useState, useSyncExternalStore } from "react";
import { PET_ONBOARDING_DISMISSED_KEY } from "@/lib/demo-storage";
import { useAppStore } from "@/store/app-store";
import PetProfileModal from "@/components/onboarding/pet-profile-modal";

function subscribeToSessionDismissal() {
  return () => {};
}

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
  const [dismissedOverride, setDismissedOverride] = useState(false);
  const dismissedFromSession = useSyncExternalStore(
    subscribeToSessionDismissal,
    readDismissedFromSession,
    () => false
  );
  const dismissed = dismissedOverride || dismissedFromSession;

  const open = userDataLoaded && pets.length === 0 && !dismissed;

  return (
    <PetProfileModal
      open={open}
      onSkipped={() => {
        setDismissedOverride(true);

        if (typeof window === "undefined") {
          return;
        }

        try {
          sessionStorage.setItem(PET_ONBOARDING_DISMISSED_KEY, "1");
        } catch {
          // Ignore storage write failures and keep the modal visible next time.
        }
      }}
    />
  );
}
