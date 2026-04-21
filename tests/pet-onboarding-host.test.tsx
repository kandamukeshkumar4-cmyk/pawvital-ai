/** @jest-environment jsdom */

import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import PetOnboardingHost from "@/components/onboarding/pet-onboarding-host";
import { PET_ONBOARDING_DISMISSED_KEY } from "@/lib/demo-storage";
import { useAppStore } from "@/store/app-store";

jest.mock("@/hooks/useSupabase", () => ({
  __esModule: true,
  usePets: () => ({
    savePet: jest.fn(),
  }),
}));

describe("PetOnboardingHost", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAppStore.setState((state) => ({
      ...state,
      pets: [],
      userDataLoaded: true,
    }));
  });

  it("opens the pet profile modal when the session has not dismissed onboarding", async () => {
    render(React.createElement(PetOnboardingHost));

    expect(await screen.findByText("Add your dog")).toBeTruthy();
  });

  it("stays closed when onboarding was dismissed in session storage", async () => {
    sessionStorage.setItem(PET_ONBOARDING_DISMISSED_KEY, "1");

    render(React.createElement(PetOnboardingHost));

    await waitFor(() => {
      expect(screen.queryByText("Add your dog")).toBeNull();
    });
  });
});
