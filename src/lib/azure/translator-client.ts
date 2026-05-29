import type { SymptomReport } from "@/components/symptom-report";

type MaybePromise<T> = T | Promise<T>;

export type TranslatorRouteFetch = (
  input: string,
  init: RequestInit,
) => MaybePromise<Pick<Response, "json" | "ok" | "status">>;

type TranslatorRouteResult =
  | {
      enabled: false;
      reason?: string;
    }
  | {
      detectedLanguage: string | null;
      enabled: true;
      sourceLanguage: string | null;
      targetLanguage: string;
      translated: boolean;
      translations: string[];
    };

export type OwnerTextNormalization = {
  apiText: string;
  displayText: string;
  ownerLanguage: string | null;
  translated: boolean;
};

type TranslateClientOptions = {
  fetchTranslator?: TranslatorRouteFetch;
};

type ReportStringAssignment = {
  assign(value: string): void;
  value: string;
};

const TRANSLATOR_ROUTE_BATCH_SIZE = 25;

function defaultFetchTranslator(
  input: string,
  init: RequestInit,
): Promise<Pick<Response, "json" | "ok" | "status">> {
  return fetch(input, init);
}

function isEnglish(language: string | null | undefined): boolean {
  return language?.toLowerCase().startsWith("en") ?? false;
}

function asTargetLanguage(language: string | null | undefined): string | null {
  const value = language?.trim();
  return value && !isEnglish(value) ? value : null;
}

async function requestTranslations(
  input: {
    sourceLanguage?: string | null;
    targetLanguage: string;
    texts: string[];
  },
  options: TranslateClientOptions = {},
): Promise<TranslatorRouteResult | null> {
  if (input.texts.length === 0) {
    return null;
  }

  try {
    const fetchTranslator = options.fetchTranslator ?? defaultFetchTranslator;
    const response = await fetchTranslator("/api/azure/translator", {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as TranslatorRouteResult;
  } catch {
    return null;
  }
}

async function requestTranslationBatches(
  input: {
    sourceLanguage?: string | null;
    targetLanguage: string;
    texts: string[];
  },
  options: TranslateClientOptions = {},
): Promise<string[] | null> {
  const translations: string[] = [];

  for (
    let start = 0;
    start < input.texts.length;
    start += TRANSLATOR_ROUTE_BATCH_SIZE
  ) {
    const result = await requestTranslations(
      {
        ...input,
        texts: input.texts.slice(start, start + TRANSLATOR_ROUTE_BATCH_SIZE),
      },
      options,
    );
    if (!result?.enabled) {
      return null;
    }
    translations.push(...result.translations);
  }

  return translations;
}

export async function normalizeOwnerTextForClinical(
  text: string,
  options: TranslateClientOptions = {},
): Promise<OwnerTextNormalization> {
  const displayText = text.trim();
  if (!displayText) {
    return {
      apiText: displayText,
      displayText,
      ownerLanguage: null,
      translated: false,
    };
  }

  const result = await requestTranslations(
    {
      targetLanguage: "en",
      texts: [displayText],
    },
    options,
  );
  if (!result?.enabled) {
    return {
      apiText: displayText,
      displayText,
      ownerLanguage: null,
      translated: false,
    };
  }

  const ownerLanguage = asTargetLanguage(result.detectedLanguage);
  const apiText = result.translations[0]?.trim() || displayText;
  return {
    apiText,
    displayText,
    ownerLanguage,
    translated: Boolean(ownerLanguage && apiText !== displayText),
  };
}

export async function translateAssistantTextForOwner(
  text: string,
  ownerLanguage: string | null,
  options: TranslateClientOptions = {},
): Promise<OwnerTextNormalization> {
  const apiText = text.trim();
  const targetLanguage = asTargetLanguage(ownerLanguage);
  if (!apiText || !targetLanguage) {
    return {
      apiText,
      displayText: apiText,
      ownerLanguage: null,
      translated: false,
    };
  }

  const result = await requestTranslations(
    {
      sourceLanguage: "en",
      targetLanguage,
      texts: [apiText],
    },
    options,
  );
  if (!result?.enabled) {
    return {
      apiText,
      displayText: apiText,
      ownerLanguage: targetLanguage,
      translated: false,
    };
  }

  const displayText = result.translations[0]?.trim() || apiText;
  return {
    apiText,
    displayText,
    ownerLanguage: targetLanguage,
    translated: displayText !== apiText,
  };
}

function pushAssignment(
  assignments: ReportStringAssignment[],
  value: string | undefined | null,
  assign: (value: string) => void,
) {
  const text = value?.trim();
  if (text) {
    assignments.push({ assign, value: text });
  }
}

function cloneReportForTranslation(report: SymptomReport): SymptomReport {
  return {
    ...report,
    actions: [...report.actions],
    warning_signs: [...report.warning_signs],
    limitations: report.limitations ? [...report.limitations] : undefined,
    vet_questions: report.vet_questions ? [...report.vet_questions] : undefined,
    differential_diagnoses: report.differential_diagnoses?.map((item) => ({
      ...item,
    })),
    recommended_tests: report.recommended_tests?.map((item) => ({ ...item })),
    home_care: report.home_care?.map((item) => ({ ...item })),
    calibrated_confidence: report.calibrated_confidence
      ? {
          ...report.calibrated_confidence,
          adjustments: report.calibrated_confidence.adjustments.map((item) => ({
            ...item,
          })),
        }
      : report.calibrated_confidence,
    confidence_calibration: report.confidence_calibration
      ? {
          ...report.confidence_calibration,
          adjustments: report.confidence_calibration.adjustments.map((item) => ({
            ...item,
          })),
        }
      : report.confidence_calibration,
    similar_cases: report.similar_cases?.map((item) => ({
      ...item,
      keyword_tags: [...item.keyword_tags],
    })),
    reference_images: report.reference_images?.map((item) => ({ ...item })),
    bayesian_differentials: report.bayesian_differentials?.map((item) => ({
      ...item,
    })),
  };
}

function collectReportAssignments(report: SymptomReport) {
  const assignments: ReportStringAssignment[] = [];

  pushAssignment(assignments, report.title, (value) => {
    report.title = value;
  });
  pushAssignment(assignments, report.explanation, (value) => {
    report.explanation = value;
  });
  pushAssignment(assignments, report.clinical_notes, (value) => {
    report.clinical_notes = value;
  });
  pushAssignment(assignments, report.vet_handoff_summary, (value) => {
    report.vet_handoff_summary = value;
  });

  report.actions.forEach((value, index) => {
    pushAssignment(assignments, value, (translated) => {
      report.actions[index] = translated;
    });
  });
  report.warning_signs.forEach((value, index) => {
    pushAssignment(assignments, value, (translated) => {
      report.warning_signs[index] = translated;
    });
  });
  report.limitations?.forEach((value, index) => {
    pushAssignment(assignments, value, (translated) => {
      report.limitations![index] = translated;
    });
  });
  report.vet_questions?.forEach((value, index) => {
    pushAssignment(assignments, value, (translated) => {
      report.vet_questions![index] = translated;
    });
  });

  report.differential_diagnoses?.forEach((item) => {
    pushAssignment(assignments, item.condition, (value) => {
      item.condition = value;
    });
    pushAssignment(assignments, item.description, (value) => {
      item.description = value;
    });
  });
  report.recommended_tests?.forEach((item) => {
    pushAssignment(assignments, item.test, (value) => {
      item.test = value;
    });
    pushAssignment(assignments, item.reason, (value) => {
      item.reason = value;
    });
  });
  report.home_care?.forEach((item) => {
    pushAssignment(assignments, item.instruction, (value) => {
      item.instruction = value;
    });
    pushAssignment(assignments, item.duration, (value) => {
      item.duration = value;
    });
    pushAssignment(assignments, item.details, (value) => {
      item.details = value;
    });
  });
  report.calibrated_confidence?.adjustments.forEach((item) => {
    pushAssignment(assignments, item.factor, (value) => {
      item.factor = value;
    });
    pushAssignment(assignments, item.reason, (value) => {
      item.reason = value;
    });
  });
  pushAssignment(
    assignments,
    report.calibrated_confidence?.recommendation,
    (value) => {
      if (report.calibrated_confidence) {
        report.calibrated_confidence.recommendation = value;
      }
    },
  );
  report.confidence_calibration?.adjustments.forEach((item) => {
    pushAssignment(assignments, item.factor, (value) => {
      item.factor = value;
    });
    pushAssignment(assignments, item.reason, (value) => {
      item.reason = value;
    });
  });
  pushAssignment(
    assignments,
    report.confidence_calibration?.recommendation,
    (value) => {
      if (report.confidence_calibration) {
        report.confidence_calibration.recommendation = value;
      }
    },
  );
  report.similar_cases?.forEach((item) => {
    pushAssignment(assignments, item.heading, (value) => {
      item.heading = value;
    });
    pushAssignment(assignments, item.body, (value) => {
      item.body = value;
    });
    item.keyword_tags.forEach((tag, index) => {
      pushAssignment(assignments, tag, (value) => {
        item.keyword_tags[index] = value;
      });
    });
  });
  report.reference_images?.forEach((item) => {
    pushAssignment(assignments, item.condition_label, (value) => {
      item.condition_label = value;
    });
    pushAssignment(assignments, item.caption, (value) => {
      item.caption = value;
    });
  });
  report.bayesian_differentials?.forEach((item) => {
    pushAssignment(assignments, item.condition, (value) => {
      item.condition = value;
    });
    pushAssignment(assignments, item.confidence, (value) => {
      item.confidence = value;
    });
  });

  return assignments;
}

export async function translateReportForOwner(
  report: SymptomReport,
  ownerLanguage: string | null,
  options: TranslateClientOptions = {},
): Promise<SymptomReport> {
  const targetLanguage = asTargetLanguage(ownerLanguage);
  if (!targetLanguage) {
    return report;
  }

  const translatedReport = cloneReportForTranslation(report);
  const assignments = collectReportAssignments(translatedReport);
  const translations = await requestTranslationBatches(
    {
      sourceLanguage: "en",
      targetLanguage,
      texts: assignments.map((assignment) => assignment.value),
    },
    options,
  );
  if (!translations) {
    return report;
  }

  translations.forEach((value, index) => {
    assignments[index]?.assign(value);
  });
  return translatedReport;
}
