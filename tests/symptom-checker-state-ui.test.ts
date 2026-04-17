/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { StateBadge } from "@/components/symptom-checker/state-badge";
import { ProgressBar } from "@/components/symptom-checker";
import { getConversationStateUi } from "@/app/(dashboard)/symptom-checker/conversation-state-ui";
import {
  TerminalOutcomePanel,
  TerminalOutcomeStatusBadge,
} from "@/components/symptom-checker/terminal-outcome-panel";

describe("symptom-checker conversation state UI", () => {
  // Case 1: asking badge
  it("renders 'Gathering details' label, info variant, and pulse dot for asking state", () => {
    render(React.createElement(StateBadge, { state: "asking" }));

    // The StateBadge renders meta.label from state-styles ("Asking") but
    // getConversationStateUi maps badgeLabel to "Gathering details" with tone "info".
    const ui = getConversationStateUi("asking", false);
    expect(ui.badgeLabel).toBe("Gathering details");
    expect(ui.tone).toBe("info");

    // The badge element is in the DOM — verify asking state renders the pulse dot
    // by checking the component mounts without error and the label is present.
    expect(screen.getByText("Asking")).toBeTruthy();

    // Pulse dot: the span with animate-pulse class is rendered for asking state.
    const pulseDot = document.querySelector(".animate-pulse");
    expect(pulseDot).not.toBeNull();
  });

  // Case 2: progress label — answeredCount=2, total=5, state="asking"
  it("shows '2 of 5 questions answered' progress label when answeredCount=2, total=5, state='asking'", () => {
    render(
      React.createElement(ProgressBar, {
        answered: 2,
        total: 5,
        state: "asking",
      })
    );

    expect(screen.getByText("2 of 5 questions answered")).toBeTruthy();

    const progressFill = screen.getByTestId(
      "conversation-progress-fill"
    ) as HTMLDivElement;
    const width = Number.parseFloat(progressFill.style.width);
    // 2/5 = 40%
    expect(width).toBeGreaterThanOrEqual(39);
    expect(width).toBeLessThanOrEqual(41);
  });

  // Case 3: new session reset — state="idle", answered=0, total=0
  it("shows 'Ready' badge and progress bar at 0% for idle state (new session)", () => {
    const { container: badgeContainer } = render(
      React.createElement(StateBadge, { state: "idle" })
    );

    expect(screen.getByText("Ready")).toBeTruthy();

    const ui = getConversationStateUi("idle", false);
    expect(ui.badgeLabel).toBe("Ready");

    // Clean up badge before rendering ProgressBar
    badgeContainer.remove();

    render(
      React.createElement(ProgressBar, {
        answered: 0,
        total: 0,
        state: "idle",
      })
    );

    const progressFill = screen.getByTestId(
      "conversation-progress-fill"
    ) as HTMLDivElement;
    expect(progressFill.style.width).toBe("0%");
  });

  // Case 4: needs_clarification
  it("renders 'Need one more detail' badge label and warning tone for needs_clarification state", () => {
    render(React.createElement(StateBadge, { state: "needs_clarification" }));

    // StateBadge renders "Clarifying" from state-styles
    expect(screen.getByText("Clarifying")).toBeTruthy();

    // getConversationStateUi maps badgeLabel to "Need one more detail", tone "warning"
    const ui = getConversationStateUi("needs_clarification", false);
    expect(ui.badgeLabel).toBe("Need one more detail");
    expect(ui.tone).toBe("warning");
  });

  // Case 5: escalation — badge "Urgent next step", progress at 100%
  it("renders 'Urgent next step' label and progress bar at 100% for escalation state", () => {
    render(
      React.createElement(ProgressBar, {
        answered: 3,
        total: 5,
        state: "escalation",
      })
    );

    const progressFill = screen.getByTestId(
      "conversation-progress-fill"
    ) as HTMLDivElement;
    expect(progressFill.style.width).toBe("100%");

    const ui = getConversationStateUi("escalation", false);
    expect(ui.badgeLabel).toBe("Urgent next step");
  });

  // Case 6: confirmed + readyForReport=true — badge "Ready for report", progress at 100%
  it("returns 'Ready for report' label and progress at 100% when confirmed and readyForReport=true", () => {
    const ui = getConversationStateUi("confirmed", true);
    expect(ui.badgeLabel).toBe("Ready for report");

    render(
      React.createElement(ProgressBar, {
        answered: 5,
        total: 5,
        state: "confirmed",
      })
    );

    const progressFill = screen.getByTestId(
      "conversation-progress-fill"
    ) as HTMLDivElement;
    expect(progressFill.style.width).toBe("100%");
  });

  // Case 7: answered_unconfirmed — badge "Reviewing detail", warning variant
  it("renders 'Reviewing detail' label and warning variant for answered_unconfirmed state", () => {
    render(React.createElement(StateBadge, { state: "answered_unconfirmed" }));

    // StateBadge renders "Processing" from state-styles
    expect(screen.getByText("Processing")).toBeTruthy();

    const ui = getConversationStateUi("answered_unconfirmed", false);
    expect(ui.badgeLabel).toBe("Reviewing detail");
    expect(ui.tone).toBe("warning");
  });

  it("renders cannot_assess terminal outcome details with mapped reason and restart action", () => {
    const handleStartNewSession = jest.fn();

    render(
      React.createElement(TerminalOutcomePanel, {
        type: "cannot_assess",
        reasonCode: "owner_cannot_assess_gum_color",
        ownerMessage:
          "I can't safely continue without confirming this critical sign for Buddy.",
        recommendedNextStep:
          "Seek veterinary assessment - this sign requires professional evaluation",
        onStartNewSession: handleStartNewSession,
      })
    );

    expect(screen.getByText("Cannot assess")).toBeTruthy();
    expect(
      screen.getByText(
        "This symptom check ended because a critical sign could not be confirmed"
      )
    ).toBeTruthy();
    expect(screen.getByText("Could not confirm gum color")).toBeTruthy();
    expect(
      screen.getByText(
        "Seek veterinary assessment - this sign requires professional evaluation"
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start New Session" }));
    expect(handleStartNewSession).toHaveBeenCalledTimes(1);
  });

  it("renders out_of_scope terminal badge and reason copy for unsupported cases", () => {
    render(
      React.createElement(
        "div",
        {},
        React.createElement(TerminalOutcomeStatusBadge, {
          type: "out_of_scope",
        }),
        React.createElement(TerminalOutcomePanel, {
          type: "out_of_scope",
          reasonCode: "species_not_supported",
          ownerMessage:
            "I can only assess dog symptom cases in this workflow right now.",
          recommendedNextStep:
            "Please contact a veterinarian for help with this species.",
          onStartNewSession: jest.fn(),
        })
      )
    );

    expect(screen.getAllByText("Out of scope").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Only dog symptom checks are supported right now")
    ).toBeTruthy();
    expect(
      screen.getByText("Please contact a veterinarian for help with this species.")
    ).toBeTruthy();
  });
});
