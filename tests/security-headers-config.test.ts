import nextConfig, {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "../next.config";

function getHeaderMap(nodeEnv: string) {
  return new Map(
    buildSecurityHeaders(nodeEnv).map(({ key, value }) => [key, value]),
  );
}

describe("security header config", () => {
  it("builds an explicit CSP for active tester-facing browser flows", () => {
    const directives = buildContentSecurityPolicy("production").split("; ");

    expect(directives).toEqual(
      expect.arrayContaining([
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https:",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https:",
        // connect-src allows the Azure Speech (STT) + Web PubSub WSS origins so the
        // symptom-checker microphone and live-update sockets work (see next.config.ts).
        "connect-src 'self' https: wss://centralus.stt.speech.microsoft.com wss://*.webpubsub.azure.com",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://checkout.stripe.com",
      ]),
    );
  });

  it("keeps unsafe-eval limited to local development", () => {
    expect(buildContentSecurityPolicy("development")).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("production")).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("includes the required browser hardening headers in production", () => {
    const headers = getHeaderMap("production");

    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    // microphone=(self) so the symptom-checker speech-to-text can request the mic
    // on our own origin (camera + geolocation stay fully disabled).
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=(self)",
    );
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("keeps HSTS out of non-production configs and applies headers app-wide", async () => {
    const nonProdHeaders = getHeaderMap("test");
    expect(nonProdHeaders.has("Strict-Transport-Security")).toBe(false);

    const routes = await nextConfig.headers?.();
    expect(routes).toHaveLength(1);
    const firstRoute = routes?.[0];
    expect(firstRoute?.source).toBe("/:path*");

    const routeHeaders = new Map(
      firstRoute?.headers.map(({ key, value }) => [key, value]) ?? [],
    );
    expect(routeHeaders.get("Content-Security-Policy")).toContain(
      "form-action 'self' https://checkout.stripe.com",
    );
    expect(routeHeaders.get("X-Frame-Options")).toBe("DENY");
  });
});
