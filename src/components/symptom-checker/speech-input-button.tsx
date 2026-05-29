"use client";

import { Loader2, Mic } from "lucide-react";
import Button from "@/components/ui/button";
import { useAzureSpeechInput } from "@/hooks/useAzureSpeechInput";

type SpeechInputButtonProps = {
  disabled?: boolean;
  onTranscript(text: string): void;
};

function titleForState(state: string, error: string | null): string {
  if (error) {
    return "Speech input unavailable";
  }
  if (state === "listening") {
    return "Listening";
  }
  if (state === "starting") {
    return "Starting speech input";
  }
  if (state === "disabled") {
    return "Speech input disabled";
  }
  return "Dictate symptom text";
}

export function SpeechInputButton({
  disabled = false,
  onTranscript,
}: SpeechInputButtonProps) {
  const { error, isBusy, isSupported, start, state } = useAzureSpeechInput({
    onText: onTranscript,
  });

  if (!isSupported) {
    return null;
  }

  const isUnavailable = state === "disabled";
  const title = titleForState(state, error);

  return (
    <Button
      aria-label={title}
      className="shrink-0 px-3"
      disabled={disabled || isBusy || isUnavailable}
      onClick={() => {
        void start();
      }}
      title={title}
      type="button"
      variant="outline"
    >
      {isBusy ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      ) : (
        <Mic className="w-5 h-5 text-gray-500" />
      )}
    </Button>
  );
}
