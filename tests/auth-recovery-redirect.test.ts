/** @jest-environment jsdom */

import * as React from "react";
import { render, waitFor } from "@testing-library/react";
import RecoveryRedirect from "@/components/auth/recovery-redirect";

const mockReplaceWithBrowser = jest.fn();

jest.mock("@/lib/browser-navigation", () => ({
  replaceWithBrowser: (...args: unknown[]) => mockReplaceWithBrowser(...args),
}));

describe("recovery redirect guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, "", "/");
    window.location.hash = "";
  });

  it("moves recovery hashes from the landing page to reset-password", async () => {
    window.history.replaceState(
      {},
      "",
      "/#access_token=test-token&refresh_token=test-refresh&type=recovery&token_type=bearer"
    );

    render(React.createElement(RecoveryRedirect));

    await waitFor(() =>
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
        "/reset-password#access_token=test-token&refresh_token=test-refresh&type=recovery&token_type=bearer"
      )
    );
  });

  it("preserves protected redirect targets when recovery hashes land at root", async () => {
    window.history.replaceState(
      {},
      "",
      "/?redirect=%2Fsymptom-checker#access_token=test-token&refresh_token=test-refresh&type=recovery"
    );

    render(React.createElement(RecoveryRedirect));

    await waitFor(() =>
      expect(mockReplaceWithBrowser).toHaveBeenCalledWith(
        "/reset-password?redirect=%2Fsymptom-checker#access_token=test-token&refresh_token=test-refresh&type=recovery"
      )
    );
  });

  it("hands root recovery codes to the existing auth callback route", async () => {
    window.history.replaceState(
      {},
      "",
      "/?code=recovery-code&type=recovery&redirect=%2Fsymptom-checker"
    );

    render(React.createElement(RecoveryRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));

    const destination = new URL(
      mockReplaceWithBrowser.mock.calls[0][0],
      window.location.origin
    );
    expect(destination.pathname).toBe("/api/auth/callback");
    expect(destination.searchParams.get("code")).toBe("recovery-code");
    expect(destination.searchParams.get("type")).toBe("recovery");
    expect(destination.searchParams.get("next")).toBe(
      "/reset-password?redirect=%2Fsymptom-checker"
    );
  });

  it("does not double-wrap recovery codes that already target reset-password", async () => {
    window.history.replaceState(
      {},
      "",
      "/?code=recovery-code&type=recovery&next=%2Freset-password%3Fredirect%3D%252Fhistory"
    );

    render(React.createElement(RecoveryRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));

    const destination = new URL(
      mockReplaceWithBrowser.mock.calls[0][0],
      window.location.origin
    );
    expect(destination.pathname).toBe("/api/auth/callback");
    expect(destination.searchParams.get("next")).toBe(
      "/reset-password?redirect=%2Fhistory"
    );
  });

  it("drops unsafe external redirect targets from recovery codes", async () => {
    window.history.replaceState(
      {},
      "",
      "/?code=recovery-code&type=recovery&redirect=https%3A%2F%2Fevil.example%2Fsteal"
    );

    render(React.createElement(RecoveryRedirect));

    await waitFor(() => expect(mockReplaceWithBrowser).toHaveBeenCalledTimes(1));

    const destination = new URL(
      mockReplaceWithBrowser.mock.calls[0][0],
      window.location.origin
    );
    expect(destination.searchParams.get("next")).toBe("/reset-password");
    expect(destination.href).not.toContain("evil.example");
  });

  it("does not reroute incomplete recovery hashes", () => {
    window.history.replaceState(
      {},
      "",
      "/#access_token=test-token&type=recovery"
    );

    render(React.createElement(RecoveryRedirect));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
  });

  it("does not reroute recovery query links without a verifier", () => {
    window.history.replaceState({}, "", "/?type=recovery");

    render(React.createElement(RecoveryRedirect));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
  });

  it("does not reroute non-recovery auth hashes", () => {
    window.history.replaceState(
      {},
      "",
      "/#access_token=test-token&refresh_token=test-refresh&type=signup"
    );

    render(React.createElement(RecoveryRedirect));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
  });

  it("does not reroute when already on reset-password", () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#access_token=test-token&refresh_token=test-refresh&type=recovery"
    );

    render(React.createElement(RecoveryRedirect));

    expect(mockReplaceWithBrowser).not.toHaveBeenCalled();
  });
});
