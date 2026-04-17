// =============================================================================
// TRIAGE ORCHESTRATOR — Proxies to the main symptom-chat NVIDIA NIM pipeline
//
// This route accepts the legacy sessionId/userMessage/petProfile format
// and translates it to the symptom-chat engine format.
// =============================================================================

import { z } from "zod";
import { createOrGetSession, updateSession } from "@/lib/session-store";
import type { PetProfile } from "@/lib/triage-engine";
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api-route";

const RequestBodySchema = z.object({
  sessionId: z.string().trim().min(8).max(128),
  userMessage: z.string().trim().min(1).max(4000),
  petProfile: z.custom<PetProfile>(
    (value) => typeof value === "object" && value !== null,
    "petProfile is required"
  ),
});

export async function POST(request: Request) {
  const trustedOriginError = enforceTrustedOrigin(request);
  if (trustedOriginError) {
    return trustedOriginError;
  }

  const rateLimitError = await enforceRateLimit(request);
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const parsedBody = await parseJsonBody(request, RequestBodySchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const { sessionId, userMessage, petProfile } = parsedBody.data;

    // Load or create session from the store
    const stored = createOrGetSession(sessionId, petProfile);
    const { conversationHistory } = stored;

    // Build messages array for the main symptom-chat engine
    const messages = [
      ...conversationHistory,
      { role: "user" as const, content: userMessage },
    ];

    // Call the main symptom-chat engine internally
    const chatResponse = await fetch(new URL("/api/ai/symptom-chat", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-symptom-chat-internal": "1",
      },
      body: JSON.stringify({
        messages,
        pet: petProfile,
        action: "chat",
        session: stored.triageSession,
      }),
    });

    if (!chatResponse.ok) {
      return jsonError("Unable to reach the triage engine", 502, "TRIAGE_UPSTREAM_FAILED");
    }

    const chatResult = await chatResponse.json();

    // Update stored session with the result
    conversationHistory.push({ role: "user", content: userMessage });
    if (chatResult.message) {
      conversationHistory.push({ role: "assistant", content: chatResult.message });
    }
    if (chatResult.session) {
      updateSession(sessionId, {
        triageSession: chatResult.session,
        conversationHistory,
      });
    }

    // Translate response format for legacy clients
    if (chatResult.type === "emergency") {
      return jsonOk({
        type: "EMERGENCY",
        message: chatResult.message,
        urgency: "ER_NOW",
        red_flags: chatResult.session?.red_flags_triggered || [],
      });
    }

    if (chatResult.type === "ready" || chatResult.ready_for_report) {
      return jsonOk({
        type: "READY_FOR_DIAGNOSIS",
        message: chatResult.message,
        symptoms_identified: chatResult.session?.known_symptoms || [],
        questions_asked: chatResult.session?.answered_questions?.length || 0,
        ready_for_report: true,
      });
    }

    return jsonOk({
      type: "QUESTION",
      message: chatResult.message,
      symptoms_identified: chatResult.session?.known_symptoms || [],
      questions_asked: chatResult.session?.answered_questions?.length || 0,
      ready_for_report: chatResult.ready_for_report || false,
    });
  } catch (error) {
    console.error("Triage orchestrator error:", error);
    return jsonOk(
      {
        type: "ERROR",
        message:
          "An error occurred during the triage process. Please try again, or contact your veterinarian directly if this is urgent.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
