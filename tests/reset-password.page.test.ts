/** @jest-environment jsdom */

import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";

const mockReplaceWithBrowser = jest.fn();
const mockSearchParams = new URLSearchParams();
const mockCookieGetSession = jest.fn();
const mockCookieOnAuthStateChange = jest.fn();
const mockCookieUpdateUser = jest.fn();
const mockCookieSignOut = jest.fn();
const mockImplicitGetSession = jest.fn();
const mockImplicitOnAuthStateChange = jest.fn();
const mockImplicitUpdateUser = jest.fn();
const mockImplicitSignOut = jest.fn();
let cookieAuthStateChange:
  | ((event: string, session: unknown) => void)
  | null = null;
let implicitAuthStateChange:
  | ((event: string, session: unknown) => void)
  | null = null;

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
  createClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockCookieGetSession(...args),
      onAuthStateChange: (...args: unknown[]) =>
        mockCookieOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockCookieSignOut(...args),
      updateUser: (...args: unknown[]) => mockCookieUpdateUser(...args),
    },
  }),
  createRecoveryClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockImplicitGetSession(...args),
      onAuthStateChange: (...args: unknown[]) =>
        mockImplicitOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockImplicitSignOut(...args),
      updateUser: (...args: unknown[]) => mockImplicitUpdateUser(...args),
    },
  }),
  isSupabaseConfigured: true,
}));

describe("reset password page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    cookieAuthStateChange = null;
    implicitAuthStateChange = null;
    Array.from(mockSearchParams.keys()).forEach((key) => {
      mockSearchParams.delete(key);
    });
    mockSearchParams.set("redirect", "/symptom-checker");
    window.history.replaceState({}, "", "/reset-password?redirect=%2Fsymptom-checker");
    window.location.hash = "";
    mockCookieGetSession.mockResolvedValue({ data: { session: null } });
    mockImplicitGetSession.mockResolvedValue({ data: { session: null } });
    mockCookieOnAuthStateChange.mockImplementation((callback) => {
      cookieAuthStateChange = callback as (event: string, session: unknown) => void;
      return {
        data: {
          subscription: {
            unsubscribe: jest.fn(),
          },
        },
      };
    });
    mockImplicitOnAuthStateChange.mockImplementation((callback) => {
      implicitAuthStateChange = callback as (event: string, session: unknown) => void;
      return {
        data: {
          subscription: {
            unsubscribe: jest.fn(),
          },
        },
      };
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

    mockCookieGetSession.mockResolvedValue({ data: { session: null } });
    mockImplicitGetSession
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
    mockCookieGetSession.mockResolvedValue({ data: { session: null } });
    mockImplicitGetSession.mockResolvedValue({ data: { session: null } });

    render(React.createElement(ResetPasswordPage));

    await waitFor(() =>
      expect(
        screen.getByText("This password reset link is invalid or has expired.")
      ).toBeTruthy()
    );
  });

  it("updates cookie-backed recovery sessions and returns through login", async () => {
    mockCookieGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "session-token",
          user: { id: "user-1" },
        },
      },
    });
    mockCookieUpdateUser.mockResolvedValue({ error: null });
    mockCookieSignOut.mockResolvedValue({ error: null });

    render(React.createElement(ResetPasswordPage));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update Password" })).toBeTruthy()
    );

    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repeat your new password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() =>
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
        "/login?redirect=%2Fsymptom-checker&reason=password_updated"
      )
    );
    expect(mockCookieUpdateUser).toHaveBeenCalledWith({
      password: "new-password-1",
    });
    expect(mockCookieSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockImplicitUpdateUser).not.toHaveBeenCalled();
  });

  it("updates implicit hash recovery sessions with the implicit client even when a cookie session exists", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password?redirect=%2Fhistory#access_token=test-token&refresh_token=test-refresh&token_type=bearer"
    );
    mockSearchParams.set("redirect", "/history");
    mockCookieGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "cookie-session-token",
          user: { id: "signed-in-user" },
        },
      },
    });
    mockImplicitGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "session-token",
          user: { id: "user-1" },
        },
      },
    });
    mockImplicitUpdateUser.mockResolvedValue({ error: null });
    mockImplicitSignOut.mockResolvedValue({ error: null });

    render(React.createElement(ResetPasswordPage));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update Password" })).toBeTruthy()
    );

    act(() => {
      cookieAuthStateChange?.("SIGNED_IN", {
        access_token: "cookie-session-token",
        user: { id: "signed-in-user" },
      });
    });

    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repeat your new password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() =>
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
        "/login?redirect=%2Fhistory&reason=password_updated"
      )
    );
    expect(mockImplicitUpdateUser).toHaveBeenCalledWith({
      password: "new-password-1",
    });
    expect(mockImplicitSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockCookieGetSession).not.toHaveBeenCalled();
    expect(mockCookieUpdateUser).not.toHaveBeenCalled();
    expect(implicitAuthStateChange).not.toBeNull();
  });
});
