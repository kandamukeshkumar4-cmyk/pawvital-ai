/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VetRecordIntakeButton } from "@/components/symptom-checker/vet-record-intake-button";

describe("VetRecordIntakeButton", () => {
  const originalFetch = global.fetch;
  const originalWindowFetch = window.fetch;
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.fetch = originalWindowFetch;
    window.alert = originalAlert;
  });

  function installFetch(response: unknown) {
    const mockFetch = jest.fn(async () => ({
      json: jest.fn(async () => response),
    }));
    global.fetch = mockFetch as jest.MockedFunction<typeof fetch>;
    window.fetch = mockFetch as jest.MockedFunction<typeof fetch>;
    return mockFetch;
  }

  it("uploads a selected PDF and appends extracted context", async () => {
    const onContext = jest.fn();
    const mockFetch = installFetch({
      contextText: "Vet record context from uploaded PDF",
      enabled: true,
    });

    const { container } = render(
      React.createElement(VetRecordIntakeButton, { onContext }),
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          new File([Buffer.from("%PDF-1.7")], "record.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onContext).toHaveBeenCalledWith(
        "Vet record context from uploaded PDF",
      ),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/azure/documents/vet-record-intake",
      expect.objectContaining({
        body: expect.any(FormData),
        method: "POST",
      }),
    );
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("disables itself after Azure reports the feature disabled", async () => {
    installFetch({ enabled: false });

    const { container } = render(
      React.createElement(VetRecordIntakeButton, { onContext: jest.fn() }),
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [
          new File([Buffer.from("%PDF-1.7")], "record.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Attach vet record",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(window.alert).toHaveBeenCalledWith(
      "Vet record intake is unavailable right now.",
    );
  });
});
