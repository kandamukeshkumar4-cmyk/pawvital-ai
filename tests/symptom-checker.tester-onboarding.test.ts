/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SymptomCheckerPage from "@/app/(dashboard)/symptom-checker/page";
import TesterOnboardingGate from "@/components/tester-onboarding/tester-onboarding-gate";
import { useAppStore } from "@/store/app-store";
import {
  TESTER_ACKNOWLEDGEMENT_STORAGE_KEY,
  TESTER_ACKNOWLEDGEMENT_VERSION,
} from "@/lib/tester-acknowledgement";
import type { Pet, UserProfile } from "@/types";

const mockUsePathname = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock("@/components/symptom-report", () => ({
  __esModule: true,
  FullReport: () => null,
}));

const TEST_PET: Pet = {
  id: "pet-1",
  user_id: "user-1",
  name: "Buddy",
  breed: "Golden Retriever",
  species: "dog",
  age_years: 4,
  age_months: 0,
  weight: 55,
  weight_unit: "lbs",
  gender: "male",
  is_neutered: true,
  existing_conditions: [],
  medications: [],
  created_at: "2026-04-20T12:00:00.000Z",
  updated_at: "2026-04-20T12:00:00.000Z",
};

const TEST_USER: UserProfile = {
  id: "user-1",
  email: "tester@example.com",
  full_name: "Tester",
  subscription_status: "active",
  created_at: "2026-04-20T12:00:00.000Z",
};

function seedAppStore() {
  useAppStore.setState((state) => ({
    ...state,
    user: TEST_USER,
    pets: [TEST_PET],
    activePet: TEST_PET,
    userDataLoaded: true,
  }));
}

function renderSymptomChecker() {
  return render(
    React.createElement(
      TesterOnboardingGate,
      {},
      React.createElement(SymptomCheckerPage)
    )
  );
}

describe("tester onboarding boundaries on the symptom checker", () => {
  beforeEach(() => {
    seedAppStore();
    localStorage.clear();
    jest.resetAllMocks();
    mockUsePathname.mockReturnValue("/symptom-checker");
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("shows the first-use boundary screen, records acknowledgement, and skips it for returning users", async () => {
    const view = renderSymptomChecker();

    expect(await screen.findByText("Before you use PawVital with Buddy")).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Acknowledge and continue",
      }) as HTMLButtonElement).disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge and continue" })
    );

    expect(screen.getByText("Tell me what's going on with Buddy")).toBeTruthy();

    const stored = JSON.parse(
      localStorage.getItem(TESTER_ACKNOWLEDGEMENT_STORAGE_KEY) ?? "{}"
    ) as Record<string, { version?: string }>;
    expect(stored["user:user-1"]?.version).toBe(
      TESTER_ACKNOWLEDGEMENT_VERSION
    );

    view.unmount();
    renderSymptomChecker();

    expect(screen.queryByText("Before you use PawVital with Buddy")).toBeNull();
    expect(
      screen.getAllByText("Tell me what's going on with Buddy").length
    ).toBeGreaterThan(0);
  });

  it("keeps the emergency chat flow available after acknowledgement", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        type: "emergency",
        message:
          "Buddy may be having a medical emergency. Please go to the nearest emergency veterinary hospital now.",
        session: {
          answered_questions: {},
          unresolved_question_ids: [],
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderSymptomChecker();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge and continue" })
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe what's going on with Buddy or attach a photo..."
      ),
      {
        target: { value: "Buddy collapsed and has pale gums." },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Buddy may be having a medical emergency\./i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Generate Emergency Report" })
    ).toBeTruthy();
  });
});
