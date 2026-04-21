function isTruthyEnvFlag(value: string | undefined) {
  return value === "true" || value === "1";
}

function readFlag(keys: string[], fallback = false) {
  for (const key of keys) {
    if (key in process.env) {
      return isTruthyEnvFlag(process.env[key]);
    }
  }

  return fallback;
}

function readCsv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  return [];
}

function buildConfigSummary() {
  const modeEnabled = readFlag(
    ["NEXT_PUBLIC_PRIVATE_TESTER_MODE", "PRIVATE_TESTER_MODE"],
    false
  );
  const inviteOnly = modeEnabled
    ? readFlag(
        ["NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY", "PRIVATE_TESTER_INVITE_ONLY"],
        true
      )
    : false;
  const freeAccess = modeEnabled
    ? readFlag(
        ["NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS", "PRIVATE_TESTER_FREE_ACCESS"],
        true
      )
    : false;
  const guestSymptomChecker = modeEnabled
    ? readFlag(
        [
          "NEXT_PUBLIC_PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER",
          "PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER",
        ],
        false
      )
    : false;

  return {
    allowedEmailCount: readCsv(["PRIVATE_TESTER_ALLOWED_EMAILS"]).length,
    blockedEmailCount: readCsv(["PRIVATE_TESTER_BLOCKED_EMAILS"]).length,
    freeAccess,
    guestSymptomChecker,
    inviteOnly,
    modeEnabled,
  };
}

console.log(JSON.stringify(buildConfigSummary(), null, 2));
