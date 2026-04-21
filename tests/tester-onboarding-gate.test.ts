/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TesterOnboardingGate from "@/components/tester-onboarding/tester-onboarding-gate";
import SymptomCheckerPage from "@/app/(dashboard)/symptom-checker/page";
import { recordTesterConsent } from "@/lib/tester-consent";
import { useAppStore } from "@/store/app-store";
import type { Pet } from "@/types";

const mockUsePathname = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const TEST_PET: Pet = {
  id: "pet-1",
  user_id: "user-1",
  name: "Buddy",
  breed: "Labrador Retriever",
  species: "dog",
  age_years: 4,
  age_months: 48,
  weight: 52,
  weight_unit: "lbs",
  gender: "male",
  is_neutered: true,
  existing_conditions: [],
  medications: [],
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: jest.fn(),
  });
});

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue("/symptom-checker");
  useAppStore.setState({
    user: null,
    pets: [TEST_PET],
    activePet: TEST_PET,
    userDataLoaded: true,
    sidebarOpen: true,
  });
});

describe("tester onboarding gate", () => {
  it("shows the first-use boundary screen and records acknowledgement", async () => {
    render(
      React.createElement(
        TesterOnboardingGate,
        {},
        React.createElement("div", {}, "Symptom checker child")
      )
    );

    expect(
      screen.getByText(
        "PawVital helps you understand urgency and prepare for a vet visit."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("PawVital gives urgency guidance, not diagnosis.")
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Acknowledge and continue" })
        .hasAttribute("disabled")
    ).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge and continue" })
    );

    await waitFor(() => {
      expect(screen.getByText("Symptom checker child")).toBeTruthy();
    });

    expect(localStorage.getItem("pawvital_tester_acknowledgements")).toContain(
      "anonymous"
    );
  });

  it("does not block a returning tester with recorded consent", () => {
    recordTesterConsent(null, window.localStorage);

    render(
      React.createElement(
        TesterOnboardingGate,
        {},
        React.createElement("div", {}, "Symptom checker child")
      )
    );

    expect(screen.getByText("Symptom checker child")).toBeTruthy();
    expect(
      screen.queryByText(
        "PawVital helps you understand urgency and prepare for a vet visit."
      )
    ).toBeNull();
  });

  it("keeps the emergency symptom flow available after acknowledgement", async () => {
    recordTesterConsent(null, window.localStorage);

    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        type: "emergency",
        message: "Contact a veterinarian immediately.",
        ready_for_report: true,
      }),
    }) as unknown as typeof fetch;

    render(
      React.createElement(
        TesterOnboardingGate,
        {},
        React.createElement(SymptomCheckerPage)
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Difficulty breathing" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText("Contact a veterinarian immediately.")
    ).toBeTruthy();
    expect(screen.getByText("Generate Emergency Report")).toBeTruthy();
    expect(screen.queryByText("View plans")).toBeNull();
  });
});
