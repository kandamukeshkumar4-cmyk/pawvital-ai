/** @jest-environment jsdom */

import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";

const mockReplaceWithBrowser = jest.fn();
const mockSearchParams = new URLSearchParams();
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("next/link", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: ({
      children,
      href,
      prefetch: _prefetch,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      prefetch?: boolean;
    }) => ReactActual.createElement("a", { href, ...props }, children),
  };
});

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/browser-navigation", () => ({
  replaceWithBrowser: (...args: unknown[]) => mockReplaceWithBrowser(...args),
}));

jest.mock("@/lib/supabase", () => ({
  createRecoveryClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  }),
  isSupabaseConfigured: true,
}));

describe("reset password page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    window.history.replaceState({}, "", "/reset-password?redirect=%2Fsymptom-checker");
    window.location.hash = "";
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("waits for an implicit recovery session before showing the invalid-link state", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password?redirect=%2Fsymptom-checker#access_token=test-token&refresh_token=test-refresh&token_type=bearer"
    );

    mockGetSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "session-token",
            user: { id: "user-1" },
          },
        },
      });

    render(React.createElement(ResetPasswordPage));

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update Password" })).toBeTruthy()
    );

    expect(
      screen.queryByText("This password reset link is invalid or has expired.")
    ).toBeNull();
  });

  it("shows the invalid-link state when no recovery session arrives", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(React.createElement(ResetPasswordPage));

    await waitFor(() =>
      expect(
        screen.getByText("This password reset link is invalid or has expired.")
      ).toBeTruthy()
    );
  });
});
