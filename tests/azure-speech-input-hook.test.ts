/** @jest-environment jsdom */

import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  classifySpeechError,
  requestAzureSpeechBrowserToken,
  speechErrorMessage,
  useAzureSpeechInput,
  type AzureSpeechBrowserToken,
  type SpeechSdkLike,
} from "@/hooks/useAzureSpeechInput";

const TOKEN: AzureSpeechBrowserToken = {
  enabled: true,
  expiresInSeconds: 540,
  region: "centralus",
  token: "browser-token",
};

function enableMicrophoneSupport() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: jest.fn(),
    },
  });
}

function makeSpeechSdk(transcript: string) {
  const close = jest.fn();
  const recognizeOnceAsync = jest.fn(
    (onSuccess: (result: { text: string }) => void) => {
      onSuccess({ text: transcript });
    }
  );
  const sdk: SpeechSdkLike = {
    AudioConfig: {
      fromDefaultMicrophoneInput: jest.fn(() => ({})),
    },
    SpeechConfig: {
      fromAuthorizationToken: jest.fn(() => ({})),
    },
    SpeechRecognizer: jest.fn(() => ({
      close,
      recognizeOnceAsync,
    })),
  };
  return { close, recognizeOnceAsync, sdk };
}

function SpeechHarness({
  fetchToken,
  loadSdk,
}: {
  fetchToken: () => Promise<AzureSpeechBrowserToken | null>;
  loadSdk: () => Promise<SpeechSdkLike>;
}) {
  const [transcript, setTranscript] = useState("");
  const speech = useAzureSpeechInput({
    fetchToken,
    loadSdk,
    onText: setTranscript,
  });

  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      {
        disabled: !speech.isSupported,
        onClick: () => void speech.start(),
      },
      "start"
    ),
    React.createElement(
      "span",
      { "data-testid": "speech-state" },
      speech.state
    ),
    React.createElement(
      "span",
      { "data-testid": "speech-error" },
      speech.error ?? ""
    ),
    React.createElement(
      "span",
      { "data-testid": "speech-error-reason" },
      speech.errorReason ?? ""
    ),
    React.createElement("span", { "data-testid": "transcript" }, transcript)
  );
}

describe("useAzureSpeechInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableMicrophoneSupport();
  });

  it("returns null when the speech token route is disabled", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: false }),
    })) as jest.Mock;

    await expect(requestAzureSpeechBrowserToken()).resolves.toBeNull();
  });

  it("recognizes one utterance with an injected Speech SDK", async () => {
    const { close, recognizeOnceAsync, sdk } = makeSpeechSdk("Rex is limping");

    render(
      React.createElement(SpeechHarness, {
        fetchToken: async () => TOKEN,
        loadSdk: async () => sdk,
      })
    );

    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() =>
      expect(screen.getByTestId("transcript").textContent).toBe("Rex is limping")
    );
    expect(sdk.SpeechConfig.fromAuthorizationToken).toHaveBeenCalledWith(
      "browser-token",
      "centralus"
    );
    expect(recognizeOnceAsync).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(screen.getByTestId("speech-state").textContent).toBe("idle");
  });

  it("falls back to browser speech when Azure token is unavailable", async () => {
    const { sdk } = makeSpeechSdk("ignored transcript");
    const start = jest.fn();
    const stop = jest.fn();
    const SpeechRecognitionMock = jest.fn(() => ({
      continuous: false,
      interimResults: false,
      lang: "en-US",
      maxAlternatives: 1,
      onerror: null,
      onresult: null,
      start,
      stop,
    }));

    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: SpeechRecognitionMock,
    });

    render(
      React.createElement(SpeechHarness, {
        fetchToken: async () => null,
        loadSdk: async () => sdk,
      })
    );

    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() => expect(start).toHaveBeenCalled());
    const recognition = SpeechRecognitionMock.mock.results[0]?.value;
    recognition.onresult({
      results: { 0: { 0: { transcript: "my dog is limping" } } },
    });

    await waitFor(() =>
      expect(screen.getByTestId("transcript").textContent).toBe(
        "my dog is limping"
      )
    );
    expect(sdk.SpeechRecognizer).not.toHaveBeenCalled();
    expect(screen.getByTestId("speech-state").textContent).toBe("idle");
  });

  it("surfaces a permission-denied reason when the mic is blocked", async () => {
    const { sdk } = makeSpeechSdk("ignored");
    const SpeechRecognitionMock = jest.fn(() => ({
      continuous: false,
      interimResults: false,
      lang: "en-US",
      maxAlternatives: 1,
      onerror: null,
      onresult: null,
      start: jest.fn(),
      stop: jest.fn(),
    }));
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: SpeechRecognitionMock,
    });

    render(
      React.createElement(SpeechHarness, {
        fetchToken: async () => null,
        loadSdk: async () => sdk,
      })
    );

    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    const recognition = await waitFor(() => {
      const value = SpeechRecognitionMock.mock.results[0]?.value;
      expect(value).toBeTruthy();
      return value;
    });
    recognition.onerror({ error: "not-allowed" });

    await waitFor(() =>
      expect(screen.getByTestId("speech-error-reason").textContent).toBe(
        "permission_denied"
      )
    );
    expect(screen.getByTestId("speech-state").textContent).toBe("error");
    expect(screen.getByTestId("speech-error").textContent).toContain(
      "Microphone access was blocked"
    );
  });

  it("reports an unsupported reason when no recognition path exists", async () => {
    const { sdk } = makeSpeechSdk("ignored");
    // Microphone is present (button renders) but no Web Speech API and no Azure
    // token — the user should learn why instead of facing a dead button.
    Reflect.deleteProperty(window, "SpeechRecognition");
    Reflect.deleteProperty(window, "webkitSpeechRecognition");

    render(
      React.createElement(SpeechHarness, {
        fetchToken: async () => null,
        loadSdk: async () => sdk,
      })
    );

    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() =>
      expect(screen.getByTestId("speech-error-reason").textContent).toBe(
        "unsupported"
      )
    );
  });
});

describe("classifySpeechError", () => {
  it("maps known Web Speech error codes to actionable reasons", () => {
    expect(classifySpeechError(new Error("not-allowed"))).toBe(
      "permission_denied"
    );
    expect(classifySpeechError("service-not-allowed")).toBe(
      "permission_denied"
    );
    expect(classifySpeechError(new Error("no-speech"))).toBe("no_speech");
    expect(classifySpeechError("audio-capture")).toBe("no_microphone");
    expect(classifySpeechError(new Error("network"))).toBe("network");
    expect(classifySpeechError("Web Speech API unavailable")).toBe(
      "unsupported"
    );
  });

  it("falls back to a retryable failure for unknown codes", () => {
    expect(classifySpeechError(new Error("weird-glitch"))).toBe("failed");
    expect(classifySpeechError(null)).toBe("failed");
  });

  it("provides a non-empty owner-facing message for every reason", () => {
    for (const reason of [
      "permission_denied",
      "no_speech",
      "no_microphone",
      "unsupported",
      "network",
      "failed",
    ] as const) {
      expect(speechErrorMessage(reason).length).toBeGreaterThan(0);
    }
  });
});
