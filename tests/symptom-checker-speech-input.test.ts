/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

const mockUseAzureSpeechInput = jest.fn();

jest.mock("@/hooks/useAzureSpeechInput", () => ({
  useAzureSpeechInput: (...args: unknown[]) => mockUseAzureSpeechInput(...args),
}));

import { SpeechInputButton } from "@/components/symptom-checker/speech-input-button";

describe("SpeechInputButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render when browser microphone support is absent", () => {
    mockUseAzureSpeechInput.mockReturnValue({
      error: null,
      isBusy: false,
      isSupported: false,
      start: jest.fn(),
      state: "idle",
    });

    const { container } = render(
      React.createElement(SpeechInputButton, { onTranscript: jest.fn() })
    );

    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("starts speech recognition from the mic button", () => {
    const start = jest.fn();
    const onTranscript = jest.fn();
    mockUseAzureSpeechInput.mockReturnValue({
      error: null,
      isBusy: false,
      isSupported: true,
      start,
      state: "idle",
    });

    render(React.createElement(SpeechInputButton, { onTranscript }));

    fireEvent.click(screen.getByRole("button", { name: "Dictate symptom text" }));

    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
    expect(mockUseAzureSpeechInput).toHaveBeenCalledWith({
      onText: onTranscript,
    });
  });

  it("disables the button while recognition is starting", () => {
    mockUseAzureSpeechInput.mockReturnValue({
      error: null,
      isBusy: true,
      isSupported: true,
      start: jest.fn(),
      state: "starting",
    });

    render(
      React.createElement(SpeechInputButton, { onTranscript: jest.fn() })
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Starting speech input",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});
