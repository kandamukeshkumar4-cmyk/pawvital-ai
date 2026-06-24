/**
 * redactSecrets — log-safety. A thrown error once leaked a full Supabase session
 * JWT into runtime logs; this proves token-shaped values are masked before any
 * log call, while normal diagnostic text is preserved.
 */
import { redactSecrets } from "@/lib/redact-secrets";

const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYiLCJ1c2VyIjoieCJ9.s5dPq3Ab_C9-deadbeefdeadbeef";

describe("redactSecrets", () => {
  it("masks a JWT embedded in an error message", () => {
    const err = new TypeError(
      `Cannot create property 'user' on string '${FAKE_JWT}'`,
    );
    const out = redactSecrets(err);
    expect(out).not.toContain(FAKE_JWT);
    expect(out).toContain("[REDACTED_JWT]");
    // Stack/message context is preserved (still useful for debugging).
    expect(out.toLowerCase()).toContain("cannot create property");
  });

  it("masks bearer tokens and secret key/value pairs", () => {
    expect(redactSecrets("Authorization: Bearer abcdef0123456789xyz")).toContain(
      "Bearer [REDACTED]",
    );
    const kv = redactSecrets('{"access_token":"abcdef0123456789","note":"ok"}');
    expect(kv).not.toContain("abcdef0123456789");
    expect(kv).toContain("[REDACTED]");
    expect(kv).toContain("ok"); // non-secret fields survive
  });

  it("leaves ordinary text untouched", () => {
    const msg = "Symptom chat error: timeout after 60 seconds";
    expect(redactSecrets(msg)).toBe(msg);
  });

  it("never throws on odd inputs", () => {
    expect(() => redactSecrets(null)).not.toThrow();
    expect(() => redactSecrets(undefined)).not.toThrow();
    expect(() => redactSecrets({ a: 1 })).not.toThrow();
  });
});
