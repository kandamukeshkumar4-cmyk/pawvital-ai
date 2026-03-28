import {
  getLiveCorpusSourcePolicy,
  inferLiveCorpusDomain,
  isLiveCorpusEligibleMatch,
  listLiveCorpusSourcePolicies,
  matchesRequestedLiveDomain,
} from "@/lib/live-corpus";

describe("live corpus policy helpers", () => {
  it("recognizes curated live image sources", () => {
    expect(listLiveCorpusSourcePolicies().length).toBeGreaterThan(0);
    expect(
      getLiveCorpusSourcePolicy("kaggle-pet-disease-images-dog")?.status
    ).toBe("live");
    expect(
      getLiveCorpusSourcePolicy("kaggle-pet-disease-images-dog")?.supportedDomains
    ).toContain("eye");
    expect(
      getLiveCorpusSourcePolicy("roboflow-dog-eye-disease")?.status
    ).toBe("pending_assets");
  });

  it("infers supported live domains from labels and metadata", () => {
    expect(
      inferLiveCorpusDomain({
        conditionLabel: "eye_infection",
        caption: "Eye Infection in Dog example",
        metadata: { live_domain: "eye" },
      })
    ).toBe("eye");

    expect(
      inferLiveCorpusDomain({
        conditionLabel: "hot_spot",
        caption: "Raw hot spot on dog skin",
        metadata: {},
      })
    ).toBe("skin_wound");
  });

  it("filters out benchmark-only or non-dog matches from the live path", () => {
    expect(
      isLiveCorpusEligibleMatch({
        sourceSlug: "kaggle-pet-disease-images-dog",
        conditionLabel: "eye_infection",
        caption: "Eye Infection in Dog",
        metadata: {
          species_scope: "dog",
          live_retrieval_status: "live",
          live_domain: "eye",
        },
      })
    ).toBe(true);

    expect(
      isLiveCorpusEligibleMatch({
        sourceSlug: "kaggle-pet-disease-images-dog",
        conditionLabel: "ringworm",
        caption: "Ringworm in Cat",
        metadata: {
          species_scope: "cat",
          live_retrieval_status: "benchmark_only",
          live_domain: "skin_wound",
        },
      })
    ).toBe(false);

    expect(
      isLiveCorpusEligibleMatch({
        sourceSlug: "roboflow-dog-eye-disease",
        conditionLabel: "corneal_ulcer",
        caption: "Dog eye lesion",
        metadata: {
          species_scope: "dog",
          live_retrieval_status: "live",
          live_domain: "eye",
        },
      })
    ).toBe(false);
  });

  it("checks requested domain matches conservatively", () => {
    expect(
      matchesRequestedLiveDomain(
        {
          sourceSlug: "kaggle-pet-disease-images-dog",
          conditionLabel: "eye_infection",
          caption: "Eye Infection in Dog",
          metadata: { live_domain: "eye" },
        },
        "eye"
      )
    ).toBe(true);

    expect(
      matchesRequestedLiveDomain(
        {
          sourceSlug: "kaggle-pet-disease-images-dog",
          conditionLabel: "eye_infection",
          caption: "Eye Infection in Dog",
          metadata: { live_domain: "eye" },
        },
        "skin_wound"
      )
    ).toBe(false);
  });
});
