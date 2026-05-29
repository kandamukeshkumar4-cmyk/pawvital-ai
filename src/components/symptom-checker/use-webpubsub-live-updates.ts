"use client";

import { useEffect } from "react";
import type { TriageLiveUpdate } from "@/lib/azure/web-pubsub";

type NegotiationResponse =
  | {
      enabled: true;
      sessionId: string;
      url: string;
    }
  | {
      enabled: false;
      reason?: string;
    };

export type TriageLiveUpdateConnectionState =
  | "disabled"
  | "connected"
  | "connecting"
  | "fallback";

export type UseWebPubSubLiveUpdatesOptions = {
  enabled: boolean;
  onConnectionState?: (state: TriageLiveUpdateConnectionState) => void;
  onUpdate: (update: TriageLiveUpdate) => void;
  sessionId: string;
};

const TRIAGE_LIVE_UPDATE_KEYS = new Set([
  "action",
  "generatedAt",
  "sessionId",
  "status",
  "type",
]);

function isTriageLiveUpdate(value: unknown): value is TriageLiveUpdate {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Object.keys(value).some((key) => !TRIAGE_LIVE_UPDATE_KEYS.has(key))) {
    return false;
  }

  const update = value as Partial<TriageLiveUpdate>;
  return (
    update.type === "triage_update" &&
    typeof update.sessionId === "string" &&
    typeof update.generatedAt === "string" &&
    (update.action === "chat" || update.action === "generate_report") &&
    (update.status === "processing" ||
      update.status === "response_ready" ||
      update.status === "report_ready" ||
      update.status === "failed")
  );
}

function isSuccessfulNegotiation(
  value: NegotiationResponse,
  sessionId: string,
): value is Extract<NegotiationResponse, { enabled: true }> {
  return (
    value.enabled === true &&
    value.sessionId === sessionId &&
    typeof value.url === "string" &&
    value.url.startsWith("wss://")
  );
}

export function parseTriageLiveUpdate(data: unknown): TriageLiveUpdate | null {
  const parsed =
    typeof data === "string"
      ? (() => {
          try {
            return JSON.parse(data) as unknown;
          } catch {
            return null;
          }
        })()
      : data;

  return isTriageLiveUpdate(parsed) ? parsed : null;
}

export function useWebPubSubLiveUpdates({
  enabled,
  onConnectionState,
  onUpdate,
  sessionId,
}: UseWebPubSubLiveUpdatesOptions) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("WebSocket" in window)) {
      onConnectionState?.("disabled");
      return undefined;
    }

    const controller = new AbortController();
    let socket: WebSocket | null = null;
    let closed = false;

    onConnectionState?.("connecting");

    async function connect() {
      try {
        const response = await fetch(
          `/api/azure/webpubsub/negotiate?sessionId=${encodeURIComponent(
            sessionId,
          )}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          onConnectionState?.("fallback");
          return;
        }

        const body = (await response.json()) as NegotiationResponse;
        if (!body.enabled) {
          onConnectionState?.("disabled");
          return;
        }

        if (!isSuccessfulNegotiation(body, sessionId)) {
          onConnectionState?.("fallback");
          return;
        }

        socket = new WebSocket(body.url);
        socket.onopen = () => onConnectionState?.("connected");
        socket.onerror = () => onConnectionState?.("fallback");
        socket.onclose = () => {
          if (!closed) {
            onConnectionState?.("fallback");
          }
        };
        socket.onmessage = (event) => {
          const update = parseTriageLiveUpdate(event.data);
          if (update?.sessionId === sessionId) {
            onUpdate(update);
          }
        };
      } catch {
        if (!controller.signal.aborted) {
          onConnectionState?.("fallback");
        }
      }
    }

    void connect();

    return () => {
      closed = true;
      controller.abort();
      socket?.close();
    };
  }, [enabled, onConnectionState, onUpdate, sessionId]);
}
