/**
 * Route-level tests for POST /api/health-log/upload — the real photo upload.
 * Auth + validation + owner-scoped storage path, with Supabase, rate-limit, and
 * the shared image validator mocked.
 */

import { jest } from "@jest/globals";

const mockCheckRateLimit = jest.fn<() => Promise<{ success: boolean; reset: number }>>();
const mockCreateServerSupabaseClient = jest.fn<() => Promise<unknown>>();
const mockValidate =
  jest.fn<() => Promise<{ ok: boolean; reason?: string; buffer?: Buffer; detectedType?: string; extension?: string }>>();

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: () => mockCheckRateLimit(),
  getRateLimitId: () => "test:rate-id",
}));
jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));
jest.mock("@/app/api/journal/upload/validation", () => ({
  MAX_JOURNAL_UPLOAD_BYTES: 5 * 1024 * 1024,
  validateJournalUploadFile: () => mockValidate(),
}));

function buildSupabase(userId: string | null, uploadError: unknown = null) {
  const uploadCalls: { bucket: string; path: string }[] = [];
  let lastBucket = "";
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => {
        lastBucket = bucket;
        return {
          upload: async (path: string) => {
            uploadCalls.push({ bucket: lastBucket, path });
            return { error: uploadError };
          },
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://signed.example/${path}` },
            error: null,
          }),
        };
      },
    },
  };
  return { supabase, uploadCalls };
}

function uploadRequest(withFile: boolean): Request {
  const fd = new FormData();
  if (withFile) {
    fd.append("file", new File([new Uint8Array([1, 2, 3])], "stool.jpg", { type: "image/jpeg" }));
  }
  return new Request("http://localhost/api/health-log/upload", { method: "POST", body: fd });
}

async function callPost(withFile = true) {
  const { POST } = await import("@/app/api/health-log/upload/route");
  return POST(uploadRequest(withFile));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
  mockValidate.mockResolvedValue({
    ok: true,
    buffer: Buffer.from([1, 2, 3]),
    detectedType: "image/jpeg",
    extension: "jpg",
  });
});

describe("POST /api/health-log/upload", () => {
  it("401 when unauthenticated", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(buildSupabase(null).supabase);
    const res = await callPost();
    expect(res.status).toBe(401);
  });

  it("400 when no file is provided", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(buildSupabase("user-1").supabase);
    const res = await callPost(false);
    expect(res.status).toBe(400);
  });

  it("400 on validation failure (e.g. too large)", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(buildSupabase("user-1").supabase);
    mockValidate.mockResolvedValue({ ok: false, reason: "file-too-large" });
    const res = await callPost();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.toLowerCase()).toContain("too large");
  });

  it("uploads to the journal-photos bucket under the user's id and returns the path", async () => {
    const { supabase, uploadCalls } = buildSupabase("user-1");
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const res = await callPost();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].bucket).toBe("journal-photos");
    // owner-scoped: path starts with the user's id, ends with the validated extension
    expect(uploadCalls[0].path.startsWith("user-1/")).toBe(true);
    expect(uploadCalls[0].path.endsWith(".jpg")).toBe(true);
    expect(json.path).toBe(uploadCalls[0].path);
    // a display-only signed URL is returned for the thumbnail
    expect(typeof json.signedUrl).toBe("string");
    expect(json.signedUrl).toContain(uploadCalls[0].path);
  });

  it("503 in demo mode (no Supabase)", async () => {
    mockCreateServerSupabaseClient.mockRejectedValue(new Error("DEMO_MODE"));
    const res = await callPost();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("DEMO_MODE");
  });

  it("500 when storage upload fails", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(
      buildSupabase("user-1", { message: "storage down" }).supabase,
    );
    const res = await callPost();
    expect(res.status).toBe(500);
  });
});
