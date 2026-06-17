import {
  normalizeOwnerTextForClinical,
  translateAssistantTextForOwner,
  translateReportForOwner,
  type TranslatorRouteFetch,
} from "@/lib/azure/translator-client";
import type { SymptomReport } from "@/components/symptom-report";

function makeFetch(payload: unknown): jest.MockedFunction<TranslatorRouteFetch> {
  return jest.fn(async () => ({
    json: async () => payload,
    ok: true,
    status: 200,
  }));
}

function makeReport(): SymptomReport {
  return {
    actions: ["Offer small amounts of water."],
    differential_diagnoses: [
      {
        condition: "Dietary indiscretion",
        description: "Recent food change can cause vomiting.",
        likelihood: "high",
      },
    ],
    explanation: "Buddy has vomiting without collapse.",
    recommendation: "vet_24h",
    severity: "medium",
    title: "Vomiting with moderate dehydration risk",
    vet_handoff_summary: "Buddy vomited three times today.",
    warning_signs: ["Repeated vomiting"],
  };
}

describe("azure translator client boundary", () => {
  it("normalizes non-English owner text for the clinical engine", async () => {
    const fetchTranslator = makeFetch({
      detectedLanguage: "es",
      enabled: true,
      sourceLanguage: null,
      targetLanguage: "en",
      translated: true,
      translations: ["Buddy is vomiting"],
    });

    await expect(
      normalizeOwnerTextForClinical("Buddy está vomitando", {
        fetchTranslator,
      }),
    ).resolves.toEqual({
      apiText: "Buddy is vomiting",
      displayText: "Buddy está vomitando",
      ownerLanguage: "es",
      translated: true,
    });

    expect(fetchTranslator).toHaveBeenCalledWith(
      "/api/azure/translator",
      expect.objectContaining({
        body: JSON.stringify({
          targetLanguage: "en",
          texts: ["Buddy está vomitando"],
        }),
        method: "POST",
      }),
    );
  });

  it("falls back to the original text when translation is disabled", async () => {
    const fetchTranslator = makeFetch({
      enabled: false,
      reason: "feature_disabled",
    });

    await expect(
      normalizeOwnerTextForClinical("Buddy está vomitando", {
        fetchTranslator,
      }),
    ).resolves.toEqual({
      apiText: "Buddy está vomitando",
      displayText: "Buddy está vomitando",
      ownerLanguage: null,
      translated: false,
    });
  });

  it("translates assistant display text while preserving English API text", async () => {
    const fetchTranslator = makeFetch({
      detectedLanguage: null,
      enabled: true,
      sourceLanguage: "en",
      targetLanguage: "es",
      translated: true,
      translations: ["¿Cuántas veces ha vomitado Buddy?"],
    });

    await expect(
      translateAssistantTextForOwner("How many times has Buddy vomited?", "es", {
        fetchTranslator,
      }),
    ).resolves.toEqual({
      apiText: "How many times has Buddy vomited?",
      displayText: "¿Cuántas veces ha vomitado Buddy?",
      ownerLanguage: "es",
      translated: true,
    });
  });

  it("translates report owner-facing fields without mutating clinical enums", async () => {
    const fetchTranslator = makeFetch({
      detectedLanguage: null,
      enabled: true,
      sourceLanguage: "en",
      targetLanguage: "es",
      translated: true,
      translations: [
        "Riesgo moderado de deshidratación por vómitos",
        "Buddy tiene vómitos sin colapso.",
        "Buddy vomitó tres veces hoy.",
        "Ofrezca pequeñas cantidades de agua.",
        "Vómitos repetidos",
        "Indiscreción alimentaria",
        "Un cambio reciente de comida puede causar vómitos.",
      ],
    });
    const report = makeReport();

    const translated = await translateReportForOwner(report, "es", {
      fetchTranslator,
    });

    expect(translated).toMatchObject({
      actions: ["Ofrezca pequeñas cantidades de agua."],
      differential_diagnoses: [
        {
          condition: "Indiscreción alimentaria",
          description: "Un cambio reciente de comida puede causar vómitos.",
          likelihood: "high",
        },
      ],
      explanation: "Buddy tiene vómitos sin colapso.",
      recommendation: "vet_24h",
      severity: "medium",
      title: "Riesgo moderado de deshidratación por vómitos",
      vet_handoff_summary: "Buddy vomitó tres veces hoy.",
      warning_signs: ["Vómitos repetidos"],
    });
    expect(report.title).toBe("Vomiting with moderate dehydration risk");
  });
});
