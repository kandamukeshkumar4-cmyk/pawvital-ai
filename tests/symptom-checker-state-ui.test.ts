/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SymptomCheckerPage from "@/app/(dashboard)/symptom-checker/page";
import { ProgressBar } from "@/components/symptom-checker";
import { useAppStore } from "@/store/app-store";

jest.mock("@/components/subscription/plan-gate", () => {
  const React = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/components/symptom-report", () => {
  const React = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    FullReport: () => React.createElement("div", null, "Mock report"),
  };
});

type JsonResponse = {
  json: () => Promise<unknown>;
};

function createJsonResponse(body: unknown): JsonResponse {
  return {
    json: async () => body,
  };
}

function createDeferredJsonResponse() {
  let resolveResponse: ((value: JsonResponse) => void) | null = null;

  const promise = new Promise<JsonResponse>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    promise,
    resolve(body: unknown) {
      if (!resolveResponse) {
        throw new Error("Deferred response has not been initialized.");
      }

      resolveResponse(createJsonResponse(body));
    },
  };
}

describe("symptom-checker conversation state UI", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    useAppStore.setState({ activePet: null });

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("captures conversation state from API responses and renders the asking badge", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        type: "question",
        message: "How long has this been going on?",
        conversationState: "asking",
        session: {
          answered_questions: {},
          unresolved_question_ids: ["duration"],
        },
      })
    );

    render(React.createElement(SymptomCheckerPage));

    fireEvent.click(screen.getByRole("button", { name: "Not eating" }));

    await waitFor(() => {
      expect(screen.getByText("Asking")).toBeTruthy();
    });

    expect(screen.getByText("How long has this been going on?")).toBeTruthy();
  });

  it("updates answered question counts from the session payload", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        type: "question",
        message: "Any vomiting too?",
        conversationState: "asking",
        session: {
          answered_questions: {
            appetite: "reduced",
            energy: "low",
          },
          unresolved_question_ids: ["vomiting", "duration"],
        },
      })
    );

    render(React.createElement(SymptomCheckerPage));

    fireEvent.click(screen.getByRole("button", { name: "Not eating" }));

    await waitFor(() => {
      expect(screen.getByText("2 of 4 questions answered")).toBeTruthy();
    });
  });

  it("resets conversation state and progress when starting a new session", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        type: "question",
        message: "Is your dog still eating at all?",
        conversationState: "asking",
        session: {
          answered_questions: {
            appetite: "reduced",
            energy: "low",
          },
          unresolved_question_ids: ["vomiting", "duration"],
        },
      })
    );

    const deferredSecondResponse = createDeferredJsonResponse();
    fetchMock.mockImplementationOnce(
      () => deferredSecondResponse.promise as unknown as Promise<Response>
    );

    render(React.createElement(SymptomCheckerPage));

    fireEvent.click(screen.getByRole("button", { name: "Not eating" }));

    await waitFor(() => {
      expect(screen.getByText("2 of 4 questions answered")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "New Session" }));

    expect(screen.queryByText("2 of 4 questions answered")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Not eating" }));

    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeTruthy();
    });

    deferredSecondResponse.resolve({
      type: "question",
      message: "Does the appetite change come and go?",
      conversationState: "asking",
      session: {},
    });

    await waitFor(() => {
      expect(screen.getByText("Does the appetite change come and go?")).toBeTruthy();
    });

    expect(screen.queryByText("2 of 4 questions answered")).toBeNull();
  });

  it("renders clarification styling when the API reports needs_clarification", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        type: "question",
        message: "Which leg is affected?",
        conversationState: "needs_clarification",
        session: {
          answered_questions: {
            limping: true,
          },
          unresolved_question_ids: ["which_leg"],
        },
      })
    );

    render(React.createElement(SymptomCheckerPage));

    fireEvent.click(screen.getByRole("button", { name: "Limping" }));

    await waitFor(() => {
      expect(screen.getByText("Clarifying")).toBeTruthy();
    });

    expect(screen.getByText("Let me clarify...")).toBeTruthy();

    const clarificationBubble = screen.getByText("Which leg is affected?").closest("div");
    expect(clarificationBubble).toBeTruthy();
    expect(clarificationBubble?.className).toContain("border-l-4");
    expect(clarificationBubble?.className).toContain("border-l-orange-400");
  });

  it("renders escalation styling and emergency progress guidance", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        type: "emergency",
        message: "Go to the nearest emergency vet now.",
        conversationState: "escalation",
        session: {
          answered_questions: {
            breathing: "labored",
          },
          unresolved_question_ids: [],
        },
      })
    );

    render(React.createElement(SymptomCheckerPage));

    fireEvent.click(screen.getByRole("button", { name: "Difficulty breathing" }));

    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeTruthy();
    });

    expect(screen.getByText("Emergency - seek immediate care")).toBeTruthy();

    const emergencyBubble = screen.getByText("Go to the nearest emergency vet now.").closest("div");
    expect(emergencyBubble).toBeTruthy();
    expect(emergencyBubble?.className).toContain("animate-pulse");
    expect(emergencyBubble?.className).toContain("border-red-500");
  });

  it("computes progress width and shows the confirmed complete state", () => {
    const { rerender } = render(
      React.createElement(ProgressBar, {
        answered: 3,
        total: 7,
        state: "asking",
      })
    );

    const progressFill = screen.getByTestId("conversation-progress-fill") as HTMLDivElement;
    const width = Number.parseFloat(progressFill.style.width);

    expect(width).toBeGreaterThan(42);
    expect(width).toBeLessThan(44);
    expect(screen.getByText("3 of 7 questions answered")).toBeTruthy();

    rerender(
      React.createElement(ProgressBar, {
        answered: 7,
        total: 7,
        state: "confirmed",
      })
    );

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(
      (screen.getByTestId("conversation-progress-fill") as HTMLDivElement).style.width
    ).toBe("100%");
  });
});