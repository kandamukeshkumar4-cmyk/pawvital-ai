describe("legacy triage proxy route", () => {
  it("returns 410 for GET requests", async () => {
    const { GET } = await import("@/app/api/triage/next/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload.code).toBe("LEGACY_TRIAGE_ENDPOINT_DISABLED");
  });

  it("returns 410 for POST requests", async () => {
    const { POST } = await import("@/app/api/triage/next/route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload.code).toBe("LEGACY_TRIAGE_ENDPOINT_DISABLED");
  });
});
