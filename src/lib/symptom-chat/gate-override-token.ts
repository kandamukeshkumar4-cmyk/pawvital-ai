import { createHmac, timingSafeEqual } from "crypto";

/**
 * Server-bound image-gate override tokens.
 *
 * When the symptom-chat route returns an `image_gate` warning it issues a
 * short-lived HMAC token over the image hash. A client `gateOverride` is only
 * honored when it echoes a valid, unexpired token for the SAME image — so a
 * forged `gateOverride: true` can no longer bypass the quality/safety gate.
 *
 * Stateless (no storage). The dev fallback secret keeps demo mode working with
 * zero env config, matching the repo's demo-mode philosophy; production should
 * set IMAGE_GATE_OVERRIDE_SECRET (or reuse ASYNC_REVIEW_WEBHOOK_SECRET).
 */

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getSecret(): string {
  return (
    process.env.IMAGE_GATE_OVERRIDE_SECRET?.trim() ||
    process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
    "dev-only-gate-override-secret"
  );
}

export function issueGateOverrideToken(
  imageHash: string,
  now = Date.now()
): string {
  const expiresAt = now + TOKEN_TTL_MS;
  const sig = createHmac("sha256", getSecret())
    .update(`${imageHash}.${expiresAt}`)
    .digest("hex");
  return `${expiresAt}.${sig}`;
}

export function verifyGateOverrideToken(
  token: string | undefined,
  imageHash: string,
  now = Date.now()
): boolean {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAt) || now > expiresAt) return false;

  const expected = createHmac("sha256", getSecret())
    .update(`${imageHash}.${expiresAt}`)
    .digest();
  // Decode the given signature to bytes; invalid hex yields a shorter buffer
  // (Buffer.from stops at the first non-hex char) which the length guard below
  // rejects, so timingSafeEqual never sees mismatched lengths.
  const given = Buffer.from(token.slice(dot + 1), "hex");
  if (given.length !== expected.length) return false;

  return timingSafeEqual(given, expected);
}
