/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";

const mockReplace = jest.fn();
const mockSearchParams = new URLSearchParams();
const mockCreateClient = jest.fn();

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

jest.mock("@/lib/supabase", () => ({
  createClient: () => mockCreateClient(),
  isSupabaseConfigured: true,
}));

function fillRequiredAuthFields() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "super-secret-password" },
  });
}

describe("auth page network error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockCreateClient.mockReturnValue({
      auth: {
        signUp: jest
          .fn()
          .mockRejectedValue(new TypeError("Network request failed")),
      },
    });

    try {
      render(React.createElement(SignupPage));

      fireEvent.change(screen.getByLabelText("Full Name"), {
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
      errorSpy.mockRestore();
    }
  });

  it("shows the friendly network message on password reset failure", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateClient.mockReturnValue({
      auth: {
        resetPasswordForEmail: jest
          .fn()
          .mockRejectedValue(new TypeError("Load failed")),
      },
    });

    try {
      render(React.createElement(ForgotPasswordPage));

      fireEvent.change(screen.getByLabelText("Email"), {
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

  it("sends password reset emails through the browser callback for PKCE recovery", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });
    mockCreateClient.mockReturnValue({
      auth: {
        resetPasswordForEmail,
      },
    });

    render(React.createElement(ForgotPasswordPage));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() =>
      expect(resetPasswordForEmail).toHaveBeenCalledWith(
        "owner@example.com",
        {
          redirectTo:
            "http://localhost/auth/callback?flow=recovery&next=%2Freset-password%3Fredirect%3D%252Fdashboard",
        }
      )
    );
  });
});
