/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";

const mockReplace = jest.fn();
const mockReplaceWithBrowser = jest.fn();
const mockSearchParams = new URLSearchParams();
const mockCreateClient = jest.fn();
const mockCreateRecoveryClient = jest.fn();

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
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/browser-navigation", () => ({
  replaceWithBrowser: (...args: unknown[]) => mockReplaceWithBrowser(...args),
}));

jest.mock("@/lib/supabase", () => ({
  createClient: () => mockCreateClient(),
  createRecoveryClient: () => mockCreateRecoveryClient(),
  isSupabaseConfigured: true,
}));

function fillRequiredAuthFields() {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.change(document.querySelector('input[type="password"]')!, {
    target: { value: "super-secret-password" },
  });
}

describe("auth page network error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.forEach((_, key) => {
      mockSearchParams.delete(key);
    });
    mockCreateRecoveryClient.mockImplementation(() => mockCreateClient());
  });

  it("shows a friendly login message instead of the raw fetch failure", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateClient.mockReturnValue({
      auth: {
        signInWithPassword: jest
          .fn()
          .mockRejectedValue(new TypeError("Failed to fetch")),
      },
    });

    try {
      render(React.createElement(LoginPage));
      fillRequiredAuthFields();

      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "We couldn't reach secure sign-in right now. Please try again in a moment."
          )
        ).toBeTruthy()
      );

      expect(screen.queryByText("Failed to fetch")).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps explicit credential errors on the login form", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateClient.mockReturnValue({
      auth: {
        signInWithPassword: jest
          .fn()
          .mockResolvedValue({ error: new Error("Invalid login credentials") }),
      },
    });

    try {
      render(React.createElement(LoginPage));
      fillRequiredAuthFields();

      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

      await waitFor(() =>
        expect(screen.getByText("Invalid login credentials")).toBeTruthy()
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("shows the friendly network message on account creation failure", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new TypeError("Network request failed"));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      render(React.createElement(SignupPage));

      fireEvent.change(screen.getByPlaceholderText("Your name"), {
        target: { value: "Dog Parent" },
      });
      fillRequiredAuthFields();

      fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "We couldn't reach account setup right now. Please try again in a moment."
          )
        ).toBeTruthy()
      );
    } finally {
      globalThis.fetch = originalFetch;
      errorSpy.mockRestore();
    }
  });

  it("shows the friendly network message on password reset failure", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateRecoveryClient.mockReturnValue({
      auth: {
        resetPasswordForEmail: jest
          .fn()
          .mockRejectedValue(new TypeError("Load failed")),
      },
    });

    try {
      render(React.createElement(ForgotPasswordPage));

      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "owner@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "We couldn't reach password reset right now. Please try again in a moment."
          )
        ).toBeTruthy()
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("auto-confirms signup through the server route and redirects", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, redirect: "/dashboard" }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      render(React.createElement(SignupPage));

      fireEvent.change(screen.getByPlaceholderText("Your name"), {
        target: { value: "Dog Parent" },
      });
      fillRequiredAuthFields();

      fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      expect(fetchMock).toHaveBeenCalledWith("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "super-secret-password",
          name: "Dog Parent",
          next: "/dashboard",
        }),
      });
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith("/dashboard");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows a resend confirmation button when signup lands with otp_expired", () => {
    mockSearchParams.set("error", "otp_expired");
    mockCreateClient.mockReturnValue({ auth: {} });

    render(React.createElement(SignupPage));

    expect(
      screen.getByRole("button", { name: "Resend confirmation email" })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "That email confirmation link has expired. Please sign up again to receive a new one."
      )
    ).toBeTruthy();
  });

  it("shows a resend confirmation button when signup lands with confirm_link_expired", () => {
    mockSearchParams.set("error", "confirm_link_expired");
    mockCreateClient.mockReturnValue({ auth: {} });

    render(React.createElement(SignupPage));

    expect(
      screen.getByRole("button", { name: "Resend confirmation email" })
    ).toBeTruthy();
  });

  it("shows a server signup error when auto-confirm fails", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        message:
          "An account with this email already exists. Sign in with your password, or reset it from the login page.",
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      render(React.createElement(SignupPage));

      fireEvent.change(screen.getByPlaceholderText("Your name"), {
        target: { value: "Dog Parent" },
      });
      fillRequiredAuthFields();
      fireEvent.click(screen.getByRole("button", { name: "Start Free Trial" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "An account with this email already exists. Sign in with your password, or reset it from the login page."
          )
        ).toBeTruthy()
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resends signup confirmation emails through the API auth callback", async () => {
    const resend = jest.fn().mockResolvedValue({ error: null });
    mockSearchParams.set("error", "otp_expired");
    mockCreateClient.mockReturnValue({
      auth: { resend },
    });

    render(React.createElement(SignupPage));

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Resend confirmation email" })
    );

    await waitFor(() => expect(resend).toHaveBeenCalled());

    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "owner@example.com",
      options: {
        emailRedirectTo: "http://localhost/api/auth/callback?next=%2Fdashboard",
      },
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          "We sent another confirmation email. Enter the 6-digit code from that email below."
        )
      ).toBeTruthy()
    );
  });

  it("verifies signup with a 6-digit confirmation code through the server route", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, redirect: "/dashboard" }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    mockSearchParams.set("error", "otp_expired");
    mockCreateClient.mockReturnValue({
      auth: {},
    });

    try {
      render(React.createElement(SignupPage));

      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "owner@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("6-digit code"), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Confirm with code" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify-signup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          token: "123456",
          next: "/dashboard",
        }),
      });
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith("/dashboard");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requires an email before resending signup confirmation", async () => {
    mockSearchParams.set("error", "otp_expired");
    mockCreateClient.mockReturnValue({
      auth: {
        resend: jest.fn(),
      },
    });

    render(React.createElement(SignupPage));

    fireEvent.click(
      screen.getByRole("button", { name: "Resend confirmation email" })
    );

    await waitFor(() =>
      expect(
        screen.getByText("Enter your email above to resend the confirmation link.")
      ).toBeTruthy()
    );
  });

  it("sends password reset emails through the implicit recovery client", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });
    mockCreateRecoveryClient.mockReturnValue({
      auth: {
        resetPasswordForEmail,
      },
    });

    render(React.createElement(ForgotPasswordPage));

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() =>
      expect(resetPasswordForEmail).toHaveBeenCalledWith(
        "owner@example.com",
        {
          redirectTo:
            "http://localhost/reset-password?redirect=%2Fdashboard",
        }
      )
    );
  });
});
