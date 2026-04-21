/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TesterAccessDashboardClient from "@/app/(dashboard)/admin/tester-access/TesterAccessDashboardClient";
import type { PrivateTesterDashboardData } from "@/lib/private-tester-admin";

jest.mock("next/link", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: ({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
    }) => ReactActual.createElement("a", { href, ...props }, children),
  };
});

function buildDashboard(): PrivateTesterDashboardData {
  return {
    config: {
      allowedEmailCount: 1,
      allowedEmails: ["tester@example.com"],
      blockedEmailCount: 0,
      blockedEmails: [],
      freeAccess: true,
      guestSymptomChecker: false,
      inviteOnly: true,
      modeEnabled: true,
    },
    summary: {
      active: 1,
      authAccessDisabled: 0,
      blocked: 0,
      deletionRequested: 0,
      negativeFeedbackEntries: 0,
      symptomChecks: 1,
      total: 1,
    },
    testers: [
      {
        access: {
          allowed: true,
          blocked: false,
          email: "tester@example.com",
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
          reason: "allowlisted_email",
        },
        adminState: {
          accessDisabled: false,
          accessDisabledAt: null,
          auditLog: [],
          deletionRequested: false,
          deletionRequestedAt: null,
        },
        config: {
          allowedEmailCount: 1,
          allowedEmails: ["tester@example.com"],
          blockedEmailCount: 0,
          blockedEmails: [],
          freeAccess: true,
          guestSymptomChecker: false,
          inviteOnly: true,
          modeEnabled: true,
        },
        counts: {
          caseOutcomes: 0,
          journalEntries: 0,
          negativeFeedbackEntries: 0,
          notifications: 0,
          outcomeFeedbackEntries: 0,
          pets: 1,
          sharedReports: 0,
          subscriptions: 0,
          symptomChecks: 1,
          thresholdProposals: 0,
        },
        recentCases: [],
        user: {
          email: "tester@example.com",
          fullName: "Tester",
          id: "user-1",
        },
      },
    ],
  };
}

describe("TesterAccessDashboardClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a clear founder/admin access message when the admin API returns 403", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ error: "Unauthorized" }),
      ok: false,
      status: 403,
    }) as jest.Mock;

    render(
      React.createElement(TesterAccessDashboardClient, {
        initialData: buildDashboard(),
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable Access" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Tester access controls are only available to authorized founder/admin accounts. Return to /admin or sign in with the founder/admin account to continue."
        )
      ).toBeTruthy();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/admin/private-tester", {
      body: JSON.stringify({
        action: "disable_access",
        email: "tester@example.com",
      }),
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });
});
