import { buildStructuredEvidenceChain } from "@/lib/evidence-chain";
import {
  addSymptoms,
  createSession,
  recordAnswer,
  type PetProfile,
} from "@/lib/triage-engine";

const greatDane: PetProfile = {
  name: "Milo",
  species: "dog",
  breed: "Great Dane",
  age_years: 7,
  weight: 118,
};

describe("buildStructuredEvidenceChain", () => {
  it("surfaces deterministic provenance-backed evidence before retrieval-only support", () => {
    let session = createSession();
    session = addSymptoms(session, ["swollen_abdomen", "vomiting"]);
    session = recordAnswer(session, "unproductive_retching", true);

    const items = buildStructuredEvidenceChain({
      session,
      pet: greatDane,
      highestUrgency: "emergency",
      retrievalBundle: {
        textChunks: [],
        imageMatches: [],
        rerankScores: [],
        sourceCitations: [],
      },
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source_kind).toBe("deterministic_rule");
    expect(items[0].claim_id).toBeDefined();
    expect(items[0].provenance_ids?.length).toBeGreaterThan(0);
    expect(items[0].evidence_tier).toBeDefined();
    expect(items[0].last_reviewed_at).toBe("2026-04-10");
  });
});
