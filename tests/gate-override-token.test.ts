import {
  issueGateOverrideToken,
  verifyGateOverrideToken,
} from "@/lib/symptom-chat/gate-override-token";

const TTL_MS = 15 * 60 * 1000;
const HASH = "abc123imagehash";

describe("gate-override-token", () => {
  it("verifies a freshly issued token for the same image hash", () => {
    const token = issueGateOverrideToken(HASH);
    expect(verifyGateOverrideToken(token, HASH)).toBe(true);
  });

  it("rejects a missing or empty token", () => {
    expect(verifyGateOverrideToken(undefined, HASH)).toBe(false);
    expect(verifyGateOverrideToken("", HASH)).toBe(false);
  });

  it("rejects a token bound to a different image hash (binding holds)", () => {
    const token = issueGateOverrideToken(HASH);
    expect(verifyGateOverrideToken(token, "a-different-image-hash")).toBe(false);
  });

  it("rejects an expired token but accepts it just before expiry (TTL holds)", () => {
    const issuedAt = 1_700_000_000_000;
    const token = issueGateOverrideToken(HASH, issuedAt);
    expect(verifyGateOverrideToken(token, HASH, issuedAt + TTL_MS - 1)).toBe(
      true
    );
    expect(verifyGateOverrideToken(token, HASH, issuedAt + TTL_MS + 1)).toBe(
      false
    );
  });

  it("rejects a tampered signature (HMAC holds)", () => {
    const token = issueGateOverrideToken(HASH);
    const dot = token.indexOf(".");
    const tampered =
      token.slice(0, dot + 1) + "0".repeat(token.length - dot - 1);
    expect(verifyGateOverrideToken(tampered, HASH)).toBe(false);
  });

  it("rejects malformed / non-hex tokens without throwing", () => {
    expect(verifyGateOverrideToken("nodotseparator", HASH)).toBe(false);
    expect(verifyGateOverrideToken("123.deadbeef", HASH)).toBe(false);
    // 64 chars of invalid hex (same string length as a real sha256 sig) must
    // be rejected via the buffer-length guard, never throw inside timingSafeEqual.
    const future = 1_700_000_000_000 + TTL_MS;
    expect(
      verifyGateOverrideToken(`${future}.${"z".repeat(64)}`, HASH, 1_700_000_000_000)
    ).toBe(false);
  });
});
