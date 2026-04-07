const mockReadFile = jest.fn();

jest.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

describe("bayesian scorer", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mockReadFile.mockResolvedValue(`text,condition,record_type\n"Case 1","Gastroenteritis","note"\n"Case 2","Gastroenteritis","note"\n"Case 3","Gastric Dilatation-Volvulus","note"\n`);
  });

  it("ranks differentials with CSV priors and symptom overlap", async () => {
    const { computeBayesianScore } = await import("@/lib/bayesian-scorer");

    const results = await computeBayesianScore(
      ["vomiting", "diarrhea"],
      "Golden Retriever",
      5,
      [
        {
          disease_key: "gastroenteritis",
          name: "Gastroenteritis",
          medical_term: "Gastroenteritis",
          raw_score: 0.08,
          breed_multiplier: 1,
          age_multiplier: 1,
          final_score: 0.14,
          urgency: "moderate",
          key_differentiators: [],
          typical_tests: [],
          typical_home_care: [],
        },
        {
          disease_key: "gdv",
          name: "GDV",
          medical_term: "Gastric Dilatation-Volvulus",
          raw_score: 0.06,
          breed_multiplier: 1.4,
          age_multiplier: 1.2,
          final_score: 0.11,
          urgency: "emergency",
          key_differentiators: [],
          typical_tests: [],
          typical_home_care: [],
        },
      ]
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.condition).toBe("Gastroenteritis");
    expect(results[0]?.probability).toBeGreaterThan(results[1]?.probability || 0);
    expect(results[0]?.prior_probability).toBeGreaterThan(
      results[1]?.prior_probability || 0
    );
    expect(results[0]?.evidence_count).toBeGreaterThan(
      results[1]?.evidence_count || 0
    );
    expect(
      results.reduce((total, differential) => total + differential.probability, 0)
    ).toBeCloseTo(1, 4);
  });

  it("returns an empty list when no findings are supplied", async () => {
    const { computeBayesianScore } = await import("@/lib/bayesian-scorer");

    await expect(
      computeBayesianScore(["vomiting"], "Golden Retriever", 5, [])
    ).resolves.toEqual([]);
  });
});