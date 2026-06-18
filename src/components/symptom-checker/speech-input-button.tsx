"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
import Button from "@/components/ui/button";
import { useAzureSpeechInput } from "@/hooks/useAzureSpeechInput";

type SpeechInputButtonProps = {
  disabled?: boolean;
  onTranscript(text: string): void;
};

function titleForState(state: string, error: string | null): string {
  if (error) {
    return error;
  }
  if (state === "listening") {
    return "Listening — speak now";
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
  const { error, errorReason, isBusy, isSupported, start, state } =
    useAzureSpeechInput({
      onText: onTranscript,
    });

  if (!isSupported) {
    return null;
  }

  const hasError = Boolean(error);
  // "unsupported" means this browser can never recognize speech here — keep the
  // button visible (so the user understands why) but disabled. Every other
  // error is transient, so the mic stays tappable for an immediate retry.
  const isPermanentlyUnavailable = errorReason === "unsupported";
  const title = titleForState(state, error);
  const isListening = state === "listening";

  return (
    <div className="relative shrink-0">
      <Button
        aria-label={title}
        className={`px-3 ${
          isListening
            ? "border-purple-400 bg-purple-100 text-purple-700"
            : hasError
              ? "border-red-300 text-red-600"
              : ""
        }`}
        disabled={disabled || isBusy || isPermanentlyUnavailable}
        onClick={() => {
          void start();
        }}
        title={title}
        type="button"
        variant="outline"
      >
        {isBusy ? (
          <Loader2
            className={`w-5 h-5 animate-spin ${
              isListening ? "text-purple-600" : "text-gray-500"
            }`}
          />
        ) : hasError ? (
          <MicOff className="w-5 h-5 text-red-500" />
        ) : (
          <Mic className="w-5 h-5 text-gray-500" />
        )}
      </Button>
      {/* Accessible status for screen readers — announces listening + errors. */}
      <span className="sr-only" aria-live="polite">
        {isListening ? "Listening, speak now." : error ?? ""}
      </span>
      {hasError && (
        <p
          role="status"
          className="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs leading-snug text-red-600 shadow-md"
        >
          {error}
        </p>
      )}
    </div>
  );
}
