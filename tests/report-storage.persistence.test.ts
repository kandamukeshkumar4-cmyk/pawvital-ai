const mockSymptomCheckInsert = jest.fn();
const mockSymptomCheckMaybeSingle = jest.fn();
const mockPetMaybeSingle = jest.fn();
const mockCreateClient = jest.fn(() => ({
  from: jest.fn((table: string) => {
    if (table === "pets") {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: mockPetMaybeSingle,
          })),
        })),
      };
    }

    if (table === "symptom_checks") {
      return {
        insert: mockSymptomCheckInsert,
      };
    }

    throw new Error(`Unexpected table ${table}`);
  }),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe("saveSymptomReportToDB persistence verification", () => {
  const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mockSymptomCheckInsert.mockImplementation((payload: unknown) => ({
      select: jest.fn(() => ({
        maybeSingle: mockSymptomCheckMaybeSingle.mockResolvedValue({
          data: { id: "check-1", payload },
          error: null,
        }),
      })),
    }));
    mockPetMaybeSingle.mockResolvedValue({
      data: { id: "pet-1", user_id: "user-1" },
      error: null,
    });
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  });

  it("reports that a saved pet is required before persistence and skips the insert", async () => {
    const { saveSymptomReportToDB } = await import("@/lib/report-storage");
    const diagnostics: Array<Record<string, unknown>> = [];

    const result = await saveSymptomReportToDB(
      {
        known_symptoms: ["vomiting"],
      } as never,
      {
        name: "Buddy",
        breed: "Golden Retriever",
        age_years: 4,
        weight: 55,
        species: "dog",
      } as never,
      {
        severity: "high",
        recommendation: "vet_24h",
      },
      {
        verifiedUserId: "user-1",
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic as Record<string, unknown>),
      }
    );

    expect(result).toBeNull();
    expect(mockSymptomCheckInsert).not.toHaveBeenCalled();
    expect(diagnostics[0]).toEqual(
      expect.objectContaining({
        reason: "pet_required",
      })
    );
  });

  it("verifies the authenticated user owns the pet before inserting a symptom check", async () => {
    mockPetMaybeSingle.mockResolvedValue({
      data: { id: "pet-1", user_id: "other-user" },
      error: null,
    });
    const { saveSymptomReportToDB } = await import("@/lib/report-storage");
    const diagnostics: Array<Record<string, unknown>> = [];

    const result = await saveSymptomReportToDB(
      {
        known_symptoms: ["vomiting"],
      } as never,
      {
        id: "pet-1",
        name: "Buddy",
        breed: "Golden Retriever",
        age_years: 4,
        weight: 55,
        species: "dog",
      } as never,
      {
        severity: "high",
        recommendation: "vet_24h",
      },
      {
        verifiedUserId: "user-1",
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic as Record<string, unknown>),
      }
    );

    expect(result).toBeNull();
    expect(mockSymptomCheckInsert).not.toHaveBeenCalled();
    expect(diagnostics[0]).toEqual(
      expect.objectContaining({
        reason: "pet_unowned",
        safeError: expect.objectContaining({
          code: "PET_OWNERSHIP_MISMATCH",
        }),
      })
    );
  });

  it("persists the expected symptom_checks shape after ownership verification succeeds", async () => {
    const { saveSymptomReportToDB } = await import("@/lib/report-storage");

    const result = await saveSymptomReportToDB(
      {
        known_symptoms: ["vomiting", "lethargy"],
      } as never,
      {
        id: "pet-1",
        name: "Buddy",
        breed: "Golden Retriever",
        age_years: 4,
        weight: 55,
        species: "dog",
      } as never,
      {
        severity: "high",
        recommendation: "vet_24h",
        title: "Vomiting",
      },
      {
        verifiedUserId: "user-1",
      }
    );

    expect(result).toBe("check-1");
    expect(mockPetMaybeSingle).toHaveBeenCalled();
    expect(mockSymptomCheckInsert).toHaveBeenCalledWith({
      pet_id: "pet-1",
      symptoms: "vomiting, lethargy",
      ai_response: JSON.stringify({
        severity: "high",
        recommendation: "vet_24h",
        title: "Vomiting",
      }),
      severity: "high",
      recommendation: "vet_24h",
    });
  });
});
