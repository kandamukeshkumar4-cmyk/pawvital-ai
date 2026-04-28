/** @jest-environment jsdom */

import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AuthCallbackPage from "@/app/auth/callback/page";

const mockExchangeCodeForSession = jest.fn();
const mockReplaceWithBrowser = jest.fn();

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

jest.mock("@/lib/browser-navigation", () => ({
  replaceWithBrowser: (...args: unknown[]) => mockReplaceWithBrowser(...args),
}));

jest.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
    },
  }),
  isSupabaseConfigured: true,
}));

function setCallbackUrl(next: string) {
  window.history.pushState(
    {},
    "",
    `/auth/callback?code=test-code&next=${encodeURIComponent(next)}`
  );
}

describe("auth browser callback page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a reset-link fallback when recovery callback completion throws", async () => {
    mockExchangeCodeForSession.mockRejectedValue(new Error("PKCE verifier missing"));
    setCallbackUrl("/reset-password?redirect=%2Fsymptom-checker");

    render(React.createElement(AuthCallbackPage));

    await waitFor(() =>
      expect(
        screen.getByText(
          "We couldn't complete password reset from that link. Please try again."
        )
      ).toBeTruthy()
    );

    expect(
      screen.getByRole("link", { name: "Request a new reset link" }).getAttribute("href")
    ).toBe("/forgot-password");
  });

  it("shows a sign-in fallback when non-recovery callback completion throws", async () => {
    mockExchangeCodeForSession.mockRejectedValue(new Error("PKCE verifier missing"));
    setCallbackUrl("/dashboard");

    render(React.createElement(AuthCallbackPage));

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't complete sign-in from that link. Please try again.")
      ).toBeTruthy()
    );

    expect(
      screen.getByRole("link", { name: "Return to sign in" }).getAttribute("href")
    ).toBe("/login?redirect=%2Fdashboard&error=auth_callback_failed");
  });

  it("keeps recovery callbacks on the reset-password form before the app redirect", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    window.history.pushState(
      {},
      "",
      "/auth/callback?code=test-code&flow=recovery&next=%2Fsymptom-checker"
    );

    render(React.createElement(AuthCallbackPage));

    await waitFor(() =>
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
        "/reset-password?redirect=%2Fsymptom-checker"
      )
    );
  });
});
