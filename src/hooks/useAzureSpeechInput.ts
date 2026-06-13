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

type WebSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
  start(): void;
  stop(): void;
};

type WebSpeechWindow = Window & {
  SpeechRecognition?: new () => WebSpeechRecognition;
  webkitSpeechRecognition?: new () => WebSpeechRecognition;
};

function browserSupportsMicrophone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function browserSupportsWebSpeech(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const speechWindow = window as WebSpeechWindow;
  return Boolean(
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
  );
}

export function browserSupportsSpeechInput(): boolean {
  return browserSupportsMicrophone() || browserSupportsWebSpeech();
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

function recognizeWithWebSpeech(language: string): Promise<string> {
  const speechWindow = window as WebSpeechWindow;
  const SpeechRecognitionCtor =
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    return Promise.reject(new Error("Web Speech API unavailable"));
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = language;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  return new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        resolve(transcript);
        return;
      }
      reject(new Error("empty transcript"));
    };
    recognition.onerror = (event) => {
      reject(new Error(event.error || "speech_recognition_failed"));
    };
    recognition.start();
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
    setIsSupported(browserSupportsSpeechInput());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const start = useCallback(async () => {
    if (!mountedRef.current || !browserSupportsSpeechInput()) {
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

      if (token) {
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
        return;
      }

      if (browserSupportsWebSpeech()) {
        setState("listening");
        const transcript = await recognizeWithWebSpeech(language);
        if (!mountedRef.current) {
          return;
        }
        if (transcript) {
          onTextRef.current(transcript);
        }
        setState("idle");
        return;
      }

      setState("disabled");
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
