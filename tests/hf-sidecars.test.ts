describe("hf-sidecars integration contracts", () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HF_SIDECAR_API_KEY: "test-key",
      HF_TEXT_RETRIEVAL_URL: "http://localhost:8081/search",
      HF_IMAGE_RETRIEVAL_URL: "http://localhost:8082/search",
      HF_MULTIMODAL_CONSULT_URL: "http://localhost:8083/consult",
      HF_ASYNC_REVIEW_URL: "http://localhost:8084/review",
      HF_VISION_PREPROCESS_URL: "http://localhost:8080/infer",
    };
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("retries and normalizes text retrieval responses", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            text_chunks: [
              {
                title: "Canine wound care",
                citation: "Merck",
                score: 0.88,
                summary: "Clean and protect the wound.",
                source_url: "https://example.com/wound",
              },
            ],
            rerank_scores: [0.88],
            source_citations: ["Merck"],
          }),
      });

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.retrieveVeterinaryTextEvidenceFromSidecar({
      query: "dog leg wound",
      domain: "skin_wound",
      breed: "Labrador",
      conditionHints: ["wound"],
      dogOnly: true,
      textLimit: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8081/search");
    expect(result.textChunks).toEqual([
      {
        title: "Canine wound care",
        citation: "Merck",
        score: 0.88,
        summary: "Clean and protect the wound.",
        sourceUrl: "https://example.com/wound",
      },
    ]);
    expect(result.rerankScores).toEqual([0.88]);
    expect(result.sourceCitations).toEqual(["Merck"]);
  });

  it("submits async review requests to the dedicated async endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          ok: true,
          case_id: "case-xyz",
          status: "queued",
          message: "Review queued.",
        }),
    });

    const sidecars = await import("@/lib/hf-sidecars");
    const result = await sidecars.submitAsyncReviewToSidecar({
      image: "data:image/jpeg;base64,ZmFrZQ==",
      ownerText: "Please review this lesion.",
      preprocess: {
        domain: "skin_wound",
        bodyRegion: "left hind leg",
        detectedRegions: [],
        bestCrop: null,
        imageQuality: "good",
        confidence: 0.7,
        limitations: [],
      },
      visionSummary: "Inflamed lesion on hind leg.",
      severity: "needs_review",
      contradictions: [],
      deterministicFacts: { wound_location: "left hind leg" },
      caseId: "case-xyz",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8084/review");
    expect(result).toEqual({
      ok: true,
      caseId: "case-xyz",
      status: "queued",
      message: "Review queued.",
    });
  });

  it("combines split retrieval sidecars into one validated bundle", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            text_chunks: [
              {
                title: "Canine dermatitis",
                citation: "Merck",
                score: 0.76,
                summary: "Pruritic dermatitis differential guidance.",
                source_url: "https://example.com/dermatitis",
              },
            ],
            rerank_scores: [0.76],
            source_citations: ["Merck"],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            image_matches: [
              {
                title: "Reference image",
                citation: "Dataset A",
                score: 0.64,
                summary: "Ringworm example image.",
                asset_url: "https://example.com/ringworm.jpg",
                domain: "skin_wound",
                condition_label: "ringworm",
                dog_only: true,
              },
            ],
            source_citations: ["Dataset A"],
          }),
      });

    const sidecars = await import("@/lib/hf-sidecars");
    const bundle = await sidecars.retrieveVeterinaryEvidenceFromSidecar({
      query: "dog ringworm lesion",
      domain: "skin_wound",
      conditionHints: ["ringworm"],
      dogOnly: true,
      textLimit: 1,
      imageLimit: 1,
    });

    expect(bundle.textChunks).toHaveLength(1);
    expect(bundle.imageMatches).toHaveLength(1);
    expect(bundle.sourceCitations).toEqual(["Merck", "Dataset A"]);
  });
});
