/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SignupConfirmPage from "@/app/(auth)/signup/confirm/page";

const mockReplaceWithBrowser = jest.fn();
const mockSearchParams = new URLSearchParams();

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
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/browser-navigation", () => ({
  replaceWithBrowser: (...args: unknown[]) => mockReplaceWithBrowser(...args),
}));

describe("signup confirm page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of [...mockSearchParams.keys()]) {
      mockSearchParams.delete(key);
    }
  });

  it("does not auto-confirm on page load", () => {
    mockSearchParams.set("token_hash", "hash-123");
    mockSearchParams.set("type", "signup");
    mockSearchParams.set("next", "/dashboard");

    render(React.createElement(SignupConfirmPage));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm my email" })).toBeTruthy();
  });

  it("confirms only after the user clicks the button", () => {
    mockSearchParams.set("token_hash", "hash-123");
    mockSearchParams.set("type", "signup");
    mockSearchParams.set("next", "/dashboard");

    render(React.createElement(SignupConfirmPage));

    fireEvent.click(screen.getByRole("button", { name: "Confirm my email" }));

    expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1);
    const destination = mockReplaceWithBrowser.mock.calls[0][0] as string;
    const url = new URL(destination, "http://localhost");
    expect(url.pathname).toBe("/api/auth/callback");
    expect(url.searchParams.get("token_hash")).toBe("hash-123");
    expect(url.searchParams.get("type")).toBe("signup");
    expect(url.searchParams.get("next")).toBe("/dashboard");
  });

  it("shows a recovery link when token_hash is missing", () => {
    render(React.createElement(SignupConfirmPage));

    expect(screen.getByText("Link not ready")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to signup" }).getAttribute("href")
    ).toContain("/signup");
  });
});
