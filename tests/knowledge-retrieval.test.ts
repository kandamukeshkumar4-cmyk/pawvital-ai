import {
  buildKnowledgeSearchQuery,
  buildReferenceImageQuery,
  formatReferenceImageContext,
  formatKnowledgeContext,
} from "@/lib/knowledge-retrieval";
import { createSession, type PetProfile } from "@/lib/triage-engine";

describe("knowledge retrieval helpers", () => {
  const pet: PetProfile = {
    name: "Milo",
    species: "dog",
    breed: "Golden Retriever",
    age_years: 5,
    weight: 72,
    existing_conditions: ["seasonal allergies"],
    medications: [],
  };

  it("builds a deduplicated knowledge query from triage state", () => {
    const session = createSession();
    session.known_symptoms = ["wound_skin_issue", "open_wound"];
    session.vision_symptoms = ["skin infection", "wound"];
    session.roboflow_skin_labels = ["hot_spot", "hot_spot"];
    session.red_flags_triggered = ["fever"];

    const query = buildKnowledgeSearchQuery(session, pet, [
      "pyoderma",
      "open wound",
      "pyoderma",
    ]);

    expect(query).toContain("golden retriever");
    expect(query).toContain("open wound");
    expect(query).toContain("pyoderma");
    expect(query).toContain("hot spot");
    expect(query).toContain("fever");
    expect(query).not.toContain("  ");
  });

  it("formats retrieved chunks into a compact prompt block", () => {
    const formatted = formatKnowledgeContext([
      {
        chunkId: "chunk-1",
        sourceId: "source-1",
        sourceTitle: "Merck Wound Management",
        chunkTitle: "Overview",
        sourceUrl: "https://example.com/wounds",
        citation: "Merck Veterinary Manual",
        textContent:
          "Open wounds should be stabilized before definitive repair. Debridement timing matters.",
        keywordTags: ["wounds", "debridement"],
        score: 0.8,
      },
    ]);

    expect(formatted).toContain("Merck Wound Management");
    expect(formatted).toContain("Merck Veterinary Manual");
    expect(formatted).toContain("wounds, debridement");
    expect(formatted).toContain("Debridement timing matters");
  });

  it("builds a reference image query with breed and condition hints", () => {
    const session = createSession();
    session.known_symptoms = ["wound_skin_issue"];
    session.roboflow_skin_labels = ["fungal_infection"];

    const query = buildReferenceImageQuery(session, pet, [
      "ringworm",
      "fungal_infection",
    ]);

    expect(query).toContain("golden retriever");
    expect(query).toContain("ringworm");
    expect(query).toContain("fungal infection");
  });

  it("formats reference image matches into a compact prompt block", () => {
    const formatted = formatReferenceImageContext([
      {
        assetId: "asset-1",
        sourceId: "source-1",
        sourceSlug: "kaggle-dog-skin",
        sourceTitle: "Kaggle Dog Skin Dataset",
        datasetUrl: "https://example.com/dataset",
        conditionLabel: "ringworm",
        localPath: "G:/corpus/images/ringworm/example.jpg",
        assetUrl: null,
        caption: "ringworm example",
        metadata: {
          relative_path: "corpus/images/ringworm/example.jpg",
        },
        similarity: 0.872,
      },
    ]);

    expect(formatted).toContain("ringworm");
    expect(formatted).toContain("87.2%");
    expect(formatted).toContain("Kaggle Dog Skin Dataset");
    expect(formatted).toContain("corpus/images/ringworm/example.jpg");
  });
});
