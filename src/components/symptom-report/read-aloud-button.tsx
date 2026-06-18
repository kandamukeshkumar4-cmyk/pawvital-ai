"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Volume2, Square } from "lucide-react";
import Button from "@/components/ui/button";

function noopSubscribe(): () => void {
  return () => {};
}

type ReadAloudButtonProps = {
  /** Plain-text summary to speak. Empty string renders nothing. */
  text: string;
  className?: string;
};

function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/**
 * Reads a short report summary aloud using the browser's built-in
 * speechSynthesis — zero credentials, no network, works offline. Renders
 * nothing when the browser lacks speech synthesis. Toggles play/stop and
 * always cancels any in-flight speech on unmount so navigating away can't
 * leave the page talking.
 */
export function ReadAloudButton({ text, className = "" }: ReadAloudButtonProps) {
  // Client-only capability check via useSyncExternalStore: renders false on the
  // server (no speech there) and the real value after hydration, without the
  // set-state-in-effect anti-pattern.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => speechSupported(),
    () => false
  );
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Cancel any in-flight speech when the report unmounts so navigating away
    // can't leave the page talking.
    return () => {
      if (speechSupported()) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (speechSupported()) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const start = useCallback(() => {
    if (!speechSupported() || !text.trim()) {
      return;
    }
    // Cancel anything already queued so repeated taps don't stack utterances.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [text]);

  if (!supported || !text.trim()) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={speaking ? "Stop reading the summary" : "Read the summary aloud"}
      aria-pressed={speaking}
      className={`w-full justify-center gap-1.5 sm:w-auto ${className}`}
      onClick={() => (speaking ? stop() : start())}
      title={speaking ? "Stop reading" : "Read summary aloud"}
    >
      {speaking ? (
        <Square className="w-4 h-4" />
      ) : (
        <Volume2 className="w-4 h-4" />
      )}
      <span>{speaking ? "Stop" : "Listen"}</span>
    </Button>
  );
}
