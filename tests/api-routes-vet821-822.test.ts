import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

type RateLimitResult =
  | { success: true; reset: number; remaining: number }
  | { success: false; reset: number; remaining?: number };

type AuthGetUserResult = {
  data: {
    user: { id: string } | null;
  };
  error: null;
};

type SupabaseClientFactory = () => Promise<SupabaseMock>;
type RateLimitChecker = (
  limiter: unknown,
  identifier: string
) => Promise<RateLimitResult>;
type RateLimitIdentifier = (request: Request) => string;
type RenderToBufferFn = (input: unknown) => Promise<Buffer>;
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

const mockCheckRateLimit = jest.fn() as jest.MockedFunction<RateLimitChecker>;
const mockCreateServerSupabaseClient =
  jest.fn() as jest.MockedFunction<SupabaseClientFactory>;
const mockGetRateLimitId = jest.fn() as jest.MockedFunction<RateLimitIdentifier>;
const mockRenderToBuffer = jest.fn() as jest.MockedFunction<RenderToBufferFn>;
const mockFetch = jest.fn() as jest.MockedFunction<FetchFn>;

const mockFallbackDogBreeds = [
  {
    id: "dog-1",
    name: "Golden Retriever",
    temperament: "friendly",
    life_span: "10 - 12 years",
  },
  {
    id: "dog-2",
    name: "Poodle",
    temperament: "active",
    life_span: "12 - 15 years",
  },
];

const mockFallbackCatBreeds = [
  {
    id: "cat-1",
    name: "Siamese",
    temperament: "social",
    life_span: "12 - 15 years",
  },
  {
    id: "cat-2",
    name: "Maine Coon",
    temperament: "gentle",
    life_span: "13 - 14 years",
  },
];

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (limiter: unknown, identifier: string) =>
    mockCheckRateLimit(limiter, identifier),
  getRateLimitId: (request: Request) => mockGetRateLimitId(request),
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

jest.mock(
  "@react-pdf/renderer",
  () => ({
    renderToBuffer: (input: unknown) => mockRenderToBuffer(input),
  }),
  { virtual: true }
);

jest.mock("@/lib/pdf/report-document", () => ({
  ReportPdfDocument: () => null,
}));

jest.mock("@/lib/breed-data", () => ({
  fallbackDogBreeds: mockFallbackDogBreeds,
  fallbackCatBreeds: mockFallbackCatBreeds,
}));

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

interface QueryChain extends PromiseLike<QueryResult> {
  eq: (...args: unknown[]) => QueryChain;
  is: (...args: unknown[]) => QueryChain;
  order: (...args: unknown[]) => QueryChain;
  range: (...args: unknown[]) => QueryChain;
  ilike: (...args: unknown[]) => QueryChain;
  limit: (...args: unknown[]) => QueryChain;
  select: (...args: unknown[]) => QueryChain;
  update: (...args: unknown[]) => QueryChain;
  insert: (...args: unknown[]) => QueryChain;
  upsert: (...args: unknown[]) => QueryChain;
  delete: (...args: unknown[]) => QueryChain;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  then: PromiseLike<QueryResult>["then"];
}

interface TableMock {
  select: jest.MockedFunction<(query?: string) => QueryChain>;
  update: jest.MockedFunction<(payload?: Record<string, unknown>) => QueryChain>;
  insert: jest.MockedFunction<(payload?: Record<string, unknown>) => QueryChain>;
  upsert: jest.MockedFunction<(
    payload?: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => QueryChain>;
  delete: jest.MockedFunction<() => QueryChain>;
  selectChain: QueryChain;
  updateChain: QueryChain;
  insertChain: QueryChain;
  upsertChain: QueryChain;
  deleteChain: QueryChain;
}

interface SupabaseMock {
  auth: {
    getUser: jest.MockedFunction<() => Promise<AuthGetUserResult>>;
  };
  from: jest.MockedFunction<(table: string) => TableMock>;
  rpc: jest.MockedFunction<(
    functionName: string,
    params?: Record<string, unknown>
  ) => Promise<QueryResult>>;
}

interface TableConfig {
  selectResult?: QueryResult;
  updateResult?: QueryResult;
  insertResult?: QueryResult;
  upsertResult?: QueryResult;
  deleteResult?: QueryResult;
}

interface SupabaseMockOptions {
  userId?: string | null;
  pets?: TableConfig;
  sharedReports?: TableConfig;
  symptomChecks?: TableConfig;
  breedRiskProfiles?: TableConfig;
  rpcResult?: QueryResult;
}

const samplePet = {
  id: "pet-1",
  user_id: "user-1",
  name: "Milo",
  species: "dog",
  breed: "golden retriever",
  age_years: 4,
  age_months: 0,
  age_unit: "years",
  weight: 45,
  weight_unit: "lbs",
  gender: "male",
  is_neutered: true,
  existing_conditions: ["arthritis"],
  medications: ["carprofen"],
  photo_url: null,
  created_at: "2026-04-07T10:00:00.000Z",
  updated_at: "2026-04-07T10:00:00.000Z",
  deleted_at: null,
};

const sampleUpdatedPet = {
  ...samplePet,
  name: "Milo Updated",
};

const sampleBreedRiskProfiles = [
  {
    breed: "golden retriever",
    condition: "hip dysplasia",
    risk_score: 0.42,
    mention_count: 21,
  },
  {
    breed: "golden retriever",
    condition: "arthritis",
    risk_score: 0.28,
    mention_count: 14,
  },
];

const sampleReport = {
  severity: "high" as const,
  recommendation: "vet_24h" as const,
  title: "Likely gastroenteritis",
  explanation: "Sample explanation for a stable regression fixture.",
  differential_diagnoses: [
    {
      condition: "gastroenteritis",
      likelihood: "high" as const,
      description: "Sample differential description.",
    },
  ],
  clinical_notes: "Sample clinical notes.",
  home_care: [
    {
      instruction: "Offer fresh water.",
      duration: "24 hours",
      details: "Monitor intake closely.",
    },
  ],
  actions: ["Monitor appetite", "Offer water"],
  warning_signs: ["Vomiting blood"],
  vet_questions: ["Is the pet still eating?"],
  confidence: 0.84,
  calibrated_confidence: {
    final_confidence: 0.84,
    base_confidence: 0.8,
    adjustments: [
      {
        factor: "symptom_count",
        delta: 0.04,
        direction: "increase" as const,
        reason: "Sample calibration adjustment.",
      },
    ],
    confidence_level: "high" as const,
    recommendation: "Confidence is supported by the available evidence.",
  },
  evidenceChain: [
    {
      source: "corpus",
      finding: "Vomiting",
      supporting: ["vomiting"],
      contradicting: [],
      confidence: 0.8,
    },
  ],
  vet_handoff_summary: "Sample handoff summary.",
};

const futureExpiryIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const expiredExpiryIso = new Date(Date.now() - 60 * 1000).toISOString();
const validShareCheckId = "4c7d2d59-2f43-49d3-bc5e-b64053439bb0";

const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalPublicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalVercelUrl = process.env.VERCEL_URL;

function createChain(result: QueryResult): QueryChain {
  const chain = {} as QueryChain;

  chain.eq = jest.fn(() => chain);
  chain.is = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.range = jest.fn(() => chain);
  chain.ilike = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.select = jest.fn(() => chain);
  chain.update = jest.fn(() => chain);
  chain.insert = jest.fn(() => chain);
  chain.upsert = jest.fn(() => chain);
  chain.delete = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => result);
  chain.single = jest.fn(async () => result);
  chain.then = ((
    onfulfilled?: ((value: QueryResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ) => Promise.resolve(result).then(onfulfilled, onrejected)) as PromiseLike<QueryResult>["then"];

  return chain;
}

function createTableMock(config: TableConfig = {}): TableMock {
  const selectChain = createChain(
    config.selectResult ?? { data: null, error: null }
  );
  const updateChain = createChain(
    config.updateResult ?? { data: null, error: null }
  );
  const insertChain = createChain(
    config.insertResult ?? { data: null, error: null }
  );
  const upsertChain = createChain(
    config.upsertResult ?? { data: null, error: null }
  );
  const deleteChain = createChain(
    config.deleteResult ?? { data: null, error: null }
  );

  return {
    select: jest.fn(() => selectChain),
    update: jest.fn(() => updateChain),
    insert: jest.fn(() => insertChain),
    upsert: jest.fn(() => upsertChain),
    delete: jest.fn(() => deleteChain),
    selectChain,
    updateChain,
    insertChain,
    upsertChain,
    deleteChain,
  };
}

function buildSupabaseMock(options: SupabaseMockOptions = {}): {
  supabase: SupabaseMock;
  tables: {
    pets: TableMock;
    sharedReports: TableMock;
    symptomChecks: TableMock;
    breedRiskProfiles: TableMock;
  };
} {
  const pets = createTableMock(options.pets);
  const sharedReports = createTableMock(options.sharedReports);
  const symptomChecks = createTableMock(options.symptomChecks);
  const breedRiskProfiles = createTableMock(options.breedRiskProfiles);

  const supabase: SupabaseMock = {
    auth: {
      getUser: jest.fn() as jest.MockedFunction<() => Promise<AuthGetUserResult>>,
    },
    from: jest.fn((table: string) => {
      if (table === "pets") return pets;
      if (table === "shared_reports") return sharedReports;
      if (table === "symptom_checks") return symptomChecks;
      if (table === "breed_risk_profiles") return breedRiskProfiles;
      throw new Error(`Unexpected table in mock: ${table}`);
    }) as jest.MockedFunction<(table: string) => TableMock>,
    rpc: jest.fn() as jest.MockedFunction<(
      functionName: string,
      params?: Record<string, unknown>
    ) => Promise<QueryResult>>,
  };

  supabase.auth.getUser.mockResolvedValue({
    data: {
      user: options.userId === null ? null : { id: options.userId ?? "user-1" },
    },
    error: null,
  });

  supabase.rpc.mockResolvedValue(options.rpcResult ?? { data: [], error: null });

  return {
    supabase,
    tables: {
      pets,
      sharedReports,
      symptomChecks,
      breedRiskProfiles,
    },
  };
}

function makeGetRequest(path: string): Request {
  return new Request(path, { method: "GET" });
}

function makeJsonRequest(
  path: string,
  method: "POST" | "PUT" | "PATCH",
  body: unknown
): Request {
  return new Request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  mockCheckRateLimit.mockResolvedValue({
    success: true,
    reset: Date.now() + 60_000,
    remaining: 1,
  });
  mockGetRateLimitId.mockReturnValue("user:user-1");
  mockRenderToBuffer.mockResolvedValue(Buffer.from("%PDF-1.4 mock pdf"));
  mockFetch.mockReset();

  Object.defineProperty(globalThis, "fetch", {
    value: mockFetch,
    writable: true,
    configurable: true,
  });

  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  delete process.env.VERCEL_URL;
});

afterAll(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch,
    writable: true,
    configurable: true,
  });

  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;

  if (originalPublicSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicSupabaseUrl;

  if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;

  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;

  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = originalVercelUrl;
});

describe("POST /api/pets", () => {
  it("creates a pet for the authenticated user", async () => {
    const { supabase, tables } = buildSupabaseMock({
      pets: {
        insertResult: { data: samplePet, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/pets/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/pets", "POST", {
        name: "Milo",
        species: "dog",
        breed: "golden retriever",
        age_years: 4,
      })
    );
    const payload = await readJson<{ pet: typeof samplePet }>(response);

    expect(response.status).toBe(200);
    expect(payload.pet.name).toBe("Milo");
    expect(tables.pets.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        name: "Milo",
        species: "dog",
        breed: "golden retriever",
      })
    );
  });

  it("rejects unauthenticated pet creation", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/pets/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/pets", "POST", {
        name: "Milo",
        species: "dog",
        breed: "golden retriever",
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects incomplete pet payloads", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/pets/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/pets", "POST", {
        name: "Milo",
        species: "dog",
      })
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Missing required fields");
  });

  it("returns 503 when the pets table is unavailable", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        insertResult: {
          data: null,
          error: { message: 'relation "pets" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/pets/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/pets", "POST", {
        name: "Milo",
        species: "dog",
        breed: "golden retriever",
      })
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(503);
    expect(payload.error).toContain("temporarily unavailable");
  });
});

describe("GET /api/pets", () => {
  it("returns active pets for the authenticated user", async () => {
    const { supabase, tables } = buildSupabaseMock({
      pets: {
        selectResult: { data: [samplePet], error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets"));
    const payload = await readJson<{ pets: typeof samplePet[] }>(response);

    expect(response.status).toBe(200);
    expect(payload.pets).toHaveLength(1);
    expect(payload.pets[0].name).toBe("Milo");
    expect(tables.pets.selectChain.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("rejects unauthenticated pet list requests", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets"));

    expect(response.status).toBe(401);
  });

  it("returns an empty list when the user has no pets", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: { data: [], error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets"));
    const payload = await readJson<{ pets: unknown[] }>(response);

    expect(response.status).toBe(200);
    expect(payload.pets).toEqual([]);
  });

  it("falls back gracefully when the pets table is unavailable", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: {
          data: null,
          error: { message: 'relation "pets" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets"));
    const payload = await readJson<{ pets: unknown[] }>(response);

    expect(response.status).toBe(503);
    expect(payload.pets).toEqual([]);
  });
});

describe("GET /api/pets/[id]", () => {
  it("returns the requested pet for its owner", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: { data: samplePet, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/[id]/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });
    const payload = await readJson<{ pet: typeof samplePet }>(response);

    expect(response.status).toBe(200);
    expect(payload.pet.id).toBe("pet-1");
  });

  it("rejects unauthenticated pet detail requests", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/[id]/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when the pet belongs to a different user", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: {
          data: { ...samplePet, user_id: "user-2" },
          error: null,
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/[id]/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the pet does not exist", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: { data: null, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/[id]/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("falls back gracefully when the pets table is unavailable", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: {
          data: null,
          error: { message: 'relation "pets" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/pets/[id]/route");
    const response = await GET(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });

    expect(response.status).toBe(503);
  });
});

describe("PUT /api/pets/[id]", () => {
  it("updates a pet owned by the authenticated user", async () => {
    const { supabase, tables } = buildSupabaseMock({
      pets: {
        selectResult: { data: { user_id: "user-1" }, error: null },
        updateResult: { data: sampleUpdatedPet, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import("../src/app/api/pets/[id]/route");
    const response = await PUT(
      makeJsonRequest("http://localhost/api/pets/pet-1", "PUT", {
        name: "Milo Updated",
        breed: "golden retriever",
      }),
      { params: Promise.resolve({ id: "pet-1" }) }
    );
    const payload = await readJson<{ pet: typeof sampleUpdatedPet }>(response);

    expect(response.status).toBe(200);
    expect(payload.pet.name).toBe("Milo Updated");
    expect(tables.pets.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Milo Updated",
        breed: "golden retriever",
      })
    );
  });

  it("rejects unauthenticated pet updates", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import("../src/app/api/pets/[id]/route");
    const response = await PUT(
      makeJsonRequest("http://localhost/api/pets/pet-1", "PUT", {
        name: "Milo Updated",
      }),
      { params: Promise.resolve({ id: "pet-1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("rejects empty update payloads", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: { data: { user_id: "user-1" }, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import("../src/app/api/pets/[id]/route");
    const response = await PUT(
      makeJsonRequest("http://localhost/api/pets/pet-1", "PUT", {}),
      { params: Promise.resolve({ id: "pet-1" }) }
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Missing fields to update");
  });

  it("returns 403 when a different owner tries to update the pet", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: { data: { user_id: "user-2" }, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import("../src/app/api/pets/[id]/route");
    const response = await PUT(
      makeJsonRequest("http://localhost/api/pets/pet-1", "PUT", {
        name: "Milo Updated",
      }),
      { params: Promise.resolve({ id: "pet-1" }) }
    );

    expect(response.status).toBe(403);
  });

  it("falls back gracefully when the pets table is unavailable", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: {
          data: null,
          error: { message: 'relation "pets" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { PUT } = await import("../src/app/api/pets/[id]/route");
    const response = await PUT(
      makeJsonRequest("http://localhost/api/pets/pet-1", "PUT", {
        name: "Milo Updated",
      }),
      { params: Promise.resolve({ id: "pet-1" }) }
    );

    expect(response.status).toBe(503);
  });
});

describe("DELETE /api/pets/[id]", () => {
  it("soft deletes the pet instead of hard deleting it", async () => {
    const { supabase, tables } = buildSupabaseMock({
      pets: {
        selectResult: { data: { user_id: "user-1" }, error: null },
        updateResult: { data: null, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { DELETE } = await import("../src/app/api/pets/[id]/route");
    const response = await DELETE(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });
    const payload = await readJson<{ success: boolean }>(response);

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(tables.pets.update).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
      })
    );
    expect(tables.pets.delete).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated pet deletes", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { DELETE } = await import("../src/app/api/pets/[id]/route");
    const response = await DELETE(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when a different owner tries to delete the pet", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: { data: { user_id: "user-2" }, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { DELETE } = await import("../src/app/api/pets/[id]/route");
    const response = await DELETE(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("falls back gracefully when the pets table is unavailable", async () => {
    const { supabase } = buildSupabaseMock({
      pets: {
        selectResult: {
          data: null,
          error: { message: 'relation "pets" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { DELETE } = await import("../src/app/api/pets/[id]/route");
    const response = await DELETE(makeGetRequest("http://localhost/api/pets/pet-1"), {
      params: Promise.resolve({ id: "pet-1" }),
    });

    expect(response.status).toBe(503);
  });
});

describe("GET /api/breeds", () => {
  it("returns filtered dog breeds from the external API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 1, name: "Golden Retriever", temperament: "friendly", life_span: "10 - 12 years" },
        { id: 2, name: "Poodle", temperament: "active", life_span: "12 - 15 years" },
      ],
    });

    const { GET } = await import("../src/app/api/breeds/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds?q=golden&species=dog"));
    const payload = await readJson<{ breeds: Array<{ name: string }> }>(response);

    expect(response.status).toBe(200);
    expect(payload.breeds).toHaveLength(1);
    expect(payload.breeds[0].name).toBe("Golden Retriever");
  });

  it("rejects non-dog species queries", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 1, name: "Siamese", temperament: "social", life_span: "12 - 15 years" },
        { id: 2, name: "Bengal", temperament: "active", life_span: "12 - 16 years" },
      ],
    });

    const { GET } = await import("../src/app/api/breeds/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds?q=siamese&species=cat"));
    const payload = await readJson<{ error: string; breeds: Array<{ name: string }> }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("PawVital currently supports dogs only.");
    expect(payload.breeds).toEqual([]);
  });

  it("falls back to static dog breeds when the external fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network failure"));

    const { GET } = await import("../src/app/api/breeds/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds?q=poodle&species=dog"));
    const payload = await readJson<{ breeds: Array<{ name: string }> }>(response);

    expect(response.status).toBe(200);
    expect(payload.breeds).toEqual([
      expect.objectContaining({ name: "Poodle" }),
    ]);
  });

  it("does not fall back to cat breeds when the request is outside dog scope", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    });

    const { GET } = await import("../src/app/api/breeds/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds?q=maine&species=cat"));
    const payload = await readJson<{ error: string; breeds: Array<{ name: string }> }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toBe("PawVital currently supports dogs only.");
    expect(payload.breeds).toEqual([]);
  });
});

describe("GET /api/breeds/risk", () => {
  it("returns breed risk profiles from the corpus lookup", async () => {
    const { supabase } = buildSupabaseMock({
      breedRiskProfiles: {
        selectResult: { data: sampleBreedRiskProfiles, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(
      makeGetRequest("http://localhost/api/breeds/risk?breed=golden%20retriever&top=5")
    );
    const payload = await readJson<{
      breed: string;
      profiles: typeof sampleBreedRiskProfiles;
      source: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.breed).toBe("golden retriever");
    expect(payload.source).toBe("supabase");
    expect(payload.profiles).toHaveLength(2);
  });

  it("rejects missing breed queries", async () => {
    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds/risk?top=5"));
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("breed");
  });

  it("marks the source as unavailable when the lookup returns no data", async () => {
    const { supabase } = buildSupabaseMock({
      breedRiskProfiles: {
        selectResult: { data: [], error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds/risk?breed=beagle&top=5"));
    const payload = await readJson<{ source: string; profiles: unknown[] }>(response);

    expect(response.status).toBe(200);
    expect(payload.source).toBe("unavailable");
    expect(payload.profiles).toEqual([]);
  });

  it("clamps the requested top value through the helper", async () => {
    const { supabase, tables } = buildSupabaseMock({
      breedRiskProfiles: {
        selectResult: { data: sampleBreedRiskProfiles, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(makeGetRequest("http://localhost/api/breeds/risk?breed=golden%20retriever&top=99"));

    expect(response.status).toBe(200);
    expect(tables.breedRiskProfiles.selectChain.limit).toHaveBeenCalledWith(20);
  });
});

describe("POST /api/reports/pdf", () => {
  it("renders a PDF for an authenticated report request", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/pdf/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/pdf", "POST", {
        report: sampleReport,
      })
    );
    const pdfText = Buffer.from(await response.arrayBuffer()).toString("utf8");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("pawvital-likely-gastroenteritis.pdf");
    expect(pdfText).toContain("%PDF-1.4 mock pdf");
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated PDF export requests", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/pdf/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/pdf", "POST", {
        report: sampleReport,
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid report payloads", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/pdf/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/pdf", "POST", {
        title: "Missing report wrapper",
      })
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Invalid report payload");
  });

  it("returns demo-mode fallback when Supabase is unavailable", async () => {
    mockCreateServerSupabaseClient.mockRejectedValue(new Error("DEMO_MODE"));

    const { POST } = await import("../src/app/api/reports/pdf/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/pdf", "POST", {
        report: sampleReport,
      })
    );
    const payload = await readJson<{ error: string; code: string }>(response);

    expect(response.status).toBe(503);
    expect(payload.code).toBe("DEMO_MODE");
  });
});

describe("POST /api/reports/share", () => {
  it("creates a share link with a future expiry", async () => {
    const { supabase, tables } = buildSupabaseMock({
      symptomChecks: {
        selectResult: { data: { id: validShareCheckId, pet_id: "pet-1" }, error: null },
      },
      pets: {
        selectResult: { data: { id: "pet-1", user_id: "user-1" }, error: null },
      },
      sharedReports: {
        insertResult: {
          data: { expires_at: futureExpiryIso },
          error: null,
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/share/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/share", "POST", {
        check_id: validShareCheckId,
      })
    );
    const payload = await readJson<{ share_url: string; expires_at: string; share_token?: string }>(response);
    const sharedToken = new URL(payload.share_url).pathname.split("/").pop() ?? "";

    expect(response.status).toBe(200);
    expect(payload.share_url.startsWith("http")).toBe(true);
    expect(sharedToken.length).toBeGreaterThan(10);
    expect(payload.share_url).toContain(sharedToken);
    expect(new Date(payload.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(payload.share_token).toBeUndefined();
    expect(tables.sharedReports.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated share creation", async () => {
    const { supabase } = buildSupabaseMock({ userId: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/share/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/share", "POST", {
        check_id: validShareCheckId,
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid share payloads", async () => {
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/share/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/share", "POST", {})
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Invalid request body");
  });

  it("returns 503 when the shared_reports insert fails", async () => {
    const { supabase } = buildSupabaseMock({
      symptomChecks: {
        selectResult: { data: { id: validShareCheckId, pet_id: "pet-1" }, error: null },
      },
      pets: {
        selectResult: { data: { id: "pet-1", user_id: "user-1" }, error: null },
      },
      sharedReports: {
        insertResult: {
          data: null,
          error: { message: 'relation "shared_reports" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("../src/app/api/reports/share/route");
    const response = await POST(
      makeJsonRequest("http://localhost/api/reports/share", "POST", {
        check_id: validShareCheckId,
      })
    );
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(503);
    expect(payload.error).toContain("shared_reports table exists");
  });
});

describe("GET /api/shared/[token]", () => {
  it("returns the shared report for a valid token", async () => {
    const { supabase } = buildSupabaseMock({
      sharedReports: {
        selectResult: {
          data: {
            check_id: validShareCheckId,
            ai_response: JSON.stringify(sampleReport),
            expires_at: futureExpiryIso,
          },
          error: null,
        },
      },
      rpcResult: {
        data: [
          {
            check_id: validShareCheckId,
            ai_response: JSON.stringify(sampleReport),
            expires_at: futureExpiryIso,
          },
        ],
        error: null,
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/shared/[token]/route");
    const response = await GET(makeGetRequest("http://localhost/api/shared/valid-token"), {
      params: Promise.resolve({ token: "valid-token" }),
    });
    const payload = await readJson<{
      token: string;
      expires_at: string;
      report: Record<string, unknown>;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.token).toBe("valid-token");
    expect(payload.report.title).toBe(sampleReport.title);
  });

  it("returns 400 for an empty shared token", async () => {
    const { GET } = await import("../src/app/api/shared/[token]/route");
    const response = await GET(makeGetRequest("http://localhost/api/shared/"), {
      params: Promise.resolve({ token: "" }),
    });
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Invalid shared token");
  });

  it("returns 404 when the token does not exist", async () => {
    const { supabase } = buildSupabaseMock({
      sharedReports: {
        selectResult: { data: null, error: null },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/shared/[token]/route");
    const response = await GET(makeGetRequest("http://localhost/api/shared/missing"), {
      params: Promise.resolve({ token: "missing" }),
    });
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(404);
    expect(payload.error).toContain("not found");
  });

  it("returns 410 when the share has expired", async () => {
    const { supabase } = buildSupabaseMock({
      sharedReports: {
        selectResult: {
          data: {
            check_id: validShareCheckId,
            ai_response: JSON.stringify(sampleReport),
            expires_at: expiredExpiryIso,
          },
          error: null,
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/shared/[token]/route");
    const response = await GET(makeGetRequest("http://localhost/api/shared/expired"), {
      params: Promise.resolve({ token: "expired" }),
    });
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(410);
    expect(payload.error).toContain("expired");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 503 when the shared_reports table is unavailable", async () => {
    const { supabase } = buildSupabaseMock({
      sharedReports: {
        selectResult: {
          data: null,
          error: { message: 'relation "shared_reports" does not exist' },
        },
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { GET } = await import("../src/app/api/shared/[token]/route");
    const response = await GET(makeGetRequest("http://localhost/api/shared/broken"), {
      params: Promise.resolve({ token: "broken" }),
    });
    const payload = await readJson<{ error: string }>(response);

    expect(response.status).toBe(503);
    expect(payload.error).toContain("temporarily unavailable");
  });
});
