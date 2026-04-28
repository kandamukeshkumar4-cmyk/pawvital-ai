/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";

const mockSearchParams = new URLSearchParams();
const mockResetPasswordForEmail = jest.fn();

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

jest.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: (...args: unknown[]) =>
        mockResetPasswordForEmail(...args),
    },
  }),
  isSupabaseConfigured: true,
}));

describe("forgot password page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.set("redirect", "/symptom-checker");
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("sends recovery emails straight to the reset-password page", async () => {
    render(React.createElement(ForgotPasswordPage));

    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(document.querySelector('button[type="submit"]')!);

    await waitFor(() =>
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "owner@example.com",
        {
          redirectTo:
            "http://localhost/reset-password?redirect=%2Fsymptom-checker",
        }
      )
    );
  });
});
