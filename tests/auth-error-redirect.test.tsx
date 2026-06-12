/** @jest-environment jsdom */

import * as React from "react";
import { render, waitFor } from "@testing-library/react";
import AuthErrorRedirect from "@/components/auth/auth-error-redirect";

const mockReplaceWithBrowser = jest.fn();

jest.mock("@/lib/browser-navigation", () => ({
  replaceWithBrowser: (...args: unknown[]) => mockReplaceWithBrowser(...args),
}));

describe("auth error redirect guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("redirects otp_expired landing errors to signup with a friendly error code", async () => {
    window.history.replaceState(
      {},
      "",
      "/?error=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
    );

    render(React.createElement(AuthErrorRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));
    expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
      "/signup?redirect=%2Fdashboard&error=otp_expired"
    );
  });

  it("redirects Supabase access_denied + error_code=otp_expired query and hash to signup", async () => {
    window.history.replaceState(
      {},
      "",
      "/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
    );

    render(React.createElement(AuthErrorRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));
    expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
      "/signup?redirect=%2Fdashboard&error=otp_expired"
    );
  });

  it("preserves safe redirect targets when rerouting otp_expired errors", async () => {
    window.history.replaceState(
      {},
      "",
      "/?error=otp_expired&redirect=%2Fsymptom-checker"
    );

    render(React.createElement(AuthErrorRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));
    expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
      "/signup?redirect=%2Fsymptom-checker&error=otp_expired"
    );
  });

  it("drops unsafe external redirect targets from otp_expired errors", async () => {
    window.history.replaceState(
      {},
      "",
      "/?error=otp_expired&redirect=https%3A%2F%2Fevil.example%2Fsteal"
    );

    render(React.createElement(AuthErrorRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));

    const destination = mockReplaceWithBrowser.mock.calls[0][0] as string;
    expect(destination).toBe("/signup?redirect=%2Fdashboard&error=otp_expired");
    expect(destination).not.toContain("evil.example");
  });

  it("does not reroute auth errors when already on signup or login", () => {
    window.history.replaceState({}, "", "/signup?error=otp_expired");

    render(React.createElement(AuthErrorRedirect));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
  });

  it("does not reroute unrelated landing-page query params", () => {
    window.history.replaceState({}, "", "/?utm_source=email");

    render(React.createElement(AuthErrorRedirect));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
  });
});
