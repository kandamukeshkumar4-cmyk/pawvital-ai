"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AzureSpeechInputState =
  | "disabled"
  | "error"
  | "idle"
  | "listening"
  | "starting";

export type AzureSpeechBrowserToken = {
  enabled: true;
  expiresInSeconds: number;
  region: string;
  token: string;
};

type SpeechConfigLike = {
  speechRecognitionLanguage?: string;
};

type AudioConfigLike = unknown;

type SpeechResultLike = {
  text?: string;
};

type SpeechRecognizerLike = {
  close(): void;
  recognizeOnceAsync(
    onSuccess: (result: SpeechResultLike) => void,
    onError: (error: string) => void
  ): void;
};

export type SpeechSdkLike = {
  AudioConfig: {
    fromDefaultMicrophoneInput(): AudioConfigLike;
  };
  SpeechConfig: {
    fromAuthorizationToken(token: string, region: string): SpeechConfigLike;
  };
  SpeechRecognizer: new (
    speechConfig: SpeechConfigLike,
    audioConfig: AudioConfigLike
  ) => SpeechRecognizerLike;
};

export type UseAzureSpeechInputOptions = {
  fetchToken?: () => Promise<AzureSpeechBrowserToken | null>;
  language?: string;
  loadSdk?: () => Promise<SpeechSdkLike>;
  onText(text: string): void;
};

function browserSupportsMicrophone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export async function requestAzureSpeechBrowserToken(): Promise<AzureSpeechBrowserToken | null> {
  try {
    const response = await fetch("/api/azure/speech-token", {
      method: "GET",
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<AzureSpeechBrowserToken> & {
      enabled?: boolean;
    };
    if (
      payload.enabled !== true ||
      typeof payload.token !== "string" ||
      typeof payload.region !== "string" ||
      typeof payload.expiresInSeconds !== "number"
    ) {
      return null;
    }

    return {
      enabled: true,
      expiresInSeconds: payload.expiresInSeconds,
      region: payload.region,
      token: payload.token,
    };
  } catch {
    return null;
  }
}

async function loadDefaultSpeechSdk(): Promise<SpeechSdkLike> {
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  return sdk as unknown as SpeechSdkLike;
}

function recognizeOnce(
  recognizer: SpeechRecognizerLike
): Promise<SpeechResultLike> {
  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(resolve, reject);
  });
}

export function useAzureSpeechInput({
  fetchToken = requestAzureSpeechBrowserToken,
  language = "en-US",
  loadSdk = loadDefaultSpeechSdk,
  onText,
}: UseAzureSpeechInputOptions) {
  const [state, setState] = useState<AzureSpeechInputState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const mountedRef = useRef(false);
  const onTextRef = useRef(onText);

  useEffect(() => {
    mountedRef.current = true;
    setIsSupported(browserSupportsMicrophone());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const start = useCallback(async () => {
    if (!mountedRef.current || !browserSupportsMicrophone()) {
      setState("disabled");
      return;
    }

    setError(null);
    setState("starting");

    let recognizer: SpeechRecognizerLike | null = null;
    try {
      const token = await fetchToken();
      if (!mountedRef.current) {
        return;
      }
      if (!token) {
        setState("disabled");
        return;
      }

      const sdk = await loadSdk();
      if (!mountedRef.current) {
        return;
      }
      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(
        token.token,
        token.region
      );
      speechConfig.speechRecognitionLanguage = language;

      recognizer = new sdk.SpeechRecognizer(
        speechConfig,
        sdk.AudioConfig.fromDefaultMicrophoneInput()
      );

      setState("listening");
      const result = await recognizeOnce(recognizer);
      if (!mountedRef.current) {
        return;
      }
      const transcript = result.text?.trim();
      if (transcript) {
        onTextRef.current(transcript);
      }
      setState("idle");
    } catch {
      if (mountedRef.current) {
        setError("Speech input failed");
        setState("error");
      }
    } finally {
      recognizer?.close();
    }
  }, [fetchToken, language, loadSdk]);

  return {
    error,
    isBusy: state === "starting" || state === "listening",
    isSupported,
    start,
    state,
  };
}
