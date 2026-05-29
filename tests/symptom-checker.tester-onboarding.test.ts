/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SymptomCheckerPage from "@/app/(dashboard)/symptom-checker/page";
import { useAppStore } from "@/store/app-store";
import {
  TESTER_ACKNOWLEDGEMENT_STORAGE_KEY,
  TESTER_ACKNOWLEDGEMENT_VERSION,
} from "@/lib/tester-acknowledgement";
import type { Pet, UserProfile } from "@/types";

jest.mock("@/components/symptom-report", () => ({
  __esModule: true,
  FullReport: () => null,
}));

jest.mock("@/components/symptom-checker/use-webpubsub-live-updates", () => ({
  useWebPubSubLiveUpdates: jest.fn(),
}));

const TEST_PET = {
  id: "pet-1",
  user_id: "user-1",
  name: "Buddy",
  breed: "Golden Retriever",
  species: "dog",
  age_years: 4,
  weight: 55,
  existing_conditions: [],
} as Pet;

const TEST_USER = {
  id: "user-1",
  email: "tester@example.com",
} as UserProfile;

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
  return render(React.createElement(SymptomCheckerPage));
}

function acknowledgeBoundary() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "Acknowledge and continue" })
  );
}

describe("tester onboarding boundaries on the symptom checker", () => {
  beforeEach(() => {
    seedAppStore();
    localStorage.clear();
    jest.clearAllMocks();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("shows the first-use boundary screen, records acknowledgement, and skips it for returning users", async () => {
    const view = renderSymptomChecker();

    expect(
      await screen.findByText("Before you use PawVital with Buddy")
    ).toBeTruthy();
    expect(screen.getByText("Dog-only")).toBeTruthy();
    expect(
      screen.getByText(
        "PawVital gives urgency guidance, not diagnosis or treatment."
      )
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Acknowledge and continue",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    acknowledgeBoundary();

    expect(screen.getByText("Tell me what's going on with Buddy")).toBeTruthy();

    const stored = JSON.parse(
      localStorage.getItem(TESTER_ACKNOWLEDGEMENT_STORAGE_KEY) ?? "{}"
    ) as Record<string, { version?: string }>;
    expect(stored["user:user-1"]?.version).toBe(
      TESTER_ACKNOWLEDGEMENT_VERSION
    );

    view.unmount();
    renderSymptomChecker();

    expect(
      await screen.findByText("Tell me what's going on with Buddy")
    ).toBeTruthy();
    expect(screen.queryByText("Before you use PawVital with Buddy")).toBeNull();
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
    acknowledgeBoundary();

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

    expect(
      await screen.findByText(/Buddy may be having a medical emergency\./i)
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Generate Emergency Vet Summary" })
    ).toBeTruthy();
  });

  it("keeps multilingual owner display separate from English clinical API messages", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/azure/translator") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          targetLanguage?: string;
          texts?: string[];
        };
        return {
          json: async () =>
            body.targetLanguage === "en"
              ? {
                  detectedLanguage: "es",
                  enabled: true,
                  sourceLanguage: null,
                  targetLanguage: "en",
                  translated: true,
                  translations: ["Buddy is vomiting"],
                }
              : {
                  detectedLanguage: null,
                  enabled: true,
                  sourceLanguage: "en",
                  targetLanguage: "es",
                  translated: true,
                  translations: ["¿Cuántas veces ha vomitado Buddy?"],
                },
          ok: true,
          status: 200,
        };
      }

      return {
        json: async () => ({
          conversationState: "asking",
          message: "How many times has Buddy vomited?",
          session: {
            answered_questions: {},
            unresolved_question_ids: ["vomiting_frequency"],
          },
          type: "question",
        }),
        ok: true,
        status: 200,
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderSymptomChecker();
    acknowledgeBoundary();

    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe what's going on with Buddy or attach a photo..."
      ),
      {
        target: { value: "Buddy está vomitando" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/symptom-chat",
        expect.any(Object)
      );
    });

    const symptomCall = fetchMock.mock.calls.find(
      ([input]) => input === "/api/ai/symptom-chat"
    );
    const symptomPayload = JSON.parse(
      String((symptomCall?.[1] as RequestInit | undefined)?.body ?? "{}")
    ) as { messages: Array<{ content: string; role: string }> };

    expect(symptomPayload.messages.at(-1)).toEqual({
      content: "Buddy is vomiting",
      role: "user",
    });
    expect(await screen.findByText("Buddy está vomitando")).toBeTruthy();
    expect(
      await screen.findByText("¿Cuántas veces ha vomitado Buddy?")
    ).toBeTruthy();
  });
});
