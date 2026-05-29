/** @jest-environment jsdom */

import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  requestAzureSpeechBrowserToken,
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

  it("disables itself without calling the SDK when no token is available", async () => {
    const { sdk } = makeSpeechSdk("ignored transcript");

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
      expect(screen.getByTestId("speech-state").textContent).toBe("disabled")
    );
    expect(sdk.SpeechRecognizer).not.toHaveBeenCalled();
    expect(screen.getByTestId("transcript").textContent).toBe("");
  });
});
