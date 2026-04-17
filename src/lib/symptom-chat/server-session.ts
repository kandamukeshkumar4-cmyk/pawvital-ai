import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { serverEnv } from "@/lib/env";
import { createSession, type PetProfile, type TriageSession } from "@/lib/triage-engine";

export interface SymptomChatStoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SymptomChatStoredSession {
  session: TriageSession;
  pet: PetProfile;
  messages: SymptomChatStoredMessage[];
  createdAt: number;
  lastActiveAt: number;
}

type SessionStoreMode = "memory" | "upstash";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const SESSION_KEY_PREFIX = "symptom-chat:session:v1";
const FALLBACK_SESSION_SECRET = "development-symptom-chat-session-secret";

const redis =
  serverEnv.UPSTASH_REDIS_REST_URL &&
  serverEnv.UPSTASH_REDIS_REST_TOKEN &&
  serverEnv.UPSTASH_REDIS_REST_URL.startsWith("https://")
    ? new Redis({
        url: serverEnv.UPSTASH_REDIS_REST_URL,
        token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const memorySessions = new Map<string, SymptomChatStoredSession>();

function getStoreMode(): SessionStoreMode {
  return redis ? "upstash" : "memory";
}

function getSessionStoreSecret() {
  return (
    serverEnv.SYMPTOM_CHAT_SESSION_SECRET ||
    serverEnv.SUPABASE_SERVICE_ROLE_KEY ||
    FALLBACK_SESSION_SECRET
  );
}

function sessionKey(sessionId: string) {
  return `${SESSION_KEY_PREFIX}:${sessionId}`;
}

function buildSignature(sessionId: string) {
  return createHmac("sha256", getSessionStoreSecret())
    .update(sessionId)
    .digest("base64url");
}

function normalizeMessage(
  message: SymptomChatStoredMessage
): SymptomChatStoredMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const content = String(message.content || "").trim();
  if (!content) {
    return null;
  }

  return {
    role: message.role,
    content,
  };
}

function normalizeStoredSession(
  value: Partial<SymptomChatStoredSession> | null | undefined,
  petFallback?: PetProfile
): SymptomChatStoredSession | null {
  if (!value?.session || !value.pet) {
    return petFallback
      ? {
          session: createSession(),
          pet: petFallback,
          messages: [],
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        }
      : null;
  }

  return {
    session: value.session,
    pet: value.pet,
    messages: Array.isArray(value.messages)
      ? value.messages
          .map((message) => normalizeMessage(message))
          .filter(
            (message): message is SymptomChatStoredMessage => message !== null
          )
      : [],
    createdAt:
      typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    lastActiveAt:
      typeof value.lastActiveAt === "number" ? value.lastActiveAt : Date.now(),
  };
}

function readMemorySession(sessionId: string): SymptomChatStoredSession | null {
  const stored = memorySessions.get(sessionId);
  if (!stored) {
    return null;
  }

  if (Date.now() - stored.lastActiveAt > SESSION_TTL_MS) {
    memorySessions.delete(sessionId);
    return null;
  }

  return stored;
}

function writeMemorySession(
  sessionId: string,
  record: SymptomChatStoredSession
): SymptomChatStoredSession {
  const normalized = normalizeStoredSession(record);
  if (!normalized) {
    throw new Error("Cannot persist an empty symptom-chat session record");
  }

  memorySessions.set(sessionId, normalized);
  return normalized;
}

export function buildSymptomChatSessionHandle(sessionId: string) {
  return `v1.${sessionId}.${buildSignature(sessionId)}`;
}

export function verifySymptomChatSessionHandle(
  handle: string | null | undefined
): string | null {
  if (!handle) {
    return null;
  }

  const parts = handle.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }

  const [, sessionId, signature] = parts;
  if (!sessionId || !signature) {
    return null;
  }

  const expectedSignature = buildSignature(sessionId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer) ? sessionId : null;
}

export function isSymptomChatSessionStoreDistributed() {
  return getStoreMode() === "upstash";
}

export function getSymptomChatSessionStoreMode(): SessionStoreMode {
  return getStoreMode();
}

export async function createSymptomChatStoredSession(pet: PetProfile) {
  const sessionId = randomUUID();
  const now = Date.now();
  const record: SymptomChatStoredSession = {
    session: createSession(),
    pet,
    messages: [],
    createdAt: now,
    lastActiveAt: now,
  };

  await persistSymptomChatStoredSession(sessionId, record);

  return {
    sessionId,
    sessionHandle: buildSymptomChatSessionHandle(sessionId),
    record,
  };
}

export async function readSymptomChatStoredSession(
  sessionHandle: string | null | undefined
) {
  const sessionId = verifySymptomChatSessionHandle(sessionHandle);
  if (!sessionId) {
    return null;
  }

  if (redis) {
    try {
      const rawRecord = await redis.get<string | null>(sessionKey(sessionId));
      if (!rawRecord) {
        return null;
      }

      const parsed =
        typeof rawRecord === "string" ? JSON.parse(rawRecord) : rawRecord;
      const normalized = normalizeStoredSession(
        parsed as Partial<SymptomChatStoredSession>
      );
      if (!normalized) {
        return null;
      }

      return {
        sessionId,
        sessionHandle: buildSymptomChatSessionHandle(sessionId),
        record: normalized,
      };
    } catch (error) {
      console.warn(
        "[symptom-chat-session] Upstash read failed, falling back to memory:",
        error
      );
    }
  }

  const memoryRecord = readMemorySession(sessionId);
  if (!memoryRecord) {
    return null;
  }

  return {
    sessionId,
    sessionHandle: buildSymptomChatSessionHandle(sessionId),
    record: memoryRecord,
  };
}

export async function persistSymptomChatStoredSession(
  sessionId: string,
  record: SymptomChatStoredSession
) {
  const normalized = normalizeStoredSession({
    ...record,
    lastActiveAt: Date.now(),
  });
  if (!normalized) {
    throw new Error("Cannot persist an empty symptom-chat session record");
  }

  if (redis) {
    try {
      await redis.set(sessionKey(sessionId), JSON.stringify(normalized), {
        ex: SESSION_TTL_SECONDS,
      });
      return normalized;
    } catch (error) {
      console.warn(
        "[symptom-chat-session] Upstash write failed, falling back to memory:",
        error
      );
    }
  }

  return writeMemorySession(sessionId, normalized);
}

export async function deleteSymptomChatStoredSession(
  sessionHandle: string | null | undefined
) {
  const sessionId = verifySymptomChatSessionHandle(sessionHandle);
  if (!sessionId) {
    return;
  }

  memorySessions.delete(sessionId);

  if (!redis) {
    return;
  }

  try {
    await redis.del(sessionKey(sessionId));
  } catch (error) {
    console.warn("[symptom-chat-session] Upstash delete failed:", error);
  }
}
