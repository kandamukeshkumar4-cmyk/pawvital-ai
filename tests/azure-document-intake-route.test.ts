import { NextResponse } from "next/server";

const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockIntakeVetRecordDocument = jest.fn();

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/azure/document-intelligence", () => ({
  intakeVetRecordDocument: (...args: unknown[]) =>
    mockIntakeVetRecordDocument(...args),
}));

function pdfFile(name = "vet-record.pdf") {
  return new File([Buffer.from("%PDF-1.7\n1 0 obj")], name, {
    type: "application/pdf",
  });
}

async function postFile(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const { POST } =
    await import("@/app/api/azure/documents/vet-record-intake/route");
  return POST(
    new Request("http://localhost/api/azure/documents/vet-record-intake", {
      body: formData,
      method: "POST",
    }),
  );
}

async function postFileWithPet(file: File, petId: string) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("pet_id", petId);
  const { POST } =
    await import("@/app/api/azure/documents/vet-record-intake/route");
  return POST(
    new Request("http://localhost/api/azure/documents/vet-record-intake", {
      body: formData,
      method: "POST",
    }),
  );
}

function petOwnershipChain(result: unknown) {
  const c: Record<string, unknown> = {
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    maybeSingle: jest.fn(async () => result),
  };
  return c;
}

const VET_PET_ID = "11111111-1111-4111-8111-111111111111";

describe("POST /api/azure/documents/vet-record-intake", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
    });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 30_000,
    });
    mockGetRateLimitId.mockReturnValue("user:user-1");
    mockIntakeVetRecordDocument.mockResolvedValue({
      contentLength: 42,
      contextText: "Vet record context from uploaded PDF",
      enabled: true,
      fields: [{ key: "ALT", value: "70" }],
      ok: true,
      pageCount: 1,
    });
  });

  it("requires an authenticated user", async () => {
    mockRequireAuthenticatedApiUser.mockResolvedValueOnce({
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });

    const response = await postFile(pdfFile());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication required");
    expect(mockIntakeVetRecordDocument).not.toHaveBeenCalled();
  });

  it("rate limits requests by authenticated user id", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      remaining: 0,
      reset: Date.now() + 10_000,
      success: false,
    });

    const response = await postFile(pdfFile());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain("Too many requests");
    expect(mockGetRateLimitId).toHaveBeenCalledWith(
      expect.any(Request),
      "user-1",
    );
    expect(mockIntakeVetRecordDocument).not.toHaveBeenCalled();
  });

  it("rejects unsupported files before calling Azure", async () => {
    const response = await postFile(
      new File([Buffer.from("not a pdf")], "record.pdf", {
        type: "application/pdf",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Unsupported file type");
    expect(mockIntakeVetRecordDocument).not.toHaveBeenCalled();
  });

  it("passes validated PDFs into the intake helper and returns context only", async () => {
    const response = await postFile(pdfFile("lab result.pdf"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({
      contentLength: 42,
      contextText: "Vet record context from uploaded PDF",
      enabled: true,
      fields: [{ key: "ALT", value: "70" }],
      pageCount: 1,
    });
    expect(mockIntakeVetRecordDocument).toHaveBeenCalledTimes(1);
    expect(mockIntakeVetRecordDocument.mock.calls[0][0]).toMatchObject({
      blobName: expect.stringMatching(
        /^vet-record-intake\/user-1\/\d+-[0-9a-f-]+-lab_result\.pdf$/,
      ),
      contentType: "application/pdf",
      fileName: "lab_result.pdf",
    });
    expect(
      Buffer.isBuffer(mockIntakeVetRecordDocument.mock.calls[0][0].body),
    ).toBe(true);
  });

  it("returns disabled when the feature flag is off", async () => {
    mockIntakeVetRecordDocument.mockResolvedValueOnce({
      enabled: false,
      reason: "feature_disabled",
    });

    const response = await postFile(pdfFile());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ enabled: false });
  });

  it("does not return extracted text when Content Safety blocks it", async () => {
    mockIntakeVetRecordDocument.mockResolvedValueOnce({
      categories: [{ category: "Violence", severity: 6 }],
      enabled: true,
      ok: false,
      pageCount: 1,
      reason: "content_safety_blocked",
    });

    const response = await postFile(pdfFile());
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      code: "DOCUMENT_CONTENT_BLOCKED",
      enabled: true,
      pageCount: 1,
    });
    expect(JSON.stringify(payload)).not.toContain("Violence");
  });

  it("(proof c) persists durable pet-scoped Dog Brain memory for an owned pet", async () => {
    const insertMock = jest.fn(async () => ({ error: null }));
    const petQuery = petOwnershipChain({ data: { id: VET_PET_ID }, error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((table: string) =>
          table === "pets" ? petQuery : { insert: insertMock },
        ),
      },
      user: { id: "user-1" },
    });

    const response = await postFileWithPet(pdfFile("labs.pdf"), VET_PET_ID);

    // Intake still returns the context (persistence is additive + best-effort)…
    expect(response.status).toBe(200);
    // …and the extracted summary is written as a durable, pet-scoped row.
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual({
      user_id: "user-1",
      pet_id: VET_PET_ID,
      file_name: "labs.pdf",
      context_text: "Vet record context from uploaded PDF",
      extracted_fields: [{ key: "ALT", value: "70" }],
      page_count: 1,
    });
  });

  it("(proof c) never persists a summary for a pet the user does not own", async () => {
    const insertMock = jest.fn(async () => ({ error: null }));
    const petQuery = petOwnershipChain({ data: null, error: null });
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {
        from: jest.fn((table: string) =>
          table === "pets" ? petQuery : { insert: insertMock },
        ),
      },
      user: { id: "user-1" },
    });

    const response = await postFileWithPet(pdfFile(), VET_PET_ID);

    expect(response.status).toBe(200);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
