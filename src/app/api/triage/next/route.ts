// =============================================================================
// TRIAGE ORCHESTRATOR — Proxies to the main symptom-chat NVIDIA NIM pipeline
//
// This route accepts the legacy sessionId/userMessage/petProfile format
// and translates it to the symptom-chat engine format.
// =============================================================================

import { NextResponse } from "next/server";
import { createOrGetSession, updateSession } from "@/lib/session-store";
import type { PetProfile } from "@/lib/triage-engine";

interface RequestBody {
  sessionId: string;
  userMessage: string;
  petProfile: PetProfile;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const { sessionId, userMessage, petProfile } = body;

    if (!sessionId || !userMessage || !petProfile) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, userMessage, petProfile" },
        { status: 400 }
      );
    }

    // Load or create session from the store
    const stored = createOrGetSession(sessionId, petProfile);
    const { conversationHistory } = stored;

    // Build messages array for the main symptom-chat engine
    const messages = [
      ...conversationHistory,
      { role: "user" as const, content: userMessage },
    ];

    // Call the main symptom-chat engine internally
    const origin = request.headers.get("origin") || request.headers.get("host") || "localhost:3000";
    const protocol = origin.startsWith("localhost") || origin.startsWith("127.") ? "http" : "https";
    const baseUrl = origin.includes("://") ? origin : `${protocol}://${origin}`;

    const chatResponse = await fetch(`${baseUrl}/api/ai/symptom-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        pet: petProfile,
        action: "chat",
        session: stored.triageSession,
      }),
    });

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
      return NextResponse.json({
        type: "EMERGENCY",
        message: chatResult.message,
        urgency: "ER_NOW",
        red_flags: chatResult.session?.red_flags_triggered || [],
      });
    }

    if (chatResult.type === "ready" || chatResult.ready_for_report) {
      return NextResponse.json({
        type: "READY_FOR_DIAGNOSIS",
        message: chatResult.message,
        symptoms_identified: chatResult.session?.known_symptoms || [],
        questions_asked: chatResult.session?.answered_questions?.length || 0,
        ready_for_report: true,
      });
    }

    return NextResponse.json({
      type: "QUESTION",
      message: chatResult.message,
      symptoms_identified: chatResult.session?.known_symptoms || [],
      questions_asked: chatResult.session?.answered_questions?.length || 0,
      ready_for_report: chatResult.ready_for_report || false,
    });
  } catch (error) {
    console.error("Triage orchestrator error:", error);
    return NextResponse.json(
      {
        type: "ERROR",
        message:
          "An error occurred during the triage process. Please try again, or contact your veterinarian directly if this is urgent.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}
