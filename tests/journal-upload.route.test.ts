const mockCreateServerSupabaseClient = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockUpload = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46,
  0x0c, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20,
  0x00, 0x00, 0x00, 0x00,
]);

async function postFile(file: File) {
  const formData = new FormData();
  formData.set("file", file);

  const { POST } = await import("@/app/api/journal/upload/route");
  return POST(
    new Request("http://localhost/api/journal/upload", {
      method: "POST",
      body: formData,
    })
  );
}

describe("journal upload route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("ip:test");
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      storage: {
        from: jest.fn().mockReturnValue({
          upload: mockUpload,
        }),
      },
    });
  });

  it.each([
    ["image/jpeg", "photo.jpg", JPEG_BYTES, "jpg"],
    ["image/png", "photo.png", PNG_BYTES, "png"],
    ["image/webp", "photo.webp", WEBP_BYTES, "webp"],
  ])(
    "accepts valid %s uploads and stores normalized metadata",
    async (type, name, bytes, extension) => {
      const response = await postFile(new File([bytes], name, { type }));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.path).toEqual(expect.stringMatching(/^user-1\//));
      expect(mockUpload).toHaveBeenCalledTimes(1);

      const [storedPath, storedBuffer, options] = mockUpload.mock.calls[0];
      expect(storedPath).toEqual(expect.stringContaining(`.${extension}`));
      expect(Buffer.isBuffer(storedBuffer)).toBe(true);
      expect(options).toEqual({
        contentType: type,
        upsert: false,
      });
    }
  );

  it("normalizes generic client mime types to the validated image type", async () => {
    const response = await postFile(
      new File([PNG_BYTES], "generic-upload.bin", {
        type: "application/octet-stream",
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      {
        contentType: "image/png",
        upsert: false,
      }
    );
  });

  it("rejects files whose bytes do not match the declared image type", async () => {
    const response = await postFile(
      new File([PNG_BYTES], "mismatch.jpg", { type: "image/jpeg" })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("do not match");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["text payload", new TextEncoder().encode("hello from a fake image"), "image/png"],
    [
      "executable payload",
      Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      "image/jpeg",
    ],
  ])("rejects disguised %s uploads", async (_label, bytes, type) => {
    const response = await postFile(new File([bytes], "spoofed.bin", { type }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("supported image file");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects png polyglot payloads with trailing content", async () => {
    const response = await postFile(
      new File(
        [PNG_BYTES, new TextEncoder().encode("<script>alert(1)</script>")],
        "polyglot.png",
        { type: "image/png" }
      )
    );

    expect(response.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects malformed image signatures that do not close cleanly", async () => {
    const response = await postFile(
      new File([JPEG_BYTES.slice(0, JPEG_BYTES.length - 2)], "truncated.jpg", {
        type: "image/jpeg",
      })
    );

    expect(response.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects files larger than the 5MB size cap", async () => {
    const largeBuffer = new Uint8Array(5 * 1024 * 1024 + 1);
    largeBuffer[0] = 0x89;
    largeBuffer[1] = 0x50;
    largeBuffer[2] = 0x4e;
    largeBuffer[3] = 0x47;

    const response = await postFile(
      new File([largeBuffer], "too-large.png", { type: "image/png" })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("5MB");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("does not leak storage configuration details on upload rejection", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockUpload.mockResolvedValueOnce({
      error: { message: "journal-photos bucket is misconfigured in us-east-1" },
    });

    const response = await postFile(
      new File([PNG_BYTES], "storage.png", { type: "image/png" })
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Upload failed" });
    expect(JSON.stringify(payload)).not.toContain("journal-photos");
    expect(JSON.stringify(payload)).not.toContain("us-east-1");

    consoleErrorSpy.mockRestore();
  });
});
