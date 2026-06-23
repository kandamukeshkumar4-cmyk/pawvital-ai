"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
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
      {/* Soft pulse ring while listening — Apple-style, in the green brand. */}
      {isListening && (
        <span
          className="pointer-events-none absolute inset-0 animate-ping rounded-full"
          style={{ background: "rgba(11,122,77,0.18)" }}
          aria-hidden
        />
      )}
      <button
        aria-label={title}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 active:scale-90 disabled:opacity-40 ${
          isListening
            ? "bg-[#0b7a4d] text-white shadow-[0_2px_8px_rgba(11,122,77,0.35)]"
            : hasError
              ? "text-[#cf4338] hover:bg-[#fdecea]"
              : "text-[#8a8a8f] hover:bg-[#eef6f1] hover:text-[#0b7a4d]"
        }`}
        disabled={disabled || isBusy || isPermanentlyUnavailable}
        onClick={() => {
          void start();
        }}
        title={title}
        type="button"
      >
        {isBusy ? (
          <Loader2
            className={`h-[19px] w-[19px] animate-spin ${
              isListening ? "text-white" : "text-[#8a8a8f]"
            }`}
          />
        ) : hasError ? (
          <MicOff className="h-[19px] w-[19px]" strokeWidth={1.8} />
        ) : (
          <Mic className="h-[19px] w-[19px]" strokeWidth={1.8} />
        )}
      </button>
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
