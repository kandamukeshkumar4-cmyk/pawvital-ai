import {
  capDiagnosticConfidence,
  inferSupportedImageDomain,
  supportsDomainText,
} from "@/lib/clinical-evidence";

describe("clinical evidence helpers", () => {
  it("infers supported image domains from owner text and symptom hints", () => {
    expect(inferSupportedImageDomain("his eye is red and goopy")).toBe("eye");
    expect(inferSupportedImageDomain("his ear smells bad")).toBe("ear");
    expect(inferSupportedImageDomain("this is what he threw up")).toBe(
      "stool_vomit"
    );
    expect(inferSupportedImageDomain("there is a raw wound on his leg")).toBe(
      "skin_wound"
    );
    expect(inferSupportedImageDomain("just a random couch photo")).toBe(
      "unsupported"
    );
  });

  it("caps diagnostic confidence when ambiguity and weak evidence are present", () => {
    expect(
      capDiagnosticConfidence({
        baseConfidence: 1.2,
        hasModelDisagreement: true,
        lowQualityImage: true,
        weakRetrievalSupport: true,
        ambiguityFlags: ["blur", "conflicting location"],
      })
    ).toBeLessThanOrEqual(0.98);
  });

  it("filters domain text conservatively", () => {
    expect(supportsDomainText("ringworm lesion on dog skin", "skin_wound")).toBe(
      true
    );
    expect(supportsDomainText("conjunctivitis around the eyelid", "eye")).toBe(
      true
    );
    expect(supportsDomainText("ocular discharge", "ear")).toBe(false);
  });
});
