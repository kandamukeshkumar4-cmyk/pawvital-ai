/** @jest-environment jsdom */

import * as React from "react";
import { render, screen } from "@testing-library/react";
import AnalyticsPage from "@/app/(dashboard)/analytics/page";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import CommunityPage from "@/app/(dashboard)/community/page";
import JournalPage from "@/app/(dashboard)/journal/page";
import RemindersPage from "@/app/(dashboard)/reminders/page";
import SupplementsPage from "@/app/(dashboard)/supplements/page";
import Sidebar from "@/components/dashboard/sidebar";
import { PRIVATE_TESTER_MODE_COOKIE } from "@/lib/private-tester-access";
import { useAppStore } from "@/store/app-store";
import type { Pet, UserProfile } from "@/types";

const mockUsePathname = jest.fn();
const mockSignOut = jest.fn();

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

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock("@/hooks/useSupabase", () => ({
  useAuth: () => ({
    signOut: mockSignOut,
  }),
}));

const TEST_PET = {
  id: "pet-1",
  user_id: "user-1",
  name: "Buddy",
  breed: "Golden Retriever",
  species: "dog",
  age_years: 4,
  age_months: 0,
  weight: 55,
  existing_conditions: [],
} as Pet;

const TEST_USER = {
  id: "user-1",
  email: "tester@example.com",
  full_name: "Tester",
  subscription_status: "free_trial",
  created_at: "2026-04-21T12:00:00.000Z",
} as UserProfile;

function seedStore() {
  useAppStore.setState((state) => ({
    ...state,
    activePet: TEST_PET,
    pets: [TEST_PET],
    sidebarOpen: true,
    user: TEST_USER,
    userDataLoaded: true,
  }));
}

function setPrivateTesterMode(enabled: boolean) {
  if (enabled) {
    process.env.NEXT_PUBLIC_PRIVATE_TESTER_MODE = "1";
    return;
  }

  delete process.env.NEXT_PUBLIC_PRIVATE_TESTER_MODE;
}

function setPrivateTesterModeCookie(enabled: boolean) {
  document.cookie = `${PRIVATE_TESTER_MODE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;

  if (enabled) {
    document.cookie = `${PRIVATE_TESTER_MODE_COOKIE}=1; path=/`;
  }
}

describe("private tester scope UI", () => {
  const originalPrivateTesterMode = process.env.NEXT_PUBLIC_PRIVATE_TESTER_MODE;

  beforeEach(() => {
    seedStore();
    jest.clearAllMocks();
    setPrivateTesterMode(false);
    setPrivateTesterModeCookie(false);
    mockUsePathname.mockReturnValue("/dashboard");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        addEventListener: jest.fn(),
        addListener: jest.fn(),
        dispatchEvent: jest.fn(),
        matches: true,
        media: query,
        onchange: null,
        removeEventListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    });
  });

  afterAll(() => {
    setPrivateTesterModeCookie(false);
    if (originalPrivateTesterMode) {
      process.env.NEXT_PUBLIC_PRIVATE_TESTER_MODE = originalPrivateTesterMode;
      return;
    }

    delete process.env.NEXT_PUBLIC_PRIVATE_TESTER_MODE;
  });

  it("VET-1368 tester scope UI: hides out-of-scope sidebar navigation in private tester mode", () => {
    setPrivateTesterMode(true);

    render(React.createElement(Sidebar));

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("My Dogs")).toBeTruthy();
    expect(screen.getByText("Symptom Checker")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.queryByText("Analytics")).toBeNull();
    expect(screen.queryByText("Supplements")).toBeNull();
    expect(screen.queryByText("Reminders")).toBeNull();
    expect(screen.queryByText("Journal")).toBeNull();
    expect(screen.queryByText("Paw Circle")).toBeNull();
  });

  it("VET-1368 tester scope UI: keeps the full sidebar navigation when private tester mode is off", () => {
    setPrivateTesterMode(false);

    render(React.createElement(Sidebar));

    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.getByText("Supplements")).toBeTruthy();
    expect(screen.getByText("Reminders")).toBeTruthy();
    expect(screen.getByText("Journal")).toBeTruthy();
    expect(screen.getByText("Paw Circle")).toBeTruthy();
  });

  it("VET-1368 tester scope UI: swaps the dashboard to private-test-safe focus content", () => {
    setPrivateTesterMode(true);

    render(React.createElement(DashboardPage));

    expect(screen.getByText("Private tester home")).toBeTruthy();
    expect(
      screen.getByText(
        "This private test is focused on dog symptom triage, urgency guidance, vet handoff reports, feedback, and onboarding."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Supplements, Paw Circle, analytics, reminders, and journal tools are hidden or disabled for private testers."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Start symptom check").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Review reports and feedback").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Daily Health Score")).toBeNull();
    expect(screen.queryByText("View Supplements")).toBeNull();
    expect(screen.queryByText("Joint supplement administered")).toBeNull();
  });

  it("VET-1368 tester scope UI: quarantines Paw Circle with safe private-test copy", () => {
    setPrivateTesterMode(true);

    render(React.createElement(CommunityPage));

    expect(
      screen.getByText("Paw Circle is disabled for private testers")
    ).toBeTruthy();
    expect(
      screen.getByText("Community features are not part of this private test.")
    ).toBeTruthy();
    expect(screen.queryByText("Connect with fellow dog parents")).toBeNull();
    expect(
      screen.queryByText("Cooper's mobility improved so much in 3 months!")
    ).toBeNull();
  });

  it("VET-1368 tester scope UI: quarantines supplements with safe private-test copy", () => {
    setPrivateTesterMode(true);

    render(React.createElement(SupplementsPage));

    expect(
      screen.getByText("Supplement plan is disabled for private testers")
    ).toBeTruthy();
    expect(
      screen.getByText("Supplement plans are not part of this private test.")
    ).toBeTruthy();
    expect(screen.queryByText("Supplement Plan")).toBeNull();
    expect(screen.queryByText("Glucosamine & Chondroitin")).toBeNull();
    expect(screen.queryByText(/73% improvement in mobility/i)).toBeNull();
  });

  it("VET-1368 tester scope UI: quarantines direct route access for analytics, reminders, and journal", () => {
    setPrivateTesterMode(true);

    const directRoutes = [
      {
        component: AnalyticsPage,
        detail: "Analytics dashboards are not part of this private test.",
        heading: "Health analytics is disabled for private testers",
      },
      {
        component: RemindersPage,
        detail: "Reminder tools are not part of this private test.",
        heading: "Reminder tools is disabled for private testers",
      },
      {
        component: JournalPage,
        detail: "Journal tools are not part of this private test.",
        heading: "Journal is disabled for private testers",
      },
    ];

    for (const route of directRoutes) {
      const { unmount } = render(React.createElement(route.component));
      expect(screen.getByText(route.heading)).toBeTruthy();
      expect(screen.getByText(route.detail)).toBeTruthy();
      expect(
        screen.getByText(
          "This private test is focused on dog symptom triage, urgency guidance, vet handoff reports, feedback, and onboarding."
        )
      ).toBeTruthy();
      unmount();
    }

    expect(screen.queryByText("Health analytics")).toBeNull();
    expect(screen.queryByText("Never miss a medication or appointment")).toBeNull();
    expect(screen.queryByText("AI Weekly Summary")).toBeNull();
  });

  it("VET-1390 tester scope UI: honors the proxy quarantine cookie when the public mode flag is absent", () => {
    setPrivateTesterModeCookie(true);

    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Sidebar),
        React.createElement(DashboardPage),
        React.createElement(CommunityPage),
        React.createElement(SupplementsPage)
      )
    );

    expect(screen.queryByText("Supplements")).toBeNull();
    expect(screen.queryByText("Paw Circle")).toBeNull();
    expect(screen.getByText("Private tester home")).toBeTruthy();
    expect(
      screen.getByText("Paw Circle is disabled for private testers")
    ).toBeTruthy();
    expect(
      screen.getByText("Supplement plan is disabled for private testers")
    ).toBeTruthy();
    expect(screen.queryByText("View Supplements")).toBeNull();
    expect(screen.queryByText("Connect with fellow dog parents")).toBeNull();
  });
});
