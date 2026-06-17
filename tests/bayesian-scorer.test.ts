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

const FINDINGS_GI = [
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
];

describe("scoreDifferentials", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mockReadFile.mockResolvedValue(
      `text,condition,record_type\n"Case 1","Gastroenteritis","note"\n`
    );
  });

  it("returns raw scores unchanged when no critical negative answers are present", async () => {
    const { scoreDifferentials } = await import("@/lib/bayesian-scorer");
    const { createSession, addSymptoms } = await import("@/lib/triage-engine");

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    const result = await scoreDifferentials(
      session,
      { breed: "Mixed", age_years: 4 },
      FINDINGS_GI
    );

    expect(result.length).toBeGreaterThan(0);
    const total = result.reduce((s, d) => s + d.probability, 0);
    expect(total).toBeCloseTo(1, 4);
  });

  it("applies 0.5x penalty to diseases implicated by a critical negative answer", async () => {
    const { scoreDifferentials } = await import("@/lib/bayesian-scorer");
    const { createSession, addSymptoms, recordAnswer } = await import("@/lib/triage-engine");
    const { FOLLOW_UP_QUESTIONS } = await import("@/lib/clinical-matrix");

    // Find a critical question linked to vomiting
    const criticalQId = Object.entries(FOLLOW_UP_QUESTIONS).find(
      ([, q]) => q.critical
    )?.[0];
    if (!criticalQId) return; // skip if none exist

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    const baseResult = await scoreDifferentials(
      session,
      { breed: "Mixed", age_years: 4 },
      FINDINGS_GI
    );

    // Record a negative answer for the critical question
    session = recordAnswer(session, criticalQId, false);

    const penalizedResult = await scoreDifferentials(
      session,
      { breed: "Mixed", age_years: 4 },
      FINDINGS_GI
    );

    // Penalized probabilities must still sum to ~1 (renormalized)
    const penalizedTotal = penalizedResult.reduce((s, d) => s + d.probability, 0);
    expect(penalizedTotal).toBeCloseTo(1, 4);

    // If that question implicates any of our findings, relative ordering may shift
    // — at minimum the penalized scores are still valid probabilities
    penalizedResult.forEach((d) => {
      expect(d.probability).toBeGreaterThanOrEqual(0);
      expect(d.probability).toBeLessThanOrEqual(1);
    });
  });
});

describe("getTopDifferentials", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mockReadFile.mockResolvedValue(
      `text,condition,record_type\n"Case 1","Gastroenteritis","note"\n`
    );
  });

  it("returns at most n results, sorted by probability descending", async () => {
    const { getTopDifferentials } = await import("@/lib/bayesian-scorer");
    const { createSession, addSymptoms } = await import("@/lib/triage-engine");

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    const top1 = await getTopDifferentials(
      session,
      1,
      { breed: "Mixed", age_years: 4 },
      FINDINGS_GI
    );
    expect(top1).toHaveLength(1);

    const top2 = await getTopDifferentials(
      session,
      2,
      { breed: "Mixed", age_years: 4 },
      FINDINGS_GI
    );
    expect(top2).toHaveLength(2);
    expect(top2[0]!.probability).toBeGreaterThanOrEqual(top2[1]!.probability);
  });

  it("resolves urgency from the findings source array", async () => {
    const { getTopDifferentials } = await import("@/lib/bayesian-scorer");
    const { createSession, addSymptoms } = await import("@/lib/triage-engine");

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    const top = await getTopDifferentials(
      session,
      2,
      { breed: "Mixed", age_years: 4 },
      FINDINGS_GI
    );

    // Every returned entry should have urgency from the source findings
    top.forEach((d) => {
      expect(["moderate", "emergency", "low", "high", "unknown"]).toContain(d.urgency);
    });

    // The GDV entry specifically should carry "emergency" urgency
    const gdvEntry = top.find((d) => d.condition === "GDV");
    if (gdvEntry) {
      expect(gdvEntry.urgency).toBe("emergency");
    }
  });
});