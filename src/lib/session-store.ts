// =============================================================================
// SESSION STORE — In-memory triage session management
// Swap to Redis/Upstash for production. This is good enough for dev/demo.
// =============================================================================

import { type TriageSession, createSession } from "./triage-engine";
import { type PetProfile } from "./triage-engine";

interface StoredSession {
  triageSession: TriageSession;
  petProfile: PetProfile;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: number;
  lastActiveAt: number;
}

// In-memory store — sessions lost on server restart (fine for dev)
const sessions = new Map<string, StoredSession>();

// TTL: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getSession(sessionId: string): StoredSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check TTL
  if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

export function createOrGetSession(
  sessionId: string,
  petProfile: PetProfile
): StoredSession {
  const existing = getSession(sessionId);
  if (existing) {
    existing.lastActiveAt = Date.now();
    return existing;
  }

  const newSession: StoredSession = {
    triageSession: createSession(),
    petProfile,
    conversationHistory: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  sessions.set(sessionId, newSession);
  return newSession;
}

export function updateSession(
  sessionId: string,
  updates: Partial<Pick<StoredSession, "triageSession" | "conversationHistory">>
): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (updates.triageSession) {
    session.triageSession = updates.triageSession;
  }
  if (updates.conversationHistory) {
    session.conversationHistory = updates.conversationHistory;
  }
  session.lastActiveAt = Date.now();
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// Cleanup expired sessions periodically
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActiveAt > SESSION_TTL_MS) {
        sessions.delete(id);
      }
    }
  }, 60 * 60 * 1000); // Every hour

  if (
    typeof cleanupTimer === "object" &&
    cleanupTimer !== null &&
    "unref" in cleanupTimer &&
    typeof cleanupTimer.unref === "function"
  ) {
    cleanupTimer.unref();
  }
}
