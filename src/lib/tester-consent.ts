export const TESTER_CONSENT_STORAGE_KEY = "pawvital_tester_acknowledgements";
export const TESTER_CONSENT_VERSION = "2026-04-private-tester-rc-v1";

export interface TesterConsentRecord {
  acceptedAt: string;
  subjectId: string;
  userId: string | null;
  version: string;
}

type StoredConsents = Record<string, unknown>;
type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem">;

function normalizeUserId(userId?: string | null): string | null {
  if (typeof userId !== "string") {
    return null;
  }

  const trimmedUserId = userId.trim();
  return trimmedUserId ? trimmedUserId : null;
}

function buildSubjectId(userId?: string | null): string {
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId ? `user:${normalizedUserId}` : "anonymous";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTesterConsentRecord(value: unknown): value is TesterConsentRecord {
  return (
    isObject(value) &&
    typeof value.acceptedAt === "string" &&
    typeof value.subjectId === "string" &&
    typeof value.version === "string" &&
    (typeof value.userId === "string" || value.userId === null)
  );
}

function getBrowserStorage(): WriteStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredConsents(storage: ReadStorage): StoredConsents {
  try {
    const parsed = JSON.parse(
      storage.getItem(TESTER_CONSENT_STORAGE_KEY) ?? "{}"
    ) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getTesterConsent(
  userId?: string | null,
  storage: ReadStorage | null = getBrowserStorage()
): TesterConsentRecord | null {
  if (!storage) {
    return null;
  }

  const record = readStoredConsents(storage)[buildSubjectId(userId)];
  if (!isTesterConsentRecord(record)) {
    return null;
  }

  return record.version === TESTER_CONSENT_VERSION ? record : null;
}

export function hasTesterConsent(
  userId?: string | null,
  storage: ReadStorage | null = getBrowserStorage()
): boolean {
  return getTesterConsent(userId, storage) !== null;
}

export function recordTesterConsent(
  userId?: string | null,
  storage: WriteStorage | null = getBrowserStorage(),
  now: Date = new Date()
): TesterConsentRecord | null {
  if (!storage) {
    return null;
  }

  const record: TesterConsentRecord = {
    acceptedAt: now.toISOString(),
    subjectId: buildSubjectId(userId),
    userId: normalizeUserId(userId),
    version: TESTER_CONSENT_VERSION,
  };

  const storedConsents = readStoredConsents(storage);
  storedConsents[record.subjectId] = record;
  storage.setItem(TESTER_CONSENT_STORAGE_KEY, JSON.stringify(storedConsents));

  return record;
}
