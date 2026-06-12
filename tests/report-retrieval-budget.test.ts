import { createSession, type PetProfile } from "@/lib/triage-engine";

const mockRetrieveVeterinaryTextEvidence = jest.fn();
const mockRetrieveVeterinaryImageEvidence = jest.fn();
const mockSearchKnowledgeChunks = jest.fn();
const mockSearchReferenceImages = jest.fn();

jest.mock("@/lib/text-retrieval-service", () => ({
  isTextRetrievalConfigured: () => true,
  retrieveVeterinaryTextEvidence: (...args: unknown[]) =>
    mockRetrieveVeterinaryTextEvidence(...args),
}));

jest.mock("@/lib/image-retrieval-service", () => ({
  isImageRetrievalConfigured: () => true,
  retrieveVeterinaryImageEvidence: (...args: unknown[]) =>
    mockRetrieveVeterinaryImageEvidence(...args),
}));

jest.mock("@/lib/hf-sidecars", () => ({
  describeLiveTrafficDecision: () => "liveTraffic=true",
  getLiveTrafficDecision: () => ({
    enabled: true,
    service: "text-retrieval-service",
    env: "SIDECAR_LIVE_SPLIT_TEXT_RETRIEVAL",
    promotion_status: "promoted",
    live_split_pct: 100,
    effective_live_split_pct: 100,
    env_override_pct: null,
    case_sample: 0,
    mode: "promoted",
  }),
  isAbortLikeError: (error: unknown) =>
    error instanceof Error && error.name === "AbortError",
  isRetrievalSidecarConfigured: () => false,
  retrieveVeterinaryEvidenceFromSidecar: jest.fn(),
}));

jest.mock("@/lib/sidecar-observability", () => ({
  appendShadowComparison: (session: unknown) => session,
  appendSidecarObservation: (
    session: { case_memory?: Record<string, unknown> },
    observation: unknown
  ) => ({
    ...session,
    case_memory: {
      ...(session.case_memory ?? {}),
      sidecar_observations: [
        ...((session.case_memory?.sidecar_observations as unknown[]) ?? []),
        observation,
      ],
    },
  }),
  describeShadowComparison: () => "shadow comparison",
  describeShadowModeDecision: () => "shadow=false",
  getShadowModeDecision: () => ({
    enabled: false,
    service: "text-retrieval-service",
    sampleRate: 0,
    deterministicSample: 1,
    reason: "disabled",
  }),
}));

jest.mock("@/lib/knowledge-retrieval", () => ({
  searchKnowledgeChunks: (...args: unknown[]) =>
    mockSearchKnowledgeChunks(...args),
  searchReferenceImages: (...args: unknown[]) =>
    mockSearchReferenceImages(...args),
}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
} as PetProfile;

describe("report retrieval turn-budget behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieveVeterinaryTextEvidence.mockResolvedValue({
      textChunks: [],
      rerankScores: [],
      sourceCitations: [],
    });
    mockRetrieveVeterinaryImageEvidence.mockResolvedValue({
      imageMatches: [],
      sourceCitations: [],
    });
    mockSearchKnowledgeChunks.mockResolvedValue([]);
    mockSearchReferenceImages.mockResolvedValue([]);
  });

  it("skips sidecar and fallback retrieval when the report turn budget is exhausted", async () => {
    const { buildReportRetrievalBundle } = await import(
      "@/lib/symptom-chat/report-helpers"
    );
    const serviceTimeouts: Array<{
      service: string;
      stage: string;
      reason: string;
    }> = [];
    const session = createSession();
    session.known_symptoms = ["limping"];

    const result = await buildReportRetrievalBundle(
      session,
      PET,
      "dog limping",
      "dog limping image",
      ["soft tissue injury"],
      {
        turnBudget: {
          startedAtMs: 0,
          deadlineAtMs: Date.now() + 100,
        },
        serviceTimeouts,
      }
    );

    expect(mockRetrieveVeterinaryTextEvidence).not.toHaveBeenCalled();
    expect(mockRetrieveVeterinaryImageEvidence).not.toHaveBeenCalled();
    expect(mockSearchKnowledgeChunks).not.toHaveBeenCalled();
    expect(mockSearchReferenceImages).not.toHaveBeenCalled();
    expect(result.bundle).toEqual({
      textChunks: [],
      imageMatches: [],
      rerankScores: [],
      sourceCitations: [],
    });
    expect(serviceTimeouts).toEqual(
      expect.arrayContaining([
        {
          service: "text-retrieval-service",
          stage: "report-retrieval",
          reason: "turn_deadline_budget_exhausted",
        },
        {
          service: "image-retrieval-service",
          stage: "report-retrieval",
          reason: "turn_deadline_budget_exhausted",
        },
        {
          service: "text-retrieval-service",
          stage: "fallback-report-retrieval",
          reason: "turn_deadline_budget_exhausted",
        },
      ])
    );
  });
});
