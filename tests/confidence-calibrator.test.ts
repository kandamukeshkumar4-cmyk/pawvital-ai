import {
  calibrateDiagnosticConfidence,
  computeICD10MappingConfidence,
  computeCappedConfidence,
} from "../src/lib/confidence-calibrator";

describe("VET-900 Phase 6: Confidence Calibrator", () => {
  describe("calibrateDiagnosticConfidence", () => {
    const baseInput = {
      baseConfidence: 0.7,
      numSymptoms: 3,
      numAnswers: 4,
      numRedFlags: 0,
      urgencyLevel: "moderate" as const,
      hasModelDisagreement: false,
      imageQuality: "good" as const,
      hasRetrievalSupport: true,
      ambiguityFlags: [],
      numSidecarServicesAvailable: 5,
      sidecarAgreementRate: 0.9,
      hasICD10Mapping: true,
      breedKnown: true,
      ageKnown: true,
    };

    it("returns calibrated confidence with adjustments", () => {
      const result = calibrateDiagnosticConfidence(baseInput);
      expect(result.final_confidence).toBeGreaterThan(0);
      expect(result.final_confidence).toBeLessThanOrEqual(0.98);
      expect(result.adjustments.length).toBeGreaterThan(0);
      expect(result.confidence_level).toBeDefined();
      expect(result.recommendation).toBeTruthy();
    });

    it("increases confidence for strong evidence", () => {
      const result = calibrateDiagnosticConfidence({
        ...baseInput,
        numSymptoms: 5,
        numAnswers: 5,
        imageQuality: "excellent",
        sidecarAgreementRate: 0.95,
      });
      expect(result.final_confidence).toBeGreaterThan(baseInput.baseConfidence);
    });

    it("decreases confidence for model disagreement", () => {
      const result = calibrateDiagnosticConfidence({
        ...baseInput,
        hasModelDisagreement: true,
      });
      expect(result.final_confidence).toBeLessThan(
        calibrateDiagnosticConfidence(baseInput).final_confidence
      );
    });

    it("decreases confidence for poor image quality", () => {
      const goodImage = calibrateDiagnosticConfidence({
        ...baseInput,
        imageQuality: "good",
      });
      const poorImage = calibrateDiagnosticConfidence({
        ...baseInput,
        imageQuality: "poor",
      });
      expect(poorImage.final_confidence).toBeLessThan(goodImage.final_confidence);
    });

    it("penalizes ambiguity flags", () => {
      const noAmbiguity = calibrateDiagnosticConfidence({
        ...baseInput,
        ambiguityFlags: [],
      });
      const withAmbiguity = calibrateDiagnosticConfidence({
        ...baseInput,
        ambiguityFlags: ["not_sure", "maybe", "unclear"],
      });
      expect(withAmbiguity.final_confidence).toBeLessThan(noAmbiguity.final_confidence);
    });

    it("handles emergency urgency with decisive recommendation", () => {
      const result = calibrateDiagnosticConfidence({
        ...baseInput,
        urgencyLevel: "emergency",
        numRedFlags: 2,
      });
      expect(result.recommendation).toContain("Immediate veterinary attention");
    });

    it("returns very_low confidence for minimal evidence", () => {
      const result = calibrateDiagnosticConfidence({
        baseConfidence: 0.3,
        numSymptoms: 1,
        numAnswers: 0,
        numRedFlags: 0,
        urgencyLevel: "low",
        hasModelDisagreement: true,
        imageQuality: "poor",
        hasRetrievalSupport: false,
        ambiguityFlags: ["unclear", "vague", "contradictory"],
        numSidecarServicesAvailable: 1,
        sidecarAgreementRate: 0.5,
        hasICD10Mapping: false,
        breedKnown: false,
        ageKnown: false,
      });
      expect(result.confidence_level).toBe("very_low");
    });

    it("returns very_high confidence for strong evidence", () => {
      const result = calibrateDiagnosticConfidence({
        baseConfidence: 0.85,
        numSymptoms: 5,
        numAnswers: 5,
        numRedFlags: 1,
        urgencyLevel: "high",
        hasModelDisagreement: false,
        imageQuality: "excellent",
        hasRetrievalSupport: true,
        ambiguityFlags: [],
        numSidecarServicesAvailable: 5,
        sidecarAgreementRate: 1.0,
        hasICD10Mapping: true,
        breedKnown: true,
        ageKnown: true,
      });
      expect(result.confidence_level).toBe("very_high");
    });

    it("clamps confidence to valid range", () => {
      const result = calibrateDiagnosticConfidence({
        baseConfidence: 1.0,
        numSymptoms: 10,
        numAnswers: 10,
        numRedFlags: 5,
        urgencyLevel: "emergency",
        hasModelDisagreement: false,
        imageQuality: "excellent",
        hasRetrievalSupport: true,
        ambiguityFlags: [],
        numSidecarServicesAvailable: 5,
        sidecarAgreementRate: 1.0,
        hasICD10Mapping: true,
        breedKnown: true,
        ageKnown: true,
      });
      expect(result.final_confidence).toBeLessThanOrEqual(0.98);
      expect(result.final_confidence).toBeGreaterThanOrEqual(0.15);
    });

    it("includes ICD-10 mapping bonus", () => {
      const withICD10 = calibrateDiagnosticConfidence({
        ...baseInput,
        hasICD10Mapping: true,
      });
      const withoutICD10 = calibrateDiagnosticConfidence({
        ...baseInput,
        hasICD10Mapping: false,
      });
      expect(withICD10.final_confidence).toBeGreaterThan(withoutICD10.final_confidence);
    });

    it("rewards breed and age knowledge", () => {
      const fullKnowledge = calibrateDiagnosticConfidence({
        ...baseInput,
        breedKnown: true,
        ageKnown: true,
      });
      const noKnowledge = calibrateDiagnosticConfidence({
        ...baseInput,
        breedKnown: false,
        ageKnown: false,
      });
      expect(fullKnowledge.final_confidence).toBeGreaterThan(noKnowledge.final_confidence);
    });

    it("penalizes low sidecar agreement", () => {
      const lowAgreement = calibrateDiagnosticConfidence({
        ...baseInput,
        sidecarAgreementRate: 0.5,
      });
      const highAgreement = calibrateDiagnosticConfidence({
        ...baseInput,
        sidecarAgreementRate: 0.95,
      });
      expect(lowAgreement.final_confidence).toBeLessThan(highAgreement.final_confidence);
    });
  });

  describe("computeICD10MappingConfidence", () => {
    it("returns confidence for mapped diseases", () => {
      const confidence = computeICD10MappingConfidence("wound_infection");
      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(0.95);
    });

    it("returns higher confidence for specific codes", () => {
      const confidence = computeICD10MappingConfidence("cruciate_ligament_rupture");
      expect(confidence).toBeGreaterThanOrEqual(0.75);
    });

    it("returns 0 for unmapped diseases", () => {
      const confidence = computeICD10MappingConfidence("unknown_xyz");
      expect(confidence).toBe(0);
    });
  });

  describe("computeCappedConfidence (legacy)", () => {
    it("returns capped confidence for basic input", () => {
      const result = computeCappedConfidence({
        baseConfidence: 0.85,
        hasModelDisagreement: false,
        lowQualityImage: false,
        weakRetrievalSupport: false,
        ambiguityFlags: [],
      });
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(0.98);
    });

    it("reduces confidence for model disagreement", () => {
      const base = computeCappedConfidence({
        baseConfidence: 0.85,
        hasModelDisagreement: false,
      });
      const withDisagreement = computeCappedConfidence({
        baseConfidence: 0.85,
        hasModelDisagreement: true,
      });
      expect(withDisagreement).toBeLessThan(base);
    });

    it("reduces confidence for poor image quality", () => {
      const base = computeCappedConfidence({
        baseConfidence: 0.85,
        lowQualityImage: false,
      });
      const withPoorImage = computeCappedConfidence({
        baseConfidence: 0.85,
        lowQualityImage: true,
      });
      expect(withPoorImage).toBeLessThan(base);
    });

    it("handles null base confidence with default", () => {
      const result = computeCappedConfidence({
        baseConfidence: null,
      });
      expect(result).toBeGreaterThan(0.7); // Default is 0.82
    });

    it("caps ambiguity penalty at reasonable level", () => {
      const result = computeCappedConfidence({
        baseConfidence: 0.9,
        ambiguityFlags: ["a", "b", "c", "d", "e"],
      });
      expect(result).toBeGreaterThanOrEqual(0.35);
    });
  });
});
