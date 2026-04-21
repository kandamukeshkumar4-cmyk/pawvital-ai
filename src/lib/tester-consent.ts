export const TESTER_CONSENT_STORAGE_KEY = "pawvital_tester_acknowledgements";
export const TESTER_CONSENT_VERSION = "2026-04-private-tester-rc-v1";

export interface TesterConsentRecord {
  acceptedAt: string;
  subjectId: string;
  userId: string | null;
  version: string;
}

type StoredConsents = Record<string, TesterConsentRecord>;
type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem">;

function normalizeUserId(userId?: string | null): string | null {
  if (typeof userId !== "string") {
    return null;
  }

  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildSubjectId(userId?: string | null): string {
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId ? `user:${normalizedUserId}` : "anonymous";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStoredConsents(rawValue: string | null): StoredConsents {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed).filter(([, value]) => {
      if (!isRecord(value)) {
        return false;
      }

      return (
        typeof value.acceptedAt === "string" &&
        typeof value.subjectId === "string" &&
        typeof value.version === "string" &&
        (typeof value.userId === "string" || value.userId === null)
      );
    });

    return Object.fromEntries(entries) as StoredConsents;
  } catch {
    return {};
  }
}

export function requiresTesterConsent(pathname?: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return pathname === "/symptom-checker" || pathname.startsWith("/symptom-checker/");
}

export function getTesterConsent(
  userId?: string | null,
  storage: ReadStorage | null = getBrowserStorage()
): TesterConsentRecord | null {
  if (!storage) {
    return null;
  }

  const storedConsents = parseStoredConsents(
    storage.getItem(TESTER_CONSENT_STORAGE_KEY)
  );
  const record = storedConsents[buildSubjectId(userId)];

  if (!record) {
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

  const storedConsents = parseStoredConsents(
    storage.getItem(TESTER_CONSENT_STORAGE_KEY)
  );

  const record: TesterConsentRecord = {
    acceptedAt: now.toISOString(),
    subjectId: buildSubjectId(userId),
    userId: normalizeUserId(userId),
    version: TESTER_CONSENT_VERSION,
  };

  storedConsents[record.subjectId] = record;
  storage.setItem(TESTER_CONSENT_STORAGE_KEY, JSON.stringify(storedConsents));

  return record;
}
