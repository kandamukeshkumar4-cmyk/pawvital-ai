/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReadAloudButton } from "@/components/symptom-report/read-aloud-button";

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeech() {
  const speak = jest.fn();
  const cancel = jest.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak, cancel },
  });
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    FakeUtterance as unknown;
  return { speak, cancel };
}

function uninstallSpeech() {
  Reflect.deleteProperty(window, "speechSynthesis");
  Reflect.deleteProperty(
    window as unknown as Record<string, unknown>,
    "SpeechSynthesisUtterance"
  );
}

describe("ReadAloudButton", () => {
  afterEach(() => {
    uninstallSpeech();
    jest.clearAllMocks();
  });

  it("renders nothing when the browser has no speech synthesis", () => {
    uninstallSpeech();
    const { container } = render(
      React.createElement(ReadAloudButton, { text: "hello" })
    );
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing when there is no text to read", () => {
    installSpeech();
    const { container } = render(
      React.createElement(ReadAloudButton, { text: "   " })
    );
    expect(container.textContent).toBe("");
  });

  it("speaks on first tap and stops on second tap", () => {
    const { speak, cancel } = installSpeech();
    render(
      React.createElement(ReadAloudButton, {
        text: "Guidance: see a veterinarian within 24 hours.",
      })
    );

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(speak).toHaveBeenCalledTimes(1);
    const spoken = speak.mock.calls[0][0] as FakeUtterance;
    expect(spoken.text).toContain("see a veterinarian within 24 hours");
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button"));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe(
      "false"
    );
  });
});
